import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { issueSession, verifySession, sha256 } from '../../backend/auth';
import { normalizePublishedCatalog } from '../../lib/catalog-static';

class InputError extends Error {
  constructor(message:string, public status=400) { super(message); }
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});

export async function editor(request:Request,env:{DB:any;ADMIN_PASSWORD_SHA256:string;SESSION_SECRET:string;FRONTEND_URL:string},directory:string):Promise<Response> {
  try {
    const origin=request.headers.get('origin');
    // Browsers omit Origin on same-origin reads. Bearer authentication below
    // still protects the catalog; login and publishing require a valid Origin.
    const readOnly=request.method==='GET'||request.method==='HEAD';
    if(origin!==null?origin!==new URL(env.FRONTEND_URL).origin:!readOnly)throw new InputError('Origen no permitido.',403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const path=new URL(request.url).pathname;
    const catalogPath=join(directory,'catalog.json');
    if(path==='/health')return json({ok:true,service:'burger-house-3-catalog-editor'});
    const contentType=request.headers.get('content-type')||'';
    const parse=async(max:number)=>{
      if(!/^application\/json(?:\s*;|$)/i.test(contentType))throw new InputError('Formato de envio no valido.',415);
      const text=await request.text();
      if(Buffer.byteLength(text)>max)throw new InputError('El catalogo supera el tamano permitido.',413);
      try{return JSON.parse(text);}catch{throw new InputError('No se pudo leer el envio.');}
    };
    if(path==='/session'&&request.method==='POST'){
      const value=await parse(4096);
      if(!value||typeof value.password!=='string'||value.password.length<1||value.password.length>200||Object.keys(value).some(k=>k!=='password'))throw new InputError('Ingresa la clave del catalogo.');
      const id='catalog:'+await sha256(request.headers.get('cf-connecting-ip')||'local');
      const now=Date.now();
      const attempts=await env.DB.prepare('INSERT INTO login_attempts (id,failures,started_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET failures=CASE WHEN ?-started_at>=300000 THEN 1 ELSE failures+1 END, started_at=CASE WHEN ?-started_at>=300000 THEN ? ELSE started_at END RETURNING failures').bind(id,now,now,now,now).first();
      if(!attempts||attempts.failures>5)throw new InputError('Demasiados intentos. Espera cinco minutos.',429);
      if(await sha256(value.password)!==env.ADMIN_PASSWORD_SHA256)throw new InputError('La clave no es correcta.',401);
      await env.DB.prepare('DELETE FROM login_attempts WHERE id=?').bind(id).run();
      return json({token:await issueSession(env.SESSION_SECRET)});
    }
    const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
    if(!await verifySession(token,env.SESSION_SECRET))throw new InputError('Ingresa al editor para continuar.',401);
    if(path==='/catalog'&&request.method==='GET'){
      const raw=readFileSync(catalogPath,'utf8');
      return json({catalog:normalizePublishedCatalog(JSON.parse(raw)),revision:await sha256(raw),publishingAvailable:true});
    }
    if(path==='/publish'&&request.method==='POST'){
      const value=await parse(21*1024*1024);
      if(!value||Object.keys(value).some(k=>!['catalog','baseRevision'].includes(k)))throw new InputError('El envio contiene datos invalidos.');
      if(typeof value.baseRevision!=='string'||!/^[a-f0-9]{64}$/.test(value.baseRevision))throw new InputError('Recarga el catalogo antes de publicar.');
      let catalog;try{catalog=normalizePublishedCatalog(value.catalog);}catch(error){throw new InputError(error instanceof Error?error.message:'Catalogo no valido.');}
      const previous=readFileSync(catalogPath,'utf8');
      // No await between the final revision check and atomic replacement. Node's
      // single writer prevents two concurrent publications from losing an edit.
      const expected=await sha256(previous);
      if(value.baseRevision!==expected||readFileSync(catalogPath,'utf8')!==previous)throw new InputError('El catalogo cambio en otro dispositivo. Recargalo antes de publicar.',409);
      const raw=JSON.stringify(catalog);
      if(Buffer.byteLength(raw)>20*1024*1024)throw new InputError('El catalogo supera el tamano permitido.',413);
      const temporary=join(directory,`catalog-${crypto.randomUUID()}.tmp`);
      writeFileSync(temporary,raw,{mode:0o640});
      renameSync(temporary,catalogPath);
      return json({revision:await sha256(raw),url:env.FRONTEND_URL+'/',publishedAt:new Date().toISOString()});
    }
    return json({error:'Pagina no encontrada.'},404);
  }catch(error){return json({error:error instanceof InputError?error.message:'No se pudo completar la operacion.'},error instanceof InputError?error.status:500);}
}
