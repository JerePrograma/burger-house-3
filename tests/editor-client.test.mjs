import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorApiError, clearEditorSession, editorPublisherUrl, editorRequest, editorSession, prepareCatalogPhoto, readEditorDraft, saveEditorDraft } from '../lib/editor-client.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const originalIdb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
let storage;
test.beforeEach(() => {
  storage = new Map([['bh3-admin-session', 'management-token'], ['bh3-catalog-editor-session', 'editor-token']]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } });
});
test.afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  else delete globalThis.sessionStorage;
  if (originalIdb) Object.defineProperty(globalThis, 'indexedDB', originalIdb);
  else delete globalThis.indexedDB;
});

test('el editor usa una sesión propia y nunca reutiliza la de gestión', () => {
  assert.equal(editorSession(), 'editor-token');
  clearEditorSession();
  assert.equal(editorSession(), null);
  assert.equal(storage.get('bh3-admin-session'), 'management-token');
});

test('carga y publicación omiten cookies y envían sólo la sesión del editor al publicador', async () => {
  const calls = [];
  const context = { publisherUrl: 'https://publisher.test/', fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ revision: 'version-2', url: 'https://catalog.test', publishedAt: '2026-10-21T12:00:00Z' });
  } };
  await editorRequest('/catalog', undefined, context);
  await editorRequest('/publish', { catalog: { products: [] }, baseRevision: 'version-1' }, context);
  assert.equal(calls[0].url, 'https://publisher.test/catalog');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { catalog: { products: [] }, baseRevision: 'version-1' });
  for (const { options } of calls) {
    assert.equal(options.headers.get('Authorization'), 'Bearer editor-token');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.signal.aborted, false);
    assert.ok(!JSON.stringify(options).includes('management-token'));
  }
});

test('ingresar no adjunta la sesión anterior a la contraseña', async () => {
  const password = 'only-for-test';
  let call;
  await editorRequest('/session', { password }, { publisherUrl: 'https://publisher.test', fetcher: async (_url, options) => {
    call = options; return Response.json({ token: 'fresh-editor-token' });
  } });
  assert.equal(call.headers.get('Authorization'), null);
  assert.deepEqual(JSON.parse(call.body), { password });
});

test('una sesión vencida cierra sólo el editor y una revisión en conflicto conserva su sesión', async () => {
  await assert.rejects(() => editorRequest('/catalog', undefined, { publisherUrl: 'https://publisher.test', fetcher: async () => Response.json({ error: 'Volvé a ingresar.' }, { status: 401 }) }), error => error instanceof EditorApiError && error.status === 401);
  assert.equal(editorSession(), null);
  assert.equal(storage.get('bh3-admin-session'), 'management-token');
  storage.set('bh3-catalog-editor-session', 'restored-editor-token');
  await assert.rejects(() => editorRequest('/publish', { baseRevision: 'old' }, { publisherUrl: 'https://publisher.test', fetcher: async () => Response.json({}, { status: 409 }) }), error => error.status === 409 && error.message.includes('versión más nueva'));
  assert.equal(editorSession(), 'restored-editor-token');
});

test('sin configuración o con fallo de red no simula una publicación exitosa', async () => {
  assert.equal(editorPublisherUrl(), '');
  await assert.rejects(() => editorRequest('/publish', {}), error => error.status === 503);
  await assert.rejects(() => editorRequest('/publish', {}, { publisherUrl: 'https://publisher.test', fetcher: async () => { throw new Error('network details with sensitive-string'); } }), error => error.message.includes('Conservá una copia') && !error.message.includes('sensitive-string'));
});

test('un token de conexión viaja en el cuerpo y no se persiste en almacenamiento del navegador', async () => {
  const before = [...storage.entries()];
  let body;
  await editorRequest('/connection', { apiToken: 'provider-test-token' }, { publisherUrl: 'https://publisher.test', fetcher: async (_url, options) => { body = JSON.parse(options.body); return Response.json({ publishingAvailable: true }); } });
  assert.deepEqual(body, { apiToken: 'provider-test-token' });
  assert.deepEqual([...storage.entries()], before);
});

test('si no hay IndexedDB se informa cómo conservar el borrador, sin pasar fotos a localStorage', async () => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await assert.rejects(readEditorDraft, /Exportá una copia/);
  await assert.rejects(() => saveEditorDraft({ products: [] }, 'version'), /Exportá una copia/);
  assert.equal([...storage.values()].some(value => String(value).includes('products')), false);
});

test('preparar fotos rechaza SVG, formatos falsos y originales excesivos antes de procesarlos', async () => {
  await assert.rejects(() => prepareCatalogPhoto(new File(['<svg/>'], 'foto.svg', { type: 'image/svg+xml' })), /JPG, PNG o WebP/);
  await assert.rejects(() => prepareCatalogPhoto(new File(['anything'], 'foto.png', { type: 'text/plain' })), /JPG, PNG o WebP/);
  await assert.rejects(() => prepareCatalogPhoto({ type: 'image/jpeg', size: 21 * 1024 * 1024 }), /20 MB/);
});
