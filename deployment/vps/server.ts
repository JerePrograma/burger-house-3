import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import worker, { type Env } from '../../backend/worker';
import { openDatabase } from './sqlite.mjs';
import { editor } from './editor';

const base='/burger-house-3';
const api='/burger-house-3-api';
const publisher='/burger-house-3-editor';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};

export function createApp(options:{dataDir:string;publicDir:string;managementDir:string;origin:string}) {
  const {dataDir,publicDir,managementDir,origin}=options;
  mkdirSync(dataDir,{recursive:true});
  const secrets=JSON.parse(readFileSync(join(dataDir,'secrets.json'),'utf8'));
  for(const section of ['backend','editor']) {
    if(!/^[a-f0-9]{64}$/.test(secrets[section]?.ADMIN_PASSWORD_SHA256||'')||typeof secrets[section]?.SESSION_SECRET!=='string'||secrets[section].SESSION_SECRET.length<32)throw new Error('Missing private authentication configuration');
  }
  const db=openDatabase(join(dataDir,'burger.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS commerce_stores (id TEXT PRIMARY KEY NOT NULL,document TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY NOT NULL,failures INTEGER NOT NULL,started_at INTEGER NOT NULL);');
  if(!existsSync(join(dataDir,'catalog.json')))copyFileSync(join(publicDir,'catalog.json'),join(dataDir,'catalog.json'));
  const env={DB:db,FRONTEND_URL:origin+base,PUBLIC_API_URL:origin+api,NATIVE_ORIGINS:'https://localhost',...secrets.backend} as unknown as Env;
  const editorEnv={DB:db,FRONTEND_URL:origin+base,...secrets.editor};
  const error=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
  async function handle(request:Request):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      db.raw.prepare('SELECT 1').get();
      return Response.json({ok:true,service:'burger-house-3-vps',commit:process.env.BUILD_COMMIT||'working-tree'},{headers:{'Cache-Control':'no-store'}});
    }
    // Direct VPS links follow the canonical site. The edge proxy marks its
    // requests to avoid a redirect loop while retrieving the same application.
    if((url.pathname===base||url.pathname.startsWith(base+'/'))&&request.headers.get('host')!==new URL(origin).host&&request.headers.get('x-burger-public-origin')!==origin){
      return Response.redirect(origin+url.pathname+(url.pathname===base?'/':'')+url.search,308);
    }
    if(url.pathname===base)return Response.redirect(origin+base+'/',308);
    if(url.pathname.startsWith(api+'/')){
      const target=new URL(request.url);target.pathname=url.pathname.slice(api.length);
      const upstream=new Request(target,request);
      return worker.fetch(upstream,env);
    }
    if(url.pathname.startsWith(publisher+'/')){
      const target=new URL(request.url);target.pathname=url.pathname.slice(publisher.length);
      return editor(new Request(target,request),editorEnv,dataDir);
    }
    if(!url.pathname.startsWith(base+'/'))return error('Pagina no encontrada.',404);
    if(!['GET','HEAD'].includes(request.method))return error('Metodo no permitido.',405);
    let relative:string;
    try{relative=decodeURIComponent(url.pathname.slice(base.length));}catch{return error('Ruta no valida.',400);}
    if(relative.split('/').some(part=>part==='..'||part.startsWith('.'))||relative.includes('\0')||relative.includes('\\'))return error('Ruta no valida.',400);
    const catalog=relative==='/catalog.json';
    const isManagement=relative==='/admin'||relative.startsWith('/admin/');
    const root=resolve(isManagement?managementDir:publicDir);
    let path=catalog?join(dataDir,'catalog.json'):resolve(root,'.'+relative);
    if(!catalog&&!path.startsWith(root+sep)&&path!==root)return error('Ruta no valida.',400);
    if(existsSync(path)&&statSync(path).isDirectory())path=join(path,'index.html');
    if(!existsSync(path)&&relative.startsWith('/assets/')){
      const alternate=resolve(managementDir,'.'+relative);
      if(alternate.startsWith(resolve(managementDir)+sep)&&existsSync(alternate))path=alternate;
    }
    if(!existsSync(path)){
      if(extname(relative))return error('Archivo no encontrado.',404);
      path=join(root,'index.html');
    }
    const headers:Record<string,string>={
      'Content-Type':mime[extname(path)]||'application/octet-stream',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Cache-Control':relative.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store',
    };
    if(catalog)headers['Access-Control-Allow-Origin']='*';
    return new Response(request.method==='HEAD'?null:readFileSync(path),{headers});
  }
  const server=createServer(async(incoming,outgoing)=>{
    try{
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of incoming){
        size+=chunk.length;
        if(size>21*1024*1024){outgoing.writeHead(413);outgoing.end('Request too large');return;}
        chunks.push(chunk);
      }
      const headers=new Headers();
      for(const [name,value] of Object.entries(incoming.headers))if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
      // The service is reachable only through Caddy's private Docker network.
      // Caddy sets X-Forwarded-For; client-supplied Cloudflare headers are ignored.
      headers.set('cf-connecting-ip',headers.get('x-forwarded-for')?.split(',')[0].trim()||incoming.socket.remoteAddress||'local');
      const method=incoming.method||'GET';
      const request=new Request(new URL(incoming.url||'/',origin),{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handle(request);
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    }catch{outgoing.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end('{"error":"No se pudo completar la operacion."}');}
  });
  server.requestTimeout=60000;
  server.headersTimeout=15000;
  return {server,db,handle};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {server}=createApp({dataDir:process.env.DATA_DIR||'/data',publicDir:process.env.WEB_DIR||'/app/public',managementDir:process.env.MANAGEMENT_DIR||'/app/management',origin:process.env.PUBLIC_ORIGIN||'https://scalaris.com.ar'});
  server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Burger House VPS ready'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
