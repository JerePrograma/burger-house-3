import { CommerceError, applyAdminAction, createIdempotentOrder, parseAdminAction, parseOrderInput, publicCatalog, publicOrder, trackedOrder } from '../lib/commerce';
import { StoreRepository } from '../lib/repository';
import { createSeed } from '../lib/seed';
import { issueSession, safeReturn, sha256, verifySession } from './auth';

export interface Env { DB:D1Database; FRONTEND_URL:string; ADMIN_PASSWORD_SHA256:string; SESSION_SECRET:string; NATIVE_ORIGINS?:string; }
const storeId = 'burger-house-3-catalogo-20261019-v2';
const privateHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json = (value:unknown,status=200) => Response.json(value,{status,headers:privateHeaders});
// Native origins are an explicit opt-in. Never trust arbitrary localhost ports,
// custom schemes, null origins, or values supplied by the request itself.
function nativeOriginAllowed(origin:string|null,env:Env):boolean {
  return origin==='https://localhost' && (env.NATIVE_ORIGINS??'').split(',').map(value=>value.trim()).includes(origin);
}
function apiOriginAllowed(origin:string|null,env:Env):boolean {
  return origin===new URL(env.FRONTEND_URL).origin || nativeOriginAllowed(origin,env);
}

async function readJson(request:Request):Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new CommerceError('El formato de envío no es válido.',415);
  const text = await request.text();
  if (text.length>65536) throw new CommerceError('El envío es demasiado grande.',413);
  try{return JSON.parse(text);}catch{throw new CommerceError('No se pudo leer el envío.');}
}
async function requireAdmin(request:Request,env:Env) {
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if (!env.SESSION_SECRET || !await verifySession(token,env.SESSION_SECRET)) throw new CommerceError('Ingresá al panel para administrar el local.',401);
}
async function checkPassword(request:Request,env:Env,password:string):Promise<'valid'|'invalid'|'limited'> {
  // Both the hosted form and the packaged application share the same bucket.
  const attemptKey=await sha256(request.headers.get('cf-connecting-ip')||'local');
  const now=Date.now();
  // Reserve the attempt atomically, so simultaneous requests cannot all pass a
  // read-before-write check and each consume the same remaining slot.
  const attempts=await env.DB.prepare('INSERT INTO login_attempts (id,failures,started_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET failures=CASE WHEN ?-started_at>=300000 THEN 1 ELSE failures+1 END, started_at=CASE WHEN ?-started_at>=300000 THEN ? ELSE started_at END RETURNING failures, started_at').bind(attemptKey,now,now,now,now).first<{failures:number;started_at:number}>();
  if(!attempts)throw new CommerceError('No se pudo verificar el acceso. Intentá nuevamente.',503);
  if(attempts.failures>5)return 'limited';
  if(await sha256(password)!==env.ADMIN_PASSWORD_SHA256) {
    return 'invalid';
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE id=?').bind(attemptKey).run();
  return 'valid';
}
async function nativeLogin(request:Request,env:Env):Promise<Response> {
  if(!nativeOriginAllowed(request.headers.get('origin'),env))throw new CommerceError('Origen no permitido.',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  if(!env.SESSION_SECRET||!env.ADMIN_PASSWORD_SHA256)throw new CommerceError('El acceso todavía no está configurado.',503);
  const data=await readJson(request);
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==1||!Object.hasOwn(data,'password'))throw new CommerceError('Enviá únicamente la clave de administradora.');
  const password=(data as {password:unknown}).password;
  if(typeof password!=='string'||password.length<1||password.length>200)throw new CommerceError('La clave debe tener entre 1 y 200 caracteres.');
  const result=await checkPassword(request,env,password);
  if(result==='limited')return json({error:'Demasiados intentos. Esperá cinco minutos.'},429);
  if(result==='invalid')return json({error:'La clave no es correcta.'},401);
  return json({token:await issueSession(env.SESSION_SECRET)});
}
const escape = (text:string) => text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function loginPage(returnTo:string,error='') {
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Acceso al local · Burger House 3</title><style>*{box-sizing:border-box}html{background:#11100e}body{margin:0;background:#11100e;color:#f7f2e8;font:16px Arial;display:flex;flex-direction:column;align-items:center;min-height:100vh;min-height:100dvh;padding:24px 16px;padding:max(24px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(24px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}main{width:min(100%,440px);min-width:0;margin-block:auto;padding:clamp(20px,5vw,36px);border:1px solid #453b28;border-radius:16px;background:#1b1916;overflow-wrap:anywhere;flex-shrink:0}small{color:#ffc52b;letter-spacing:1.5px;font-size:11px;line-height:1.6}h1{font-family:Impact,Arial;font-size:clamp(30px,6vw,40px);line-height:1.15;font-weight:400;margin:20px 0}p{color:#b7aa96;font-size:14px;line-height:1.7}form,label{min-width:0}label{font-size:14px;line-height:1.5}input,button{width:100%;min-width:0;min-height:48px;padding:14px;margin:12px 0;border-radius:7px;border:1px solid #6a5939;font:inherit;font-size:16px}input{background:#262017;color:#fff}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #ffc52b;outline-offset:3px}button{background:#ffc52b;color:#211707;font-weight:bold;cursor:pointer;line-height:1.4}a{color:#ffc52b;font-size:14px;min-height:44px;display:inline-flex;align-items:center;line-height:1.5}.error{color:#ffb4a5}@media(max-height:500px){body{padding-top:max(16px,env(safe-area-inset-top,0px));padding-bottom:max(16px,env(safe-area-inset-bottom,0px))}main{padding:20px}h1{margin:14px 0}}</style><main><small>BURGER HOUSE 3 · ADMINISTRACIÓN</small><h1>Tu local, bajo control.</h1><p>Ingresá con la clave de administradora. Este acceso se procesa en el backend del comercio.</p>${error?`<p class="error" role="alert">${escape(error)}</p>`:''}<form method="post" action="/admin/login"><input type="hidden" name="return_to" value="${escape(returnTo)}"><label for="password">Clave de administradora</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="200"><button>Ingresar al panel</button></form><a href="${escape(returnTo.replace(/admin\/$/,''))}">Volver a la tienda</a></main></html>`,{headers:{...privateHeaders,'Referrer-Policy':'same-origin','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(returnTo).origin}; frame-ancestors 'none'; base-uri 'none'`}});
}
async function login(request:Request,env:Env):Promise<Response> {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD_SHA256) return loginPage(safeReturn(env.FRONTEND_URL,null),'El acceso todavía no está configurado.');
  const url=new URL(request.url);
  if (request.method==='GET') return loginPage(safeReturn(env.FRONTEND_URL,url.searchParams.get('return_to')));
  if (request.headers.get('origin')!==url.origin) throw new CommerceError('Origen no permitido.',403);
  const body=await request.text();
  if(body.length>4096)throw new CommerceError('El envío es demasiado grande.',413);
  const fields=new URLSearchParams(body),returnTo=safeReturn(env.FRONTEND_URL,fields.get('return_to'));
  const result=await checkPassword(request,env,fields.get('password')||'');
  if(result==='limited')return loginPage(returnTo,'Demasiados intentos. Esperá cinco minutos.');
  if(result==='invalid')return loginPage(returnTo,'La clave no es correcta.');
  const destination=new URL(returnTo);destination.hash=`admin_token=${await issueSession(env.SESSION_SECRET)}`;
  return new Response(null,{status:303,headers:{...privateHeaders,Location:destination.href}});
}
async function handle(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  if(path==='/admin/login'&&['GET','POST'].includes(request.method))return login(request,env);
  if(path==='/api/admin/session')return nativeLogin(request,env);
  if(path==='/health')return json({ok:true,service:'burger-house-3-api'});
  const origin=request.headers.get('origin');
  if(origin&&!apiOriginAllowed(origin,env))throw new CommerceError('Origen no permitido.',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  const store=new StoreRepository(env.DB,createSeed,storeId);
  if(path==='/api/catalog'&&request.method==='GET')return json(publicCatalog((await store.read()).state));
  if(path==='/api/orders'&&request.method==='GET')return json({order:trackedOrder((await store.read()).state,url.searchParams.get('id'),url.searchParams.get('token'))});
  if(path==='/api/orders'&&request.method==='POST'){
    const input=parseOrderInput(await readJson(request));
    if(input.source!=='web')await requireAdmin(request,env);
    const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,stable(value)])):v;
    const fingerprint=await sha256(JSON.stringify(stable(input)));
    return json({order:publicOrder(await store.update(document=>createIdempotentOrder(document,input,fingerprint)))},201);
  }
  if(path==='/api/admin'){
    await requireAdmin(request,env);
    if(request.method==='GET')return json((await store.read()).state);
    if(request.method==='POST'){
      const action=parseAdminAction(await readJson(request));
      const state=await store.update(document=>{applyAdminAction(document.state,action);return document.state;});
      return json({state});
    }
  }
  return json({error:'Página no encontrada.'},404);
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    let response:Response;
    try{response=await handle(request,env);}catch(error){response=error instanceof CommerceError?json({error:error.message},error.status):json({error:'No se pudo completar la operación.'},500);}
    const origin=request.headers.get('origin');
    if(origin&&apiOriginAllowed(origin,env)){
      const headers=new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');
      headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');headers.set('Access-Control-Max-Age','600');
      response=new Response(response.body,{status:response.status,headers});
    }
    return response;
  },
};
