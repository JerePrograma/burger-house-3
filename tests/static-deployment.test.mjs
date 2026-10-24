import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const publisher=readFileSync(new URL('../scripts/publish-static-catalog.mjs',import.meta.url),'utf8');
const credential='fixture-credential-never-printed';
const upstream='https://new-catalog.example.test/catalog.json';
async function run({args=['--bootstrap'],workersDev=true,sidecar,...scenario}={}){
  const parent=resolve(tmpdir()),directory=mkdtempSync(join(parent,'burger-house-3-static-deploy-'));
  try{
    for(const folder of ['scripts','backend','dist-cloudflare'])mkdirSync(join(directory,folder));
    writeFileSync(join(directory,'scripts','publish-static-catalog.mjs'),publisher);
    writeFileSync(join(directory,'backend','frontend-wrangler.jsonc'),JSON.stringify({name:'isolated-fixture',account_id:'account-fixture',workers_dev:workersDev,compatibility_date:'2026-05-15',assets:{html_handling:'auto-trailing-slash',not_found_handling:'single-page-application'}}));
    writeFileSync(join(directory,'frontend.config.json'),JSON.stringify({upstreamCatalogUrl:upstream}));
    writeFileSync(join(directory,'dist-cloudflare','publication-manifest.json'),JSON.stringify({format:1,manifest:{'/index.html':{hash:'0'.repeat(32),size:13}}}));
    writeFileSync(join(directory,'dist-cloudflare','_headers'),'/*\n  X-Content-Type-Options: nosniff\n');
    if(sidecar!==undefined)writeFileSync(join(directory,'.catalog-deploy-base.json'),JSON.stringify(sidecar));
    writeFileSync(join(directory,'scenario.json'),JSON.stringify(scenario));
    writeFileSync(join(directory,'mock.mjs'),`
      import {appendFileSync,readFileSync} from 'node:fs';
      const scenario=JSON.parse(readFileSync(new URL('./scenario.json',import.meta.url),'utf8'));
      let reads=0;
      const json=(result,status=200)=>Response.json(result,{status});
      globalThis.fetch=async(input,init={})=>{
        const url=new URL(input);
        appendFileSync(new URL('./requests.jsonl',import.meta.url),JSON.stringify({path:url.pathname,method:init.method||'GET',body:typeof init.body==='string'?init.body:undefined})+'\\n');
        if(url.origin==='https://new-catalog.example.test'){
          if(scenario.networkFailure)throw new TypeError('offline');
          const status=scenario.statuses?.[reads++]??scenario.status??404;
          return new Response(scenario.raw??'not found',{status});
        }
        if(url.pathname.endsWith('/settings'))return scenario.settings==='exists'?json({success:true,result:{}}):json({success:false,errors:[{code:scenario.settings==='denied'?10000:10007,message:process.env.CLOUDFLARE_API_TOKEN}]},scenario.settings==='denied'?403:404);
        if(url.pathname.endsWith('/assets-upload-session'))return json({success:true,result:{buckets:[],jwt:'fixture-upload-session'}});
        if(url.pathname.endsWith('/subdomain'))return json({success:true,result:JSON.parse(init.body)});
        if(url.pathname.endsWith('/scripts/isolated-fixture')&&init.method==='PUT')return json({success:true,result:{}});
        throw new Error('Unexpected fixture request');
      };
    `);
    const result=spawnSync(process.execPath,['--import',pathToFileURL(join(directory,'mock.mjs')).href,join(directory,'scripts','publish-static-catalog.mjs'),...args],{cwd:directory,encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:credential}});
    const output=result.stdout+result.stderr;
    assert.equal(output.includes(credential),false,'Nunca imprimir credenciales, tampoco en errores de Cloudflare');
    const log=join(directory,'requests.jsonl');
    return {...result,requests:existsSync(log)?readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]};
  }finally{
    assert.equal(dirname(directory),parent);
    assert.ok(basename(directory).startsWith('burger-house-3-static-deploy-'));
    rmSync(directory,{recursive:true,force:true});
  }
}

test('primera publicación funciona sin sidecar y habilita workers.dev sin vistas previas',async()=>{
  const result=await run();
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.requests.filter(request=>request.path==='/catalog.json').length,2);
  const subdomain=result.requests.find(request=>request.path.endsWith('/subdomain'));
  assert.equal(subdomain.method,'POST');
  assert.deepEqual(JSON.parse(subdomain.body),{enabled:true,previews_enabled:false});
});

test('bootstrap rechaza catálogo existente y una publicación aparecida durante la carga',async()=>{
  for(const statuses of [[200],[404,200]]){
    const result=await run({statuses,raw:'{"products":[]}'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/catálogo ya existe/);
    assert.equal(result.requests.some(request=>request.method==='PUT'),false);
  }
});

test('bootstrap acepta ausencia confirmada 10007 y rechaza errores o Worker existente',async()=>{
  assert.equal((await run({networkFailure:true})).status,0);
  for(const settings of ['denied','exists']){
    const result=await run({networkFailure:true,settings});
    assert.notEqual(result.status,0);
    assert.equal(result.requests.some(request=>request.method==='POST'),false);
  }
});

test('publicación habitual exige sincronización y verifica la revisión antes de cargar',async()=>{
  for(const sidecar of [undefined,{sourceUrl:upstream,revision:null},{sourceUrl:upstream,revision:'0'.repeat(64)}]){
    const result=await run({args:[],sidecar,status:200,raw:'versión móvil más reciente'});
    assert.notEqual(result.status,0);
    assert.equal(result.requests.some(request=>request.method==='POST'),false);
  }
});

test('revisión sincronizada publica y respeta workers_dev false',async()=>{
  const raw='{"products":[]}';
  const result=await run({args:[],workersDev:false,status:200,raw,sidecar:{sourceUrl:upstream,revision:createHash('sha256').update(raw).digest('hex')}});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.requests.find(request=>request.path.endsWith('/subdomain')).body),{enabled:false,previews_enabled:false});
});
