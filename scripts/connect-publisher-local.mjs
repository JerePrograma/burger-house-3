import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { issueSession } from '../backend/auth.ts';
import config from '../frontend.config.json' with { type:'json' };

// A short-lived, loopback-only bridge for installing a newly authorized token.
// It keeps both the token and the editor session out of transcripts and files.
const secrets=JSON.parse(await readFile(new URL('../.env.catalog-secrets.local.json',import.meta.url),'utf8'));
const nonce=randomBytes(32).toString('hex');
const port=8799,origin=`http://127.0.0.1:${port}`;
let completed=false;
const server=createServer(async(request,response)=>{
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Referrer-Policy','same-origin');
  response.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  if(request.headers.host!==`127.0.0.1:${port}`){response.writeHead(403);response.end();return;}
  if(request.method==='GET'&&request.url==='/'){
    response.setHeader('Content-Type','text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>Conectar publicación · Burger House 3</title><style>body{font:16px system-ui;background:#f4eddd;color:#211b13;max-width:650px;margin:60px auto;padding:24px}input,button{box-sizing:border-box;width:100%;padding:16px;margin:12px 0;border:1px solid #bcae92;border-radius:8px}button{background:#ffc52b;font-weight:bold}</style><h1>Conectar publicación del catálogo</h1><p>Se guardará cifrado el permiso autorizado, limitado a burger-house-3-web. No se guardará en esta computadora ni en el navegador.</p><form method="POST" action="/connect"><input type="hidden" name="nonce" value="${nonce}"><label>Permiso de Cloudflare<input type="password" name="apiToken" autocomplete="off" required></label><button>Conectar publicación</button></form></html>`);return;
  }
  if(request.method!=='POST'||request.url!=='/connect'||request.headers.origin!==origin||completed){response.writeHead(403);response.end();return;}
  let raw='';for await(const chunk of request){raw+=chunk;if(raw.length>4096){response.writeHead(413);response.end();return;}}
  const values=new URLSearchParams(raw),received=values.get('nonce')||'';
  if(received.length!==nonce.length||!timingSafeEqual(Buffer.from(received),Buffer.from(nonce))){response.writeHead(403);response.end();return;}
  try{
    const connected=await fetch(`${config.publisherUrl}/connection`,{method:'POST',headers:{Authorization:`Bearer ${await issueSession(secrets.SESSION_SECRET)}`,'Content-Type':'application/json'},body:JSON.stringify({apiToken:values.get('apiToken')}),signal:AbortSignal.timeout(60000)});
    if(!connected.ok)throw new Error('connection');
    completed=true;response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html lang="es"><title>Publicación conectada</title><h1>Publicación conectada</h1><p>El permiso quedó cifrado. Ya podés publicar desde el editor en el celular.</p></html>');
    console.log('Publicación conectada y verificada. No se mostraron ni guardaron credenciales locales.');
    setTimeout(()=>server.close(),1000).unref();
  }catch{response.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});response.end('No se pudo conectar el permiso. Revisá el alcance y volvé a abrir esta página.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Conexión local privada preparada: ${origin}/`));
setTimeout(()=>server.close(),15*60*1000).unref();
