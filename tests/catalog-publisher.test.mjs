import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, sha256, verifySession } from '../backend/auth.ts';
import { connectPublication, currentCatalog, openToken, publishCatalog, publisherToken, sealToken } from '../backend/catalog-publisher.ts';
import editor from '../backend/catalog-worker.ts';

const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
const json=(value,status=200)=>Response.json(value,{status});
const secret='isolated-catalog-editor-session-secret-for-tests';
const apiToken='secret-cloudflare-publish-token-for-tests';
const password='catalog-password-for-tests';
const frontend='https://catalog.test';

class EditorD1 {
  settings=new Map();attempts=new Map();queries=[];renewals=0;loseOnRenewal=0;
  prepare(sql){
    this.queries.push(sql);const db=this;
    return {bind(...values){return {
      async first(){
        if(sql.startsWith('SELECT value FROM catalog_editor_settings'))return db.settings.get(values[0])??null;
        if(sql.startsWith('INSERT INTO catalog_editor_settings')){
          const [id,value,lockedUntil,now]=values,current=db.settings.get(id);
          if(current&&current.locked_until>=now)return null;
          const row={value,locked_until:lockedUntil};db.settings.set(id,row);return row;
        }
        if(sql.startsWith('UPDATE catalog_editor_settings')){
          db.renewals++;
          const [until,id,value,now]=values,current=db.settings.get(id);
          if(db.loseOnRenewal===db.renewals){db.settings.set(id,{value:'another-publication',locked_until:until});return null;}
          if(!current||current.value!==value||current.locked_until<=now)return null;
          current.locked_until=until;return current;
        }
        if(sql.startsWith('INSERT INTO login_attempts')){
          const [id,now]=values,current=db.attempts.get(id);
          const row=!current||now-current.started_at>=300000?{failures:1,started_at:now}:{...current,failures:current.failures+1};db.attempts.set(id,row);return row;
        }
        throw new Error(`Unexpected first query: ${sql}`);
      },
      async run(){
        if(sql.startsWith('INSERT INTO catalog_editor_settings')){db.settings.set(values[0],{value:values[1],locked_until:0});return {meta:{changes:1}};}
        if(sql.startsWith('DELETE FROM catalog_editor_settings')){
          const current=db.settings.get(values[0]);if(current?.value===values[1])db.settings.delete(values[0]);return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM login_attempts')){db.attempts.delete(values[0]);return {meta:{changes:1}};}
        throw new Error(`Unexpected run query: ${sql}`);
      },
    };}};
  }
}
function menu(){return {
  config:{name:'Burger House 3',tagline:'Hechas con amor',whatsapp:'5491172789289',instagram:'bh3',deliveryFee:0,deliveryFeeMode:'quote',deliveryZone:'Marcos Paz',acceptingOrders:true},
  ingredients:[],products:[{id:'clasica',name:'Clásica',category:'hamburguesas',description:'Nuestra burger',image:'/images/clasica.webp',active:true,available:true,recipe:[],extras:[],variants:[{id:'simple',name:'Simple',price:10000,patties:1,available:true}]}],
};}
async function setup(options={}){
  const DB=new EditorD1();
  const env={DB,FRONTEND_URL:frontend,CLOUDFLARE_ACCOUNT_ID:'account-test',CATALOG_WORKER_NAME:'catalog-test',CATALOG_PUBLISH_TOKEN:apiToken,ADMIN_PASSWORD_SHA256:await sha256(password),SESSION_SECRET:secret};
  const catalog=menu(),assets=new Map([
    ['/index.html',{text:'<!doctype html><script src="/assets/app-123.js"></script>',type:'text/html'}],
    ['/editar/index.html',{text:'<!doctype html><script src="/assets/app-123.js"></script>',type:'text/html'}],
    ['/assets/app-123.js',{text:'console.log("catalog and editor");',type:'text/javascript'}],
    ['/assets/app-123.css',{text:'body{color:red}',type:'text/css'}],
    ['/images/clasica.webp',{text:'RIFF0000WEBP',type:'image/webp'}],
  ]);
  const manifest={};
  for(const [path,asset] of assets)manifest[path]={hash:(await sha256(asset.text)).slice(0,32),size:new TextEncoder().encode(asset.text).length};
  manifest['/catalog.json']={hash:(await sha256(JSON.stringify(catalog,null,2))).slice(0,32),size:JSON.stringify(catalog,null,2).length};
  // Older versions included this entry. It must never survive inside a new index.
  manifest['/publication-manifest.json']={hash:'stale-self-entry',size:0};
  const state={raw:JSON.stringify(catalog,null,2),source:{format:1,manifest},sessionManifest:null,uploads:new Map(),deployments:[],requests:[],assetRequests:[],...options};
  const fetcher=async(url,init={})=>{
    const target=new URL(url);state.requests.push({url:target.href,method:init.method??'GET',authorization:new Headers(init.headers).get('authorization')});
    if(target.origin===frontend){
      if(target.pathname==='/catalog.json')return new Response(state.raw,{headers:{'content-type':'application/json; charset=utf-8'}});
      if(target.pathname==='/publication-manifest.json')return json(state.source);
      const asset=assets.get(target.pathname);if(!asset)throw new Error(`Unexpected public path: ${target.pathname}`);
      state.assetRequests.push(target.pathname);return new Response(asset.text,{headers:{'content-type':asset.type}});
    }
    assert.equal(target.origin,'https://api.cloudflare.com');
    if(target.pathname.endsWith('/settings')){
      assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${apiToken}`);
      return json({success:true,result:{id:'catalog-test'}});
    }
    if(target.pathname.endsWith('/assets-upload-session')){
      assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${apiToken}`);
      state.sessionManifest=JSON.parse(init.body).manifest;
      if(state.beforeSession)await state.beforeSession();
      const paths=state.allAssets?Object.keys(state.sessionManifest):['/catalog.json','/publication-manifest.json'];
      const hashes=[...new Set(paths.map(path=>state.sessionManifest[path].hash))];
      return json({success:true,result:{jwt:'upload-jwt-private',buckets:state.emptyBuckets?[]:[hashes]}});
    }
    if(target.pathname.endsWith('/assets/upload')){
      assert.equal(target.search,'?base64=true');assert.equal(new Headers(init.headers).get('authorization'),'Bearer upload-jwt-private');
      if(state.failUpload)return json({success:false,errors:[{message:`provider-internal ${apiToken} DB-secret`}]},429);
      for(const [hash,file] of init.body.entries())state.uploads.set(hash,{bytes:Buffer.from(await file.text(),'base64'),type:file.type});
      return json({success:true,result:state.missingCompletion?{}:{jwt:'completion-jwt-private'}},201);
    }
    if(init.method==='PUT'&&target.pathname.endsWith('/scripts/catalog-test')){
      assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${apiToken}`);
      const metadata=JSON.parse(await init.body.get('metadata').text());
      assert.equal(metadata.assets.jwt,state.emptyBuckets?'upload-jwt-private':'completion-jwt-private');
      if(state.failDeployment)return json({success:false,errors:[{message:`private ${apiToken}`}]},400);
      state.deployments.push(metadata);
      const uploaded=state.uploads.get(state.sessionManifest['/catalog.json'].hash);if(uploaded)state.raw=uploaded.bytes.toString('utf8');
      return json({success:true,result:{id:'catalog-test'}});
    }
    throw new Error(`Unexpected Cloudflare operation: ${target.pathname}`);
  };
  return {env,DB,catalog,assets,state,fetcher,revision:await sha256(state.raw)};
}
async function request(path,{token,body,origin=frontend,method=body===undefined?'GET':'POST',contentType='application/json',extraHeaders={}}={}){
  return new Request(`https://publisher.test${path}`,{method,headers:{...(origin?{origin}:{}),...(token?{authorization:`Bearer ${token}`} :{}),...(body===undefined?{}:{'content-type':contentType}),...extraHeaders},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}

test('AES-GCM cifra con IV distinto y rechaza manipulación o clave incorrecta',async()=>{
  const first=await sealToken(apiToken,secret),second=await sealToken(apiToken,secret);
  assert.notEqual(first,second);assert.ok(!first.includes(apiToken));assert.equal(await openToken(first,secret),apiToken);
  await assert.rejects(openToken(first,secret+'wrong'));
  const [iv,data]=first.split('.');await assert.rejects(openToken(`${iv}.${data[0]==='A'?'B':'A'}${data.slice(1)}`,secret));
  await assert.rejects(openToken(first+'.extra',secret));
});

test('conectar verifica permisos y sólo almacena el token cifrado',async()=>{
  const {env,DB,fetcher}=await setup();delete env.CATALOG_PUBLISH_TOKEN;
  await connectPublication(env,apiToken,fetcher);
  assert.ok(!DB.settings.get('publish-token').value.includes(apiToken));
  assert.equal(await publisherToken(env),apiToken);
  assert.ok(DB.queries.every(sql=>!sql.includes('commerce_stores')));
});

test('currentCatalog valida JSON y conserva el hash de los bytes originales',async()=>{
  const {env,fetcher,revision}=await setup();
  assert.equal((await currentCatalog(env,fetcher)).revision,revision);
  for(const response of [new Response('{}',{headers:{'content-type':'text/html'}}),new Response('private-invalid-json',{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':String(21*1024*1024)}}),json({orders:[],password:'provider-private'})]){
    await assert.rejects(currentCatalog(env,async()=>response),error=>error.status===502&&!error.message.includes('provider-private'));
  }
  const huge=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20*1024*1024+1));controller.close();}});
  await assert.rejects(currentCatalog(env,async()=>new Response(huge,{headers:{'content-type':'application/json'}})),error=>error.status===502);
});

test('publicar conserva HTML, JS y assets y sube precio/foto nuevos con índice sin self-entry',async()=>{
  const {env,catalog,state,fetcher,revision,DB}=await setup({allAssets:true});
  catalog.products[0].variants[0].price=12345;
  catalog.products[0].image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cK/8AAAAASUVORK5CYII=';
  const published=await publishCatalog(env,catalog,revision,fetcher);
  assert.equal(state.deployments.length,1);assert.equal(published.url,`${frontend}/`);assert.ok(published.publishedAt);
  assert.ok(state.sessionManifest['/assets/app-123.js']);assert.ok(state.sessionManifest['/assets/app-123.css']);assert.ok(state.sessionManifest['/editar/index.html']);
  const bytes=state.uploads.get(state.sessionManifest['/catalog.json'].hash).bytes;
  const uploaded=JSON.parse(bytes.toString('utf8'));
  assert.equal(uploaded.products[0].variants[0].price,12345);assert.equal(uploaded.products[0].image,catalog.products[0].image);
  assert.equal(published.revision,await sha256(bytes.toString('utf8')));
  const index=JSON.parse(state.uploads.get(state.sessionManifest['/publication-manifest.json'].hash).bytes.toString('utf8'));
  assert.equal(index.manifest['/publication-manifest.json'],undefined);
  assert.equal(index.manifest['/catalog.json'].hash,published.revision.slice(0,32));
  assert.ok(state.assetRequests.includes('/assets/app-123.js'));assert.equal(DB.settings.has('publication-lock'),false);
  const response=JSON.stringify(published);for(const sensitive of [apiToken,'upload-jwt-private','completion-jwt-private',secret])assert.ok(!response.includes(sensitive));
});

test('sin archivos pendientes usa el completion token de sesión y no inventa uploads',async()=>{
  const {env,catalog,state,fetcher,revision}=await setup({emptyBuckets:true});
  await publishCatalog(env,catalog,revision,fetcher);
  assert.equal(state.uploads.size,0);assert.equal(state.deployments.length,1);
});

test('publicar desde Scalaris conserva /burger-house-3/ para catálogo, índice y recursos recuperados',async()=>{
  const fixture=await setup({allAssets:true});
  const publicBase='https://scalaris.com.ar/burger-house-3';
  fixture.env.FRONTEND_URL=publicBase;
  const publicRequests=[];
  const proxyFetcher=async(url,init)=>{
    const target=new URL(url);
    if(target.origin==='https://scalaris.com.ar'){
      assert.ok(target.pathname.startsWith('/burger-house-3/'),'Nunca consultar archivos de la raíz de Scalaris');
      publicRequests.push(target.pathname);
      const upstream=new URL(target.pathname.slice('/burger-house-3'.length)+target.search,frontend);
      return fixture.fetcher(upstream,init);
    }
    return fixture.fetcher(url,init);
  };
  assert.equal((await currentCatalog(fixture.env,proxyFetcher)).revision,fixture.revision);
  fixture.catalog.products[0].variants[0].price=12500;
  const result=await publishCatalog(fixture.env,fixture.catalog,fixture.revision,proxyFetcher);
  assert.equal(result.url,`${publicBase}/`);
  for(const path of ['/burger-house-3/catalog.json','/burger-house-3/publication-manifest.json','/burger-house-3/assets/app-123.js'])assert.ok(publicRequests.includes(path),path);
  assert.ok(fixture.state.sessionManifest['/editar/index.html']);
  assert.equal(fixture.state.deployments.length,1);
});

test('publicaciones simultáneas usan bloqueo CAS y el segundo no borra el bloqueo del primero',async()=>{
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const {env,catalog,state,fetcher,revision,DB}=await setup({beforeSession:async()=>{started();await gate;}});
  const first=publishCatalog(env,catalog,revision,fetcher);await ready;
  await assert.rejects(publishCatalog(env,catalog,revision,fetcher),error=>error.status===409&&/en curso/.test(error.message));
  assert.ok(DB.settings.has('publication-lock'));release();await first;
  assert.equal(state.deployments.length,1);assert.equal(DB.settings.has('publication-lock'),false);
});

test('revisión desactualizada o bloqueo perdido no despliegan ni pisan otra publicación',async()=>{
  const first=await setup();await assert.rejects(publishCatalog(first.env,first.catalog,'0'.repeat(64),first.fetcher),error=>error.status===409);
  assert.equal(first.state.deployments.length,0);assert.equal(first.state.requests.some(item=>item.url.includes('api.cloudflare.com')),false);assert.equal(first.DB.settings.has('publication-lock'),false);
  const second=await setup();second.DB.loseOnRenewal=3;
  await assert.rejects(publishCatalog(second.env,second.catalog,second.revision,second.fetcher),error=>error.status===409);
  assert.equal(second.state.deployments.length,0);assert.equal(second.DB.settings.get('publication-lock').value,'another-publication');
});

test('detecta cambios remotos ocurridos mientras se subían archivos',async()=>{
  const fixture=await setup({beforeSession:async()=>{const changed=menu();changed.products[0].variants[0].price=99999;fixture.state.raw=JSON.stringify(changed);}});
  await assert.rejects(publishCatalog(fixture.env,fixture.catalog,fixture.revision,fixture.fetcher),error=>error.status===409&&/durante/.test(error.message));
  assert.equal(fixture.state.deployments.length,0);
});

test('token ausente, fallos proveedor y completion ausente jamás informan publicación exitosa',async()=>{
  const missing=await setup();delete missing.env.CATALOG_PUBLISH_TOKEN;
  await assert.rejects(publishCatalog(missing.env,missing.catalog,missing.revision,missing.fetcher),error=>error.status===503);
  assert.equal(missing.state.requests.length,0);
  for(const options of [{failUpload:true},{failDeployment:true},{missingCompletion:true}]){
    const {env,catalog,state,fetcher,revision,DB}=await setup(options);
    await assert.rejects(publishCatalog(env,catalog,revision,fetcher),error=>error.status===502&&!error.message.includes(apiToken)&&!error.message.includes('DB-secret'));
    assert.equal(state.deployments.length,0);assert.equal(DB.settings.has('publication-lock'),false);
  }
});

test('el índice sólo admite assets públicos y rechaza administración, fuentes y rutas manipuladas',async()=>{
  for(const path of ['/admin/index.html','/admin/nuevo/index.html','/api/private.json','/assets/source.ts','/assets/app.js.map','/.env','/images/evil.html','//evil.test/x.js','/assets/../private.js']){
    const {env,catalog,state,fetcher,revision}=await setup();state.source.manifest[path]={hash:'a'.repeat(32),size:1};
    await assert.rejects(publishCatalog(env,catalog,revision,fetcher),error=>error.status===502&&/índice/.test(error.message));
    assert.equal(state.deployments.length,0);
  }
});

test('el editor exige sesión propia y rechaza orígenes ajenos sin consultar datos',async()=>{
  const {env,DB}=await setup();
  let response=await editor.fetch(await request('/catalog'),env);assert.equal(response.status,401);assert.equal(DB.queries.length,0);
  const managementToken=await issueSession('different-management-secret');
  response=await editor.fetch(await request('/catalog',{token:managementToken}),env);assert.equal(response.status,401);assert.equal(DB.queries.length,0);
  response=await editor.fetch(await request('/catalog',{origin:'https://evil.test'}),env);assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
  response=await editor.fetch(await request('/catalog',{method:'OPTIONS'}),env);assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),frontend);
});

test('login limita intentos y entrega sesión del editor sin modificar las tablas de gestión',async()=>{
  const {env,DB}=await setup();
  let response=await editor.fetch(await request('/session',{body:{password}}),env);
  assert.equal(response.status,200);const session=await response.json();assert.equal(await verifySession(session.token,secret),true);
  assert.ok(!JSON.stringify(session).includes(password));
  for(let index=0;index<5;index++){response=await editor.fetch(await request('/session',{body:{password:'wrong'}}),env);assert.equal(response.status,401);}
  response=await editor.fetch(await request('/session',{body:{password}}),env);assert.equal(response.status,429);
  assert.ok(DB.queries.every(sql=>!sql.includes('commerce_stores')));
});

test('respuestas del editor nunca incluyen claves de Cloudflare, cifrados o detalles internos',async()=>{
  const {env,fetcher}=await setup();globalThis.fetch=fetcher;
  const token=await issueSession(secret);
  let response=await editor.fetch(await request('/catalog',{token}),env);
  assert.equal(response.status,200);let content=await response.text();assert.ok(content.includes('publishingAvailable'));
  for(const sensitive of [apiToken,secret,env.ADMIN_PASSWORD_SHA256])assert.ok(!content.includes(sensitive));
  env.DB={prepare(){throw new Error(`D1-internal ${apiToken} ${secret}`);}};delete env.CATALOG_PUBLISH_TOKEN;
  response=await editor.fetch(await request('/catalog',{token}),env);assert.equal(response.status,500);content=await response.text();
  assert.ok(!content.includes(apiToken));assert.ok(!content.includes(secret));assert.ok(!content.includes('D1-internal'));
  globalThis.fetch=async()=>{throw new Error(`provider-internal ${apiToken}`);};
  response=await editor.fetch(await request('/catalog',{token}),env);assert.equal(response.status,500);assert.ok(!(await response.text()).includes('provider-internal'));
});

test('solicitudes inválidas reciben errores controlados de formato y tamaño',async()=>{
  const {env}=await setup(),token=await issueSession(secret);
  for(const [options,status] of [[{body:{password},contentType:'application/json-evil'},415],[{body:'invalid-json'},400],[{body:{password,extra:'x'}},400],[{body:{password},extraHeaders:{'content-length':'4097'}},413],[{body:{password},origin:null},403]]){
    const response=await editor.fetch(await request('/session',options),env);assert.equal(response.status,status);
  }
  const response=await editor.fetch(await request('/connection',{token,body:{apiToken,extra:'x'}}),env);assert.equal(response.status,400);
});
