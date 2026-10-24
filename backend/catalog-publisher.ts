import { sha256 } from './auth';
import { normalizePublishedCatalog } from '../lib/catalog-static';
import type { Catalog } from '../lib/domain';

export interface PublisherEnv {
  DB: D1Database;
  FRONTEND_URL: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CATALOG_WORKER_NAME: string;
  CATALOG_PUBLISH_TOKEN?: string;
  ADMIN_PASSWORD_SHA256: string;
  SESSION_SECRET: string;
}
export class PublisherError extends Error {
  status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}
type Asset = {hash:string;size:number};
type Publication = {format:number;manifest:Record<string,Asset>};
const encoder=new TextEncoder();
const MAX_CATALOG_BYTES=20*1024*1024;
const MAX_MANIFEST_BYTES=1024*1024;
const api='https://api.cloudflare.com/client/v4';
const headersText='/catalog.json\n  Cache-Control: no-store\n  Access-Control-Allow-Origin: *\n/publication-manifest.json\n  Cache-Control: no-store\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n';
const bytes64=(bytes:Uint8Array)=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
const from64=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
function publicSiteUrl(env:PublisherEnv,path=''):URL {
  const base=`${env.FRONTEND_URL.replace(/\/+$/,'')}/`;
  return new URL(path.replace(/^\/+/,''),base);
}
async function vaultKey(secret:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function sealToken(token:string,secret:string):Promise<string>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(secret),encoder.encode(token));
  return `${bytes64(iv)}.${bytes64(new Uint8Array(encrypted))}`;
}
export async function openToken(value:string,secret:string):Promise<string>{
  const [iv,data,extra]=value.split('.');
  if(!iv||!data||extra||from64(iv).length!==12)throw new Error('El permiso de publicación guardado no es válido.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv)},await vaultKey(secret),from64(data)));
}
export async function publisherToken(env:PublisherEnv):Promise<string|null>{
  if(env.CATALOG_PUBLISH_TOKEN)return env.CATALOG_PUBLISH_TOKEN;
  const row=await env.DB.prepare('SELECT value FROM catalog_editor_settings WHERE id = ?').bind('publish-token').first<{value:string}>();
  return row?openToken(row.value,env.SESSION_SECRET):null;
}
async function jsonResponse(response:Response,max:number,message:string):Promise<{raw:string;value:unknown}>{
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw new PublisherError(message,502);
  if(Number(response.headers.get('content-length'))>max)throw new PublisherError(message,502);
  const reader=response.body?.getReader();if(!reader)throw new PublisherError(message,502);
  const decoder=new TextDecoder();let size=0,content='';
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new PublisherError(message,502);}content+=decoder.decode(value,{stream:true});}
    const raw=content+decoder.decode();return {raw,value:JSON.parse(raw)};
  }catch(error){if(error instanceof PublisherError)throw error;throw new PublisherError(message,502);}
  finally{reader.releaseLock();}
}
async function cloudflare<T>(path:string,token:string,init:RequestInit={},fetcher:typeof fetch=fetch):Promise<T>{
  const message='Cloudflare no pudo completar la publicación. Revisá el permiso de publicación y volvé a intentar.';
  try{
    const response=await fetcher(`${api}${path}`,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new PublisherError(message,502);
    const result=(await jsonResponse(response,2*1024*1024,message)).value as {success?:boolean;result?:T}|null;
    // Provider responses may contain request details. Never reflect them or credentials.
    if(!result||result.success!==true||result.result===undefined||result.result===null)throw new PublisherError(message,502);
    return result.result;
  }catch{throw new PublisherError(message,502);}
}
export async function connectPublication(env:PublisherEnv,token:unknown,fetcher:typeof fetch=fetch){
  if(typeof token!=='string'||!token.trim()||token.length>500)throw new PublisherError('Ingresá un token de publicación válido.');
  const value=token.trim();
  await cloudflare(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${env.CATALOG_WORKER_NAME}/settings`,value,{},fetcher);
  await env.DB.prepare('INSERT INTO catalog_editor_settings (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind('publish-token',await sealToken(value,env.SESSION_SECRET)).run();
}
export async function currentCatalog(env:PublisherEnv,fetcher:typeof fetch=fetch):Promise<{catalog:Catalog;revision:string}> {
  const response=await fetcher(publicSiteUrl(env,`catalog.json?editor=${crypto.randomUUID()}`),{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new PublisherError('No pudimos recuperar el catálogo publicado. Volvé a intentar.',502);
  const message='El catálogo publicado no es un documento válido o supera el tamaño permitido.';
  // Hash the exact bytes, rather than a normalized reserialization: the editor
  // must detect concurrent publications, including differently formatted JSON.
  const content=await jsonResponse(response,MAX_CATALOG_BYTES,message);
  let catalog:Catalog;try{catalog=normalizePublishedCatalog(content.value);}catch{throw new PublisherError(message,502);}
  return {catalog,revision:await sha256(content.raw)};
}
function publicAssetPath(path:string):boolean{
  if(path.length>500||!/^\/[a-zA-Z0-9_./ -]+$/.test(path)||path.includes('..')||path.includes('//'))return false;
  if(['/index.html','/editar/index.html','/catalog.json','/favicon.svg','/file.svg','/globe.svg','/window.svg','/robots.txt','/sitemap.xml','/site.webmanifest','/manifest.webmanifest','/images/references/current-sources.json'].includes(path))return true;
  if(/^\/assets\/[a-zA-Z0-9_/-]+\.(?:js|css|woff2?|ttf|otf|webp|png|jpe?g|svg)$/.test(path))return true;
  return /^\/images\/[a-zA-Z0-9_/ -]+\.(?:webp|png|jpe?g)$/.test(path);
}
export async function publishCatalog(env:PublisherEnv,value:unknown,baseRevision:unknown,fetcher:typeof fetch=fetch){
  let catalog:Catalog;try{catalog=normalizePublishedCatalog(value);}catch(error){throw new PublisherError(error instanceof Error?error.message:'El catálogo enviado no es válido.');}
  if(typeof baseRevision!=='string'||!/^[a-f0-9]{64}$/.test(baseRevision))throw new PublisherError('Recargá el catálogo antes de publicar.');
  const token=await publisherToken(env);
  if(!token)throw new PublisherError('Falta conectar el permiso de publicación. Podés seguir guardando tu borrador.',503);
  const lock=crypto.randomUUID(),now=Date.now();
  const acquired=await env.DB.prepare('INSERT INTO catalog_editor_settings (id,value,locked_until) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,locked_until=excluded.locked_until WHERE catalog_editor_settings.locked_until < ? RETURNING value').bind('publication-lock',lock,now+300000,now).first<{value:string}>();
  if(acquired?.value!==lock)throw new PublisherError('Hay una publicación en curso. Esperá un momento y volvé a intentar.',409);
  const renewLock=async()=>{
    const renewedAt=Date.now();
    const renewed=await env.DB.prepare('UPDATE catalog_editor_settings SET locked_until = ? WHERE id = ? AND value = ? AND locked_until > ? RETURNING value').bind(renewedAt+300000,'publication-lock',lock,renewedAt).first<{value:string}>();
    if(renewed?.value!==lock)throw new PublisherError('La publicación demoró demasiado o cambió desde otro dispositivo. Volvé a intentar.',409);
  };
  try {
    const previous=await currentCatalog(env,fetcher);
    if(previous.revision!==baseRevision)throw new PublisherError('El catálogo cambió desde otro dispositivo. Exportá tu borrador y recargá la versión publicada antes de continuar.',409);
    const manifestResponse=await fetcher(publicSiteUrl(env,`publication-manifest.json?editor=${crypto.randomUUID()}`),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!manifestResponse.ok)throw new PublisherError('Primero debe publicarse una compilación compatible del sitio.',503);
    const source=(await jsonResponse(manifestResponse,MAX_MANIFEST_BYTES,'El índice de publicación no es válido.')).value as Publication|null;
    if(!source||source.format!==1||!source.manifest||typeof source.manifest!=='object'||Array.isArray(source.manifest)||Object.keys(source.manifest).length>1500)throw new PublisherError('El índice de publicación no es válido.',502);
    const manifest:Record<string,Asset>={};
    for(const [path,asset] of Object.entries(source.manifest)) {
      // Each new index must omit itself. An earlier publication may include a
      // stale self-entry; copying it creates an invalid recursive manifest.
      if(path==='/publication-manifest.json')continue;
      if(!publicAssetPath(path)||!asset||typeof asset!=='object'||!/^([a-f0-9]{32})$/.test(asset.hash)||!Number.isSafeInteger(asset.size)||asset.size<0||asset.size>25*1024*1024)throw new PublisherError('El índice de publicación no es válido.',502);
      manifest[path]={hash:asset.hash,size:asset.size};
    }
    if(!manifest['/index.html'])throw new PublisherError('El índice de publicación no contiene el sitio completo.',502);
    const raw=JSON.stringify(catalog),catalogBytes=encoder.encode(raw),revision=await sha256(raw);
    manifest['/catalog.json']={hash:revision.slice(0,32),size:catalogBytes.length};
    // The manifest omits itself to avoid a recursive content hash.
    const index=encoder.encode(JSON.stringify({format:1,manifest}));
    manifest['/publication-manifest.json']={hash:(await sha256(new TextDecoder().decode(index))).slice(0,32),size:index.length};
    const local=new Map<string,{bytes:Uint8Array;type:string}>([
      ['/catalog.json',{bytes:catalogBytes,type:'application/json'}],
      ['/publication-manifest.json',{bytes:index,type:'application/json'}],
    ]);
    const base=`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers`;
    await renewLock();
    const upload=await cloudflare<{jwt:string;buckets:string[][]}>(`${base}/scripts/${env.CATALOG_WORKER_NAME}/assets-upload-session`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest})},fetcher);
    if(typeof upload.jwt!=='string'||!upload.jwt||upload.jwt.length>10000||!Array.isArray(upload.buckets)||upload.buckets.length>1500)throw new PublisherError('Cloudflare devolvió una sesión de carga inválida.',502);
    const requested=new Set<string>(),knownHashes=new Set(Object.values(manifest).map(asset=>asset.hash));
    for(const bucket of upload.buckets){
      if(!Array.isArray(bucket)||!bucket.length||bucket.length>1500)throw new PublisherError('Cloudflare devolvió una sesión de carga inválida.',502);
      for(const hash of bucket){if(typeof hash!=='string'||!knownHashes.has(hash)||requested.has(hash))throw new PublisherError('Cloudflare solicitó un archivo desconocido o duplicado.',502);requested.add(hash);}
    }
    let completion:string|undefined=upload.buckets.length?undefined:upload.jwt;
    for(const [bucketIndex,bucket] of upload.buckets.entries()){
      await renewLock();
      const form=new FormData();
      for(const hash of bucket){
        const entry=Object.entries(manifest).find(([,asset])=>asset.hash===hash);
        if(!entry)throw new PublisherError('Cloudflare solicitó un archivo desconocido.',502);
        const [path,asset]=entry;
        let data=local.get(path);
        if(!data){
          // Recover unchanged assets only from this exact catalog origin.
          const response=await fetcher(publicSiteUrl(env,path),{signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw new PublisherError('No se pudo recuperar un archivo del sitio. No se publicó ningún cambio.',502);
          const bytes=new Uint8Array(await response.arrayBuffer());
          if(bytes.length!==asset.size)throw new PublisherError('Los archivos del sitio cambiaron durante la publicación. Volvé a intentar.',409);
          const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
          if(digest!==asset.hash)throw new PublisherError('Los archivos del sitio cambiaron durante la publicación. Volvé a intentar.',409);
          data={bytes,type:response.headers.get('content-type')||'application/octet-stream'};
        }
        form.append(hash,new Blob([bytes64(data.bytes)],{type:data.type}),hash);
      }
      const result=await cloudflare<{jwt?:string}>(`${base}/assets/upload?base64=true`,upload.jwt,{method:'POST',body:form},fetcher);
      if(bucketIndex===upload.buckets.length-1&&typeof result.jwt==='string'&&result.jwt&&result.jwt.length<=10000)completion=result.jwt;
    }
    if(!completion)throw new PublisherError('Cloudflare no confirmó la carga de archivos.',502);
    await renewLock();
    const latest=await currentCatalog(env,fetcher);
    if(latest.revision!==baseRevision)throw new PublisherError('El catálogo cambió durante la publicación. Recargá la versión publicada antes de continuar.',409);
    const deployment=new FormData();
    deployment.set('metadata',new Blob([JSON.stringify({compatibility_date:'2026-05-15',assets:{jwt:completion,config:{html_handling:'auto-trailing-slash',not_found_handling:'single-page-application',_headers:headersText}}})],{type:'application/json'}));
    await cloudflare(`${base}/scripts/${env.CATALOG_WORKER_NAME}`,token,{method:'PUT',body:deployment},fetcher);
    return {revision,url:publicSiteUrl(env).href,publishedAt:new Date().toISOString()};
  }finally{
    await env.DB.prepare('DELETE FROM catalog_editor_settings WHERE id = ? AND value = ?').bind('publication-lock',lock).run();
  }
}
