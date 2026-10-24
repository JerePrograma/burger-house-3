import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Local OAuth remains local. Only a dedicated, scoped token is ever installed
// in the mobile publisher. The CI token is supplied through the environment.
const root=new URL('../',import.meta.url);
const config=JSON.parse(await readFile(new URL('backend/frontend-wrangler.jsonc',root),'utf8'));
const frontend=JSON.parse(await readFile(new URL('frontend.config.json',root),'utf8'));
const arguments_=process.argv.slice(2);
if(arguments_.some(argument=>argument!=='--bootstrap'))throw new Error('La única opción de publicación disponible es --bootstrap para un Worker nuevo.');
const bootstrap=arguments_.includes('--bootstrap');
let token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){
  try {
    const output=execFileSync(process.execPath,[fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js',root)),'auth','token','--json'],{cwd:fileURLToPath(root),encoding:'utf8',stdio:['ignore','pipe','pipe']});
    token=JSON.parse(output).token;
  }catch{throw new Error('Iniciá sesión en Cloudflare para publicar el catálogo.');}
  if(typeof token!=='string')throw new Error('Iniciá sesión en Cloudflare para publicar el catálogo.');
}
let expected;
if(!bootstrap){
  try{expected=JSON.parse(await readFile(new URL('.catalog-deploy-base.json',root),'utf8'));}
  catch{throw new Error('Primero ejecutá frontend:deploy para recuperar el catálogo vigente. Para un Worker nuevo, compilá y usá frontend:publish -- --bootstrap.');}
  if(typeof expected?.sourceUrl!=='string'||!/^[a-f0-9]{64}$/.test(expected?.revision))throw new Error('Falta una revisión verificada del catálogo. Ejecutá frontend:deploy; para un Worker nuevo usá frontend:publish -- --bootstrap.');
}
async function verifyRevision(){
  if(bootstrap)return verifyBootstrap();
  const current=await fetch(expected.sourceUrl,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!current.ok||createHash('sha256').update(await current.text()).digest('hex')!==expected.revision)throw new Error('El catálogo cambió desde un celular durante la compilación. Repetí frontend:deploy para preservar esa edición.');
}
const base=`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers`;
async function api(path,authorization,init={},allowMissing=false){
  const response=await fetch(`${base}${path}`,{...init,headers:{...init.headers,Authorization:`Bearer ${authorization}`},signal:AbortSignal.timeout(120000)});
  let result;
  try{result=await response.json();}catch{throw new Error(`Cloudflare no confirmó la publicación (HTTP ${response.status}). No se imprimen datos de la credencial.`);}
  if(!response.ok||result.success===false){
    if(allowMissing&&result.errors?.some(error=>error.code===10007))return null;
    throw new Error(`Cloudflare rechazó la publicación (HTTP ${response.status}). No se imprimen datos de la credencial.`);
  }
  return result.result;
}
async function verifyBootstrap(){
  if(typeof frontend.upstreamCatalogUrl!=='string')throw new Error('Configurá upstreamCatalogUrl antes de la primera publicación.');
  let current;
  try{current=await fetch(frontend.upstreamCatalogUrl,{cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{}
  if(current?.ok)throw new Error('El catálogo ya existe. Usá frontend:deploy para conservar los cambios publicados desde el celular.');
  if(current?.status===404)return;
  if(await api(`/scripts/${config.name}/settings`,token,{},true)===null)return;
  throw new Error('No se pudo confirmar un Worker nuevo. La publicación se detuvo para preservar el catálogo existente.');
}
const dist=new URL('dist-cloudflare/',root);
const raw=await readFile(new URL('publication-manifest.json',dist));
const publication=JSON.parse(raw.toString('utf8'));
if(publication.format!==1||!publication.manifest)throw new Error('Compilá el catálogo antes de publicarlo.');
const manifest={...publication.manifest,'/publication-manifest.json':{hash:createHash('sha256').update(raw).digest('hex').slice(0,32),size:raw.length}};
await verifyRevision();
const session=await api(`/scripts/${config.name}/assets-upload-session`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest})});
let completion=session.buckets.length?null:session.jwt;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff'};
for(const bucket of session.buckets){
  const form=new FormData();
  for(const hash of bucket){
    const [path,asset]=Object.entries(manifest).find(([,value])=>value.hash===hash)||[];
    if(!path)throw new Error('El proveedor solicitó un archivo desconocido.');
    const bytes=await readFile(new URL(path.slice(1),dist));
    if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex').slice(0,32)!==hash)throw new Error('La compilación cambió mientras se publicaba. Volvé a compilar.');
    const extension=path.slice(path.lastIndexOf('.'));
    form.append(hash,new Blob([bytes.toString('base64')],{type:types[extension]||'application/octet-stream'}),hash);
  }
  const result=await api('/assets/upload?base64=true',session.jwt,{method:'POST',body:form});
  if(result.jwt)completion=result.jwt;
}
if(!completion)throw new Error('Cloudflare no confirmó la carga completa de archivos.');
await verifyRevision();
const deploy=new FormData();
const headerRules=await readFile(new URL('_headers',dist),'utf8');
deploy.set('metadata',new Blob([JSON.stringify({compatibility_date:config.compatibility_date,assets:{jwt:completion,config:{html_handling:config.assets.html_handling,not_found_handling:config.assets.not_found_handling,_headers:headerRules}}})],{type:'application/json'}));
await api(`/scripts/${config.name}`,token,{method:'PUT',body:deploy});
await api(`/scripts/${config.name}/subdomain`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:config.workers_dev===true,previews_enabled:false})});
console.log(`Catálogo estático publicado: ${config.name}. ${Object.keys(manifest).length} archivos; edición móvil conserva los mismos recursos.`);
