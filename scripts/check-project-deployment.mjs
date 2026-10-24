import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {issueSession} from '../backend/auth.ts';
import {normalizePublishedCatalog} from '../lib/catalog-static.ts';

const root=new URL('../',import.meta.url);
const config=JSON.parse(await readFile(new URL('frontend.config.json',root),'utf8'));
const project=JSON.parse(await readFile(new URL('package.json',root),'utf8')).name;
const peer=new URL(`../${project==='tu-comida'?'burger-house-3':'tu-comida'}/`,root);
const secretPaths=['.env.backend-secrets.local.json','.env.catalog-secrets.local.json'];
const rawSecrets=await Promise.all(secretPaths.map(file=>readFile(new URL(file,root),'utf8')));
const [backend,editor]=rawSecrets.map(raw=>JSON.parse(raw));
const other=await Promise.all(secretPaths.map(async file=>JSON.parse(await readFile(new URL(file,peer),'utf8'))));
const digest=value=>createHash('sha256').update(value).digest('hex');
const origin=new URL(config.publicUrl).origin;
const request=async(url,token)=>fetch(url,{headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},cache:'no-store',signal:AbortSignal.timeout(20000)});
const requireStatus=(response,status,label)=>assert.equal(response.status,status,label);

assert.notEqual(backend.SESSION_SECRET,editor.SESSION_SECRET,'Las sesiones de gestión y editor deben estar separadas.');
for(let index=0;index<2;index++)assert.notEqual([backend,editor][index].SESSION_SECRET,other[index].SESSION_SECRET,'Los proyectos deben conservar sesiones independientes.');
const publicResponse=await request(config.catalogUrl);
requireStatus(publicResponse,200,'Catálogo público');
const rawCatalog=await publicResponse.text();
const catalog=normalizePublishedCatalog(JSON.parse(rawCatalog));
const ownTokens=await Promise.all([backend,editor].map(secrets=>issueSession(secrets.SESSION_SECRET)));
const peerTokens=await Promise.all(other.map(secrets=>issueSession(secrets.SESSION_SECRET)));
const stateResponse=await request(config.apiBaseUrl+'/api/admin',ownTokens[0]);
requireStatus(stateResponse,200,'Gestión autenticada');
const state=await stateResponse.json();
assert.ok(Array.isArray(state.orders)&&Array.isArray(state.products)&&state.cash,'Estado de gestión válido');
const editorResponse=await request(config.publisherUrl+'/catalog',ownTokens[1]);
requireStatus(editorResponse,200,'Editor autenticado');
const snapshot=await editorResponse.json();
assert.equal(snapshot.revision,digest(rawCatalog),'El editor debe recuperar el catálogo vigente de su comercio.');
assert.deepEqual(normalizePublishedCatalog(snapshot.catalog),catalog);
for(const [label,url,token] of [
 ['gestión sin sesión',config.apiBaseUrl+'/api/admin',null],
 ['editor sin sesión',config.publisherUrl+'/catalog',null],
 ['gestión con sesión de otro comercio',config.apiBaseUrl+'/api/admin',peerTokens[0]],
 ['editor con sesión de otro comercio',config.publisherUrl+'/catalog',peerTokens[1]],
 ['gestión con sesión del editor',config.apiBaseUrl+'/api/admin',ownTokens[1]],
 ['editor con sesión de gestión',config.publisherUrl+'/catalog',ownTokens[0]],
]){
 const response=await request(url,token);requireStatus(response,401,label);await response.body?.cancel();
}
for(const url of [config.publicUrl,config.publicUrl+'editar/',config.managementUrl]){
 const response=await request(url);requireStatus(response,200,'Pantalla pública');await response.body?.cancel();
}
const current={project,catalog:digest(JSON.stringify(catalog)),state:digest(JSON.stringify(state)),credentials:rawSecrets.map(digest),orders:state.orders.length,products:catalog.products.length};
const baselineFile=new URL('.private/deployment-baseline.json',root);
if(process.argv.includes('--baseline')){
 await mkdir(new URL('.private/',root),{recursive:true});
 await writeFile(baselineFile,JSON.stringify(current,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({project,baselineSaved:true,authentication:'verified',crossProjectSessions:'rejected',editorAndManagementSessions:'isolated',products:current.products,orders:current.orders,dataMutations:0}));
}else{
 const before=JSON.parse(await readFile(baselineFile,'utf8'));
 const preservation={catalog:before.catalog===current.catalog,operationalState:before.state===current.state,localCredentials:JSON.stringify(before.credentials)===JSON.stringify(current.credentials)};
 console.log(JSON.stringify({project,authentication:'verified',crossProjectSessions:'rejected',publishingAvailable:snapshot.publishingAvailable,preservation,dataMutations:0}));
 assert.ok(Object.values(preservation).every(Boolean),'Hay cambios respecto de la línea base; revisar antes de declarar conservación.');
}
