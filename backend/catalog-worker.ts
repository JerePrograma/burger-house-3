import { issueSession,sha256,verifySession } from './auth';
import { connectPublication,currentCatalog,publishCatalog,publisherToken,PublisherError,type PublisherEnv } from './catalog-publisher';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function body(request:Request,max=21*1024*1024){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new PublisherError('El formato del envío no es válido.',415);
  if(Number(request.headers.get('content-length'))>max)throw new PublisherError('El catálogo supera el tamaño permitido.',413);
  const reader=request.body?.getReader();if(!reader)throw new PublisherError('Faltan los datos del envío.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new PublisherError('El catálogo supera el tamaño permitido.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PublisherError('No pudimos leer los datos enviados.');}
}
function input(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new PublisherError('El envío contiene datos inválidos.');
  return value as Record<string,unknown>;
}
async function handle(request:Request,env:PublisherEnv):Promise<Response>{
  const origin=request.headers.get('origin'),allowed=new URL(env.FRONTEND_URL).origin;
  if(origin&&origin!==allowed&&origin!=='http://127.0.0.1:5173'&&origin!=='http://localhost:5173'&&origin!=='https://localhost')throw new PublisherError('Origen no permitido.',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  const path=new URL(request.url).pathname;
  if(path==='/health')return json({ok:true,service:'burger-house-3-catalog-editor'});
  if(path==='/session'&&request.method==='POST'){
    if(!origin)throw new PublisherError('Origen no permitido.',403);
    const data=input(await body(request,4096),['password']);
    if(!data||typeof data.password!=='string'||data.password.length<1||data.password.length>200||Object.keys(data).some(key=>key!=='password'))throw new PublisherError('Ingresá la clave del catálogo.');
    if(!env.SESSION_SECRET||!env.ADMIN_PASSWORD_SHA256)throw new PublisherError('El acceso del editor todavía no está configurado.',503);
    const id=`catalog:${await sha256(request.headers.get('cf-connecting-ip')||'local')}`,now=Date.now();
    const attempt=await env.DB.prepare('INSERT INTO login_attempts (id,failures,started_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET failures=CASE WHEN ?-started_at>=300000 THEN 1 ELSE failures+1 END, started_at=CASE WHEN ?-started_at>=300000 THEN ? ELSE started_at END RETURNING failures').bind(id,now,now,now,now).first<{failures:number}>();
    if(!attempt||attempt.failures>5)throw new PublisherError('Demasiados intentos. Esperá cinco minutos.',429);
    if(await sha256(data.password)!==env.ADMIN_PASSWORD_SHA256)throw new PublisherError('La clave no es correcta.',401);
    await env.DB.prepare('DELETE FROM login_attempts WHERE id = ?').bind(id).run();
    return json({token:await issueSession(env.SESSION_SECRET)});
  }
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!env.SESSION_SECRET||!await verifySession(token,env.SESSION_SECRET))throw new PublisherError('Ingresá al editor para continuar.',401);
  if(path==='/catalog'&&request.method==='GET')return json({...await currentCatalog(env),publishingAvailable:Boolean(await publisherToken(env))});
  if(path==='/connection'&&request.method==='POST'){
    const data=input(await body(request,4096),['apiToken']);await connectPublication(env,data.apiToken);return json({publishingAvailable:true});
  }
  if(path==='/publish'&&request.method==='POST'){
    const data=input(await body(request),['catalog','baseRevision']);return json(await publishCatalog(env,data.catalog,data.baseRevision));
  }
  return json({error:'Página no encontrada.'},404);
}
export default {async fetch(request:Request,env:PublisherEnv):Promise<Response>{
  let response:Response;
  try{response=await handle(request,env);}catch(error){response=json({error:error instanceof PublisherError?error.message:'No se pudo completar la operación. Volvé a intentar.'},error instanceof PublisherError?error.status:500);}
  const origin=request.headers.get('origin');
  if(origin&&(origin===new URL(env.FRONTEND_URL).origin||['http://127.0.0.1:5173','http://localhost:5173','https://localhost'].includes(origin))){
    const h=new Headers(response.headers);h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type, Authorization');h.set('Vary','Origin');return new Response(response.body,{status:response.status,headers:h});
  }return response;
}};
