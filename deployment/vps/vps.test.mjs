import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');

test('VPS preserves data, enforces authentication and revision conflicts, and serves both apps',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'burger-vps-'));
  let server,db;
  try{
    const dataDir=join(dir,'data'),publicDir=join(dir,'public'),managementDir=join(dir,'management');
    for(const path of [dataDir,publicDir,managementDir])mkdirSync(path);
    const password='test-only-vps-password';
    const section={ADMIN_PASSWORD_SHA256:createHash('sha256').update(password).digest('hex'),SESSION_SECRET:'test-only-secret-not-used-in-production-123456'};
    writeFileSync(join(dataDir,'secrets.json'),JSON.stringify({backend:section,editor:section}));
    writeFileSync(join(publicDir,'catalog.json'),readFileSync(resolve('public/catalog.json')));
    writeFileSync(join(publicDir,'index.html'),'CATALOG');
    writeFileSync(join(managementDir,'index.html'),'MANAGEMENT');
    mkdirSync(join(managementDir,'assets'));
    writeFileSync(join(managementDir,'assets','management.js'),'MANAGEMENT ASSET');
    const bundle=join(dir,'server.mjs');
    await build({entryPoints:['deployment/vps/server.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outfile:bundle,external:['node:sqlite'],logLevel:'silent'});
    const {createApp}=await import(pathToFileURL(bundle).href);
    ({server,db}=createApp({dataDir,publicDir,managementDir,origin:'https://test.example'}));
    db.raw.prepare('INSERT INTO commerce_stores (id,document,version) VALUES (?,?,?)').run('migration-sentinel','{"unchanged":true}',7);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=(path,init={})=>fetch(origin+path,{...init,headers:{Origin:'https://test.example','X-Burger-Public-Origin':'https://test.example',...init.headers}});
    const direct=await fetch(origin+'/burger-house-3/editar/?test=1',{redirect:'manual'});
    assert.equal(direct.status,308);
    assert.equal(direct.headers.get('location'),'https://test.example/burger-house-3/editar/?test=1');
    assert.equal(await (await request('/burger-house-3/')).text(),'CATALOG');
    assert.equal(await (await request('/burger-house-3/admin/')).text(),'MANAGEMENT');
    assert.equal(await (await request('/burger-house-3/assets/management.js')).text(),'MANAGEMENT ASSET');
    assert.equal((await request('/burger-house-3/.env')).status,400);
    assert.equal((await request('/burger-house-3-api/api/admin')).status,401);
    const login=await request('/burger-house-3-api/admin/login');
    assert.match(await login.text(),/action="https:\/\/test.example\/burger-house-3-api\/admin\/login"/);
    const adminSession=await request('/burger-house-3-api/admin/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password,return_to:'https://test.example/burger-house-3/admin/'})});
    assert.equal(adminSession.status,303);
    assert.match(adminSession.headers.get('location'),/^https:\/\/test.example\/burger-house-3\/admin\/#admin_token=/);
    assert.equal((await request('/burger-house-3-editor/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:''})})).status,400);
    assert.equal((await request('/burger-house-3-editor/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})})).status,401);
    const signed=await (await request('/burger-house-3-editor/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})})).json();
    assert.ok(signed.token);
    const authorization={Authorization:'Bearer '+signed.token};
    // Same-origin browser GETs omit Origin, even when they send a bearer token.
    // Model the actual browser request instead of adding Origin in the helper.
    const browserGet=(extraHeaders={})=>fetch(origin+'/burger-house-3-editor/catalog',{headers:{
      'Content-Type':'application/json',
      Referer:'https://test.example/burger-house-3/editar/',
      'Sec-Fetch-Site':'same-origin',
      'Sec-Fetch-Mode':'cors',
      ...extraHeaders,
    }});
    assert.equal((await browserGet()).status,401);
    assert.equal((await browserGet({Authorization:'Bearer invalid'})).status,401);
    assert.equal((await browserGet({...authorization,Origin:'https://untrusted.example'})).status,403);
    assert.equal((await browserGet({...authorization,Origin:'null'})).status,403);
    const browserCatalog=await browserGet(authorization);
    assert.equal(browserCatalog.status,200);
    assert.equal(browserCatalog.headers.get('Cache-Control'),'no-store');
    const before=await browserCatalog.json();
    assert.equal(before.publishingAvailable,true);
    const rejectedBody=JSON.stringify({catalog:before.catalog,baseRevision:before.revision});
    assert.equal((await fetch(origin+'/burger-house-3-editor/publish',{method:'POST',headers:{...authorization,'Content-Type':'application/json'},body:rejectedBody})).status,403);
    assert.equal((await request('/burger-house-3-editor/publish',{method:'POST',headers:{...authorization,Origin:'https://untrusted.example','Content-Type':'application/json'},body:rejectedBody})).status,403);
    assert.equal((await fetch(origin+'/burger-house-3-editor/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})})).status,403);
    const publish=()=>request('/burger-house-3-editor/publish',{method:'POST',headers:{...authorization,'Content-Type':'application/json'},body:JSON.stringify({catalog:before.catalog,baseRevision:before.revision})});
    // Alter valid public data so the revision changes, then contend with the
    // same base revision. Exactly one of the simultaneous writers may commit.
    before.catalog.config.name=before.catalog.config.name+' VPS';
    const results=await Promise.all([publish(),publish()]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const publication=await results.find(r=>r.status===200).json();
    assert.equal(publication.url,'https://test.example/burger-house-3/');
    assert.ok(Number.isFinite(Date.parse(publication.publishedAt)));
    const published=await (await request('/burger-house-3/catalog.json')).json();
    assert.equal(published.config.name,before.catalog.config.name);
    const row=db.raw.prepare('SELECT COUNT(*) AS n FROM commerce_stores').get();
    assert.equal(row.n,1);
    assert.equal(db.raw.prepare('SELECT document FROM commerce_stores WHERE id=?').get('migration-sentinel').document,'{"unchanged":true}');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    db?.raw.close();
    assert.equal(dirname(dir),resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('burger-vps-'));
    rmSync(dir,{recursive:true,force:true});
  }
});
