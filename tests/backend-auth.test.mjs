import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {issueSession,verifySession,safeReturn,sha256} from '../backend/auth.ts';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(`${specifier}.ts`,context);throw error;}}});
const {default:worker}=await import('../backend/worker.ts');
const secret='test-secret-which-is-long-enough-for-an-isolated-fixture';
const env={FRONTEND_URL:'https://jereprograma.github.io/burger-house-3',SESSION_SECRET:secret,ADMIN_PASSWORD_SHA256:'unused',DB:{prepare(){throw new Error('No debe consultar la base sin autorización.');}}};

test('sesión válida sólo para la clave correcta y durante ocho horas',async()=>{
 const now=Date.now(),token=await issueSession(secret,now);
 assert.equal(await verifySession(token,secret,now),true);
 assert.equal(await verifySession(token,secret+'otra',now),false);
 assert.equal(await verifySession(token,secret,now+8*60*60*1000),false);
 assert.equal(await verifySession(token.replace('admin','cliente')+'x',secret,now),false);
 assert.equal(await verifySession('invalido',secret,now),false);
});
test('retorno de login se limita al panel exacto del comercio',()=>{
 const frontend=env.FRONTEND_URL;
 assert.equal(safeReturn(frontend,null),frontend+'/admin/');
 for(const url of ['https://evil.test/','javascript:alert(1)',frontend+'/admin/?evil=1',frontend+'/admin/#token=algo','https://jereprograma.github.io/otro/admin/'])assert.throws(()=>safeReturn(frontend,url));
});
test('el backend exige sesión sin depender de cabeceras de ChatGPT',async()=>{
 const res=await worker.fetch(new Request('https://api.test/api/admin',{headers:{'oai-authenticated-user-id':'fake'}}),env);
 assert.equal(res.status,401);
 assert.equal((await res.json()).error.includes('Ingresá'),true);
});
test('CORS autoriza Pages y rechaza otros orígenes',async()=>{
 const allowed='https://jereprograma.github.io';
 const res=await worker.fetch(new Request('https://api.test/api/catalog',{method:'OPTIONS',headers:{Origin:allowed}}),env);
 assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),allowed);
 const forbidden=await worker.fetch(new Request('https://api.test/api/catalog',{headers:{Origin:'https://evil.test'}}),env);
 assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'),null);
});
test('login externo no incluye secretos y usa una página que no puede embeberse',async()=>{
 const res=await worker.fetch(new Request('https://api.test/admin/login'),env);
 const html=await res.text();assert.ok(html.includes('Clave de administradora'));
 assert.equal(html.includes(secret),false);assert.equal(res.headers.get('Referrer-Policy'),'same-origin');assert.ok(res.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
 assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('formulario de acceso publicado bajo Scalaris conserva la subruta del backend',async()=>{
 const frontend='https://scalaris.com.ar/burger-house-3/gestion';
 const publicApi='https://scalaris.com.ar/burger-house-3/backend';
 const configured={...env,FRONTEND_URL:frontend,PUBLIC_API_URL:publicApi};
 const res=await worker.fetch(new Request('https://burger-house-3-api.example.test/admin/login'),configured);
 assert.equal(res.status,200);
 const html=await res.text();
 assert.ok(html.includes(`action="${publicApi}/admin/login"`));
 assert.ok(html.includes(`value="${frontend}/admin/"`));
 assert.equal(html.includes('action="/admin/login"'),false);
 assert.ok(res.headers.get('Content-Security-Policy').includes('https://scalaris.com.ar'));
 const hostile=await worker.fetch(new Request('https://burger-house-3-api.example.test/admin/login?return_to='+encodeURIComponent('https://scalaris.com.ar/otra/admin/')),configured);
 assert.equal(hostile.status,500);
 assert.equal((await hostile.text()).includes('Destino no permitido'),false);
});

test('volver a la tienda desde el acceso usa el catálogo público y no la base de gestión',async()=>{
 const publicStore='https://scalaris.com.ar/catalogo-publico/';
 const configured={...env,FRONTEND_URL:'https://scalaris.com.ar/gestion',PUBLIC_STORE_URL:publicStore,PUBLIC_API_URL:'https://scalaris.com.ar/backend'};
 const response=await worker.fetch(new Request('https://api.test/admin/login'),configured);
 const html=await response.text();
 assert.equal(response.status,200);
 assert.ok(html.includes('href="'+publicStore+'"'));
 assert.ok(!html.includes('href="https://scalaris.com.ar/gestion/"'));
});
