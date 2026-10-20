import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.ts';
import {sha256, verifySession} from '../backend/auth.ts';

const api='https://api.test';
const native='https://localhost';
const frontend='https://jereprograma.github.io';
const password='native-fixture-password-not-a-real-credential';
const sessionSecret='native-session-fixture-isolated-long-secret';
class LoginD1 {
  attempts=new Map();
  reads=0;
  writes=0;
  prepare(sql) {
    assert.ok(sql.includes('login_attempts'),'El inicio de sesión sólo consulta su limitador.');
    return {bind:(...values)=>({
      first:async()=>{
        this.reads++;
        if(sql.startsWith('INSERT')) {
          this.writes++;
          const previous=this.attempts.get(values[0]),now=values[1];
          const next={failures:previous&&now-previous.started_at<300000?previous.failures+1:1,started_at:previous&&now-previous.started_at<300000?previous.started_at:now};
          this.attempts.set(values[0],next);
          return {...next};
        }
        return this.attempts.get(values[0])??null;
      },
      run:async()=>{
        this.writes++;
        if(sql.startsWith('DELETE'))this.attempts.delete(values[0]);
        else {
          const previous=this.attempts.get(values[0]),now=values[1];
          this.attempts.set(values[0],{failures:previous&&now-previous.started_at<300000?previous.failures+1:1,started_at:previous&&now-previous.started_at<300000?previous.started_at:now});
        }
        return {meta:{changes:1}};
      },
    })};
  }
}
async function fixture() {return {FRONTEND_URL:frontend+'/burger-house-3',NATIVE_ORIGINS:native,SESSION_SECRET:sessionSecret,ADMIN_PASSWORD_SHA256:await sha256(password),DB:new LoginD1()};}
function request(body={password},origin=native,extra={}) {
  const headers={'content-type':'application/json',...(origin===undefined?{}:{origin}),...extra};
  return new Request(api+'/api/admin/session',{method:'POST',headers,body:JSON.stringify(body)});
}

test('acceso nativo entrega una sesión firmada por HTTPS sin reflejar contraseña ni secretos',async()=>{
  const env=await fixture(),response=await worker.fetch(request(),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),native);
  const data=await response.json();assert.deepEqual(Object.keys(data),['token']);
  assert.equal(await verifySession(data.token,sessionSecret),true);
  assert.equal(await verifySession(data.token,sessionSecret,Date.now()+8*60*60*1000+1000),false);
  const serialized=JSON.stringify(data);for(const value of [password,sessionSecret,env.ADMIN_PASSWORD_SHA256])assert.equal(serialized.includes(value),false);
  assert.equal(env.DB.attempts.size,0);
});

test('CORS nativo autoriza únicamente el origen configurado exacto y exige opt-in',async()=>{
  const env=await fixture();
  const allowed=await worker.fetch(new Request(api+'/api/catalog',{method:'OPTIONS',headers:{origin:native}}),env);
  assert.equal(allowed.status,204);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),native);
  assert.ok(allowed.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
  for(const origin of ['null','http://localhost','https://localhost:5173','capacitor://localhost','https://localhost.attacker.test','https://evil.test']) {
    const response=await worker.fetch(request({password},origin),env);assert.equal(response.status,403,origin);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
  const missing=await worker.fetch(new Request(api+'/api/admin/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}),env);assert.equal(missing.status,403);
  for(const config of [undefined,'','*','null','https://localhost.attacker.test','http://localhost,capacitor://localhost']) {
    const response=await worker.fetch(request(),{...env,NATIVE_ORIGINS:config});assert.equal(response.status,403,String(config));
  }
  assert.equal(env.DB.reads,0);assert.equal(env.DB.writes,0);
});

test('la web mantiene CORS y login externo pero no puede usar el endpoint de contraseña nativa',async()=>{
  const env=await fixture();
  const nativeEndpoint=await worker.fetch(request({password},frontend),env);assert.equal(nativeEndpoint.status,403);
  const cors=await worker.fetch(new Request(api+'/api/admin',{method:'OPTIONS',headers:{origin:frontend}}),env);assert.equal(cors.status,204);assert.equal(cors.headers.get('Access-Control-Allow-Origin'),frontend);
  const webLogin=await worker.fetch(new Request(api+'/admin/login?return_to='+encodeURIComponent(env.FRONTEND_URL+'/admin/')),env);assert.equal(webLogin.status,200);assert.ok((await webLogin.text()).includes('Clave de administradora'));
  const nativeReturn=await worker.fetch(new Request(api+'/admin/login?return_to='+encodeURIComponent('https://localhost/admin/')),env);assert.ok(nativeReturn.status>=400);assert.equal(nativeReturn.headers.get('Location'),null);
  assert.equal(env.DB.reads,0);
});

test('endpoint nativo valida método, formato, campos y longitud antes de consultar credenciales',async()=>{
  const env=await fixture();
  const get=await worker.fetch(new Request(api+'/api/admin/session',{headers:{origin:native}}),env);assert.equal(get.status,405);
  const preflight=await worker.fetch(new Request(api+'/api/admin/session',{method:'OPTIONS',headers:{origin:native}}),env);assert.equal(preflight.status,204);
  for(const body of [{},{password:''},{password:'x'.repeat(201)},{password:2},{password:null},{password,return_to:'https://evil.test'},[],null]) {
    const response=await worker.fetch(request(body),env);assert.equal(response.status,400,JSON.stringify(body));
  }
  const plain=await worker.fetch(request({password},native,{'content-type':'text/plain'}),env);assert.equal(plain.status,415);
  const invalid=await worker.fetch(new Request(api+'/api/admin/session',{method:'POST',headers:{origin:native,'content-type':'application/json'},body:'{' }),env);assert.equal(invalid.status,400);
  const large=await worker.fetch(request({password:'x'.repeat(66000)}),env);assert.equal(large.status,413);
  assert.equal(env.DB.reads,0);assert.equal(env.DB.writes,0);
});

test('cinco fallos nativos bloquean ambos accesos hasta vencer el mismo limitador',async()=>{
  const env=await fixture();
  for(let i=0;i<5;i++) {const response=await worker.fetch(request({password:'incorrecta'}),env);assert.equal(response.status,401);}
  const blocked=await worker.fetch(request(),env);assert.equal(blocked.status,429);assert.equal((await blocked.json()).token,undefined);
  const webBlocked=await worker.fetch(new Request(api+'/admin/login',{method:'POST',headers:{origin:api,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password})}),env);
  assert.equal(webBlocked.status,200);assert.ok((await webBlocked.text()).includes('Demasiados intentos'));
  assert.equal(env.DB.attempts.size,1);
  for(const entry of env.DB.attempts.values())entry.started_at=Date.now()-300001;
  const unblocked=await worker.fetch(request(),env);assert.equal(unblocked.status,200);assert.equal(env.DB.attempts.size,0);
});

test('fallos del formulario web cuentan para el límite nativo y un acierto limpia la cuenta',async()=>{
  const env=await fixture();
  for(let i=0;i<4;i++) {
    const response=await worker.fetch(new Request(api+'/admin/login',{method:'POST',headers:{origin:api,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:'incorrecta'})}),env);assert.ok((await response.text()).includes('La clave no es correcta'));
  }
  const success=await worker.fetch(request(),env);assert.equal(success.status,200);assert.equal(env.DB.attempts.size,0);
  for(let i=0;i<5;i++)await worker.fetch(request({password:'incorrecta'}),env);
  assert.equal((await worker.fetch(request(),env)).status,429);
});

test('intentos simultáneos reservan el limitador una sola vez y no evitan el tope de cinco',async()=>{
  const env=await fixture();
  const responses=await Promise.all(Array.from({length:20},()=>worker.fetch(request({password:'incorrecta'}),env)));
  assert.equal(responses.filter(response=>response.status===401).length,5);
  assert.equal(responses.filter(response=>response.status===429).length,15);
  assert.equal(env.DB.attempts.size,1);
});

test('origen nativo y cabeceras falsas no evitan la sesión administrativa',async()=>{
  const env=await fixture();
  const response=await worker.fetch(new Request(api+'/api/admin',{headers:{origin:native,'oai-authenticated-user-id':'fake',authorization:'Bearer falso'}}),env);
  assert.equal(response.status,401);assert.equal(response.headers.get('Access-Control-Allow-Origin'),native);assert.equal(env.DB.reads,0);
  const incorrect=await worker.fetch(request({password:'incorrecta'},native,{'oai-authenticated-user-id':'fake'}),env);assert.equal(incorrect.status,401);assert.equal((await incorrect.json()).token,undefined);
  const unavailable=await worker.fetch(request(),{...env,SESSION_SECRET:''});assert.equal(unavailable.status,503);
});
