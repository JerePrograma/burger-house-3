import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proxyRequest} from './public-proxy.mjs';
import legacy from './legacy-proxy.mjs';

test('public routing is limited to Burger House and keeps the Scalaris address', async () => {
  let calls = 0;
  const upstream = async () => { calls++; return new Response('APP'); };
  for (const path of ['/', '/e-medicapp/', '/tu-comida/', '/burger-house-30/', '/burger-house-3-other']) {
    assert.equal((await proxyRequest(new Request('https://scalaris.com.ar' + path), upstream)).status, 404);
  }
  assert.equal((await proxyRequest(new Request('https://other.example/burger-house-3/'), upstream)).status, 404);
  assert.equal(calls, 0);
  const redirect = await proxyRequest(new Request('https://scalaris.com.ar/burger-house-3?table=2'), upstream);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), 'https://scalaris.com.ar/burger-house-3/?table=2');
  assert.equal(calls, 0);
  for (const path of ['/burger-house-3/', '/burger-house-3/editar/', '/burger-house-3/admin/', '/burger-house-3/assets/app.js']) {
    assert.equal(await (await proxyRequest(new Request('https://scalaris.com.ar' + path), upstream)).text(), 'APP');
  }
  const config = JSON.parse(readFileSync(new URL('./public-worker.json', import.meta.url)));
  // A terminating wildcard also captures the bare catalog path with a query.
  // The handler above enforces the three exact path boundaries.
  assert.deepEqual(config.routes.map(route => route.pattern), ['scalaris.com.ar/burger-house-3*']);
});

test('API and editor proxy preserve authentication, origin, bodies and private responses', async () => {
  for (const path of ['/burger-house-3-api/api/admin', '/burger-house-3-editor/publish']) {
    const response = await proxyRequest(new Request('https://scalaris.com.ar' + path + '?revision=abc', {
      method: 'POST',
      headers: {'Origin': 'https://scalaris.com.ar', 'Authorization': 'Bearer test-only-token', 'Content-Type': 'application/json', 'Cookie': 'corporate=private', 'X-Burger-Public-Origin': 'forged', 'X-Forwarded-For': 'forged'},
      body: '{"test":true}',
    }), async (url, init) => {
      assert.equal(url, 'https://srv2083548.hstgr.cloud' + path + '?revision=abc');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.get('Authorization'), 'Bearer test-only-token');
      assert.equal(init.headers.get('Origin'), 'https://scalaris.com.ar');
      assert.equal(init.headers.get('Cookie'), null);
      assert.equal(init.headers.get('X-Forwarded-For'), null);
      assert.equal(init.headers.get('X-Burger-Public-Origin'), 'https://scalaris.com.ar');
      assert.equal(await new Response(init.body).text(), '{"test":true}');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.cf.cacheTtl, 0);
      return Response.json({error: 'Revision conflict'}, {status: 409, headers: {'Cache-Control': 'no-store', 'Set-Cookie': 'upstream=private'}});
    });
    assert.equal(response.status, 409);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
});

test('redirects and legacy links resolve to the canonical public domain', async () => {
  const result = await proxyRequest(new Request('https://scalaris.com.ar/burger-house-3/admin/'), async () => Response.redirect('https://srv2083548.hstgr.cloud/burger-house-3/admin/?test=1', 303));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), 'https://scalaris.com.ar/burger-house-3/admin/?test=1');
  for (const [component, suffix] of [['web', '/'], ['management', '/admin/']]) {
    const response = await legacy.fetch(new Request('https://legacy.example/'), {COMPONENT: component});
    assert.equal(response.headers.get('Location'), 'https://scalaris.com.ar/burger-house-3' + suffix);
  }
  const login = await legacy.fetch(new Request('https://legacy.example/admin/login'), {COMPONENT: 'api'});
  assert.equal(new URL(login.headers.get('Location')).origin, 'https://scalaris.com.ar');
});
