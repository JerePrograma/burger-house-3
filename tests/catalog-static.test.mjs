import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import frontendConfig from '../frontend.config.json' with { type: 'json' };
import { defaultPublishedCatalog, loadPublishedCatalog, normalizePublishedCatalog, validateCatalogCart } from '../lib/catalog-static.ts';
import { itemPrice } from '../lib/domain.ts';
import { buildCatalogSnapshot } from '../scripts/build-catalog-snapshot.mjs';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
});

function catalog() {
  return {
    config: { name: 'Burger House 3', tagline: 'Hechas con amor', whatsapp: '5491123344218', instagram: 'burgerhousee3', deliveryFee: 1000, deliveryFeeMode: 'fixed', deliveryZone: 'Marcos Paz', acceptingOrders: true },
    ingredients: [
      { id: 'pan', name: 'Pan', unit: 'u', stock: 0, minStock: 0, extraPrice: 0, extraPortion: 1, maxPerPatty: 0, available: true },
      { id: 'medallon', name: 'Medallón', unit: 'u', stock: 0, minStock: 0, extraPrice: 3500, extraPortion: 1, maxPerPatty: 5, available: true },
      { id: 'cheddar', name: 'Cheddar', unit: 'u', stock: 0, minStock: 0, extraPrice: 500, extraPortion: 1, maxPerPatty: 3, available: true },
    ],
    products: [{ id: 'clasica', name: 'Clásica', category: 'hamburguesas', description: 'Nuestra burger', image: '/images/clasica.webp', active: true, available: true,
      variants: [{ id: 'simple', name: 'Simple', price: 10000, patties: 1, available: true }, { id: 'doble', name: 'Doble', price: 13000, patties: 2, available: true }],
      recipe: [{ ingredientId: 'pan', amount: 1, removable: false }, { ingredientId: 'medallon', amount: 1, scalesWithPatties: true, removable: false }, { ingredientId: 'cheddar', amount: 1, scalesWithPatties: true, removable: true }], extras: ['cheddar', 'medallon'] }],
  };
}
function cart(changes = {}) {
  return [{ key: 'line-1', productId: 'clasica', variantId: 'simple', quantity: 1, removed: [], extras: {}, notes: '', ...changes }];
}

test('publicar un teléfono inválido no puede romper los enlaces de WhatsApp de la tienda', () => {
  const value = catalog();
  value.config.whatsapp = '1234567';
  assert.throws(() => normalizePublishedCatalog(value), /WhatsApp/);
  value.config.whatsapp = '+12345678';
  assert.equal(normalizePublishedCatalog(value).config.whatsapp, '+12345678');
});

test('el catálogo empaquetado contiene sólo datos públicos y funciona sin stock operativo', () => {
  const first = defaultPublishedCatalog();
  assert.ok(first.products.length > 0);
  assert.deepEqual(Object.keys(first).sort(), ['config', 'ingredients', 'products']);
  assert.ok(first.ingredients.every(ingredient => ingredient.stock === 0 && ingredient.minStock === 0));
  assert.ok(first.products.filter(product => product.unresolved).every(product => !product.available));
  first.products[0].name = 'Cambio local';
  assert.notEqual(defaultPublishedCatalog().products[0].name, 'Cambio local');
});

test('normalizar elimina stock interno y conserva las disponibilidades manuales', () => {
  const value = catalog();
  value.ingredients[0].stock = 200; value.ingredients[0].minStock = 20;
  value.ingredients[1].available = false;
  value.products[0].variants[1].available = false;
  const result = normalizePublishedCatalog(value);
  assert.equal(result.ingredients[0].stock, 0); assert.equal(result.ingredients[0].minStock, 0);
  assert.equal(result.ingredients[1].available, false);
  assert.equal(result.products[0].variants[0].available, true);
  assert.equal(result.products[0].variants[1].available, false);
  value.products[0].available = false;
  const paused = normalizePublishedCatalog(value);
  assert.equal(paused.products[0].available, false);
  assert.equal(paused.products[0].variants[0].available, true);
  assert.equal(paused.products[0].variants[1].available, false);
  assert.equal(value.ingredients[0].stock, 200, 'no mutar el documento administrativo de origen');
});

test('publicar y reactivar un producto recupera sus opciones sin habilitar variantes agotadas', () => {
  let value = catalog();
  value.products[0].variants[1].available = false;
  value.products[0].available = false;
  value = normalizePublishedCatalog(value);
  assert.throws(() => validateCatalogCart(cart(), value), /disponible/);
  value.products[0].available = true;
  value = normalizePublishedCatalog(value);
  assert.doesNotThrow(() => validateCatalogCart(cart(), value));
  assert.throws(() => validateCatalogCart(cart({ variantId: 'doble' }), value), /disponible/);
  value.products[0].active = false;
  value = normalizePublishedCatalog(value);
  assert.throws(() => validateCatalogCart(cart(), value), /disponible/);
  value.products[0].active = true;
  value = normalizePublishedCatalog(value);
  assert.doesNotThrow(() => validateCatalogCart(cart(), value));
  assert.equal(value.products[0].variants[1].available, false);
});

test('resolver una consulta no cambia los interruptores manuales de disponibilidad', () => {
  let value = catalog(); value.products[0].unresolved = 'Contenido por confirmar';
  value = normalizePublishedCatalog(value);
  assert.throws(() => validateCatalogCart(cart(), value), /disponible/);
  delete value.products[0].unresolved;
  value = normalizePublishedCatalog(value);
  assert.doesNotThrow(() => validateCatalogCart(cart(), value));
});

test('no admite pedidos, caja ni otros campos privados en un documento público', () => {
  for (const field of ['orders', 'cash', 'movements', 'nextOrderNumber', 'ownerUserId', '__proto__']) {
    const value = { ...catalog(), [field]: [] };
    assert.throws(() => normalizePublishedCatalog(value), /campos desconocidos o privados/);
  }
  const value = catalog(); value.ingredients[0].password = 'private';
  assert.throws(() => normalizePublishedCatalog(value), /campos desconocidos o privados/);
});

test('valida referencias, duplicados, precios y límites del catálogo', () => {
  let value = catalog(); value.products[0].recipe[0].ingredientId = 'inexistente';
  assert.throws(() => normalizePublishedCatalog(value), /ingrediente inexistente/);
  value = catalog(); value.products.push(structuredClone(value.products[0]));
  assert.throws(() => normalizePublishedCatalog(value), /duplicados/);
  value = catalog(); value.products[0].variants[0].price = -1;
  assert.throws(() => normalizePublishedCatalog(value), /Precio/);
  value = catalog(); value.products[0].variants[0].price = Number.NaN;
  assert.throws(() => normalizePublishedCatalog(value), /Precio/);
  value = catalog(); value.products = Array.from({ length: 301 }, () => value.products[0]);
  assert.throws(() => normalizePublishedCatalog(value), /Productos: cantidad/);
  value = catalog(); value.products[0].description = 'x'.repeat(21 * 1024 * 1024);
  assert.throws(() => normalizePublishedCatalog(value), /20 MB/);
});

test('admite imágenes raster y rechaza SVG, rutas externas, traversal y fotos mayores a 1 MB', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cK/8AAAAASUVORK5CYII=';
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')}`;
  const webp = `data:image/webp;base64,${Buffer.from('RIFF0000WEBP', 'ascii').toString('base64')}`;
  for (const image of ['/images/nueva-foto.png', png, jpeg, webp]) {
    const value = catalog(); value.products[0].image = image;
    assert.equal(normalizePublishedCatalog(value).products[0].image, image);
  }
  for (const image of ['https://external.test/photo.png', '/images/photo.svg', '/images/../private.png', '/images/%2e%2e/private.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,PHN2Zz4=']) {
    const value = catalog(); value.products[0].image = image;
    assert.throws(() => normalizePublishedCatalog(value), /imagen|Imagen/);
  }
  const tooLarge = Buffer.alloc(1024 * 1024 + 1); tooLarge.set([0xff, 0xd8, 0xff]);
  const value = catalog(); value.products[0].image = `data:image/jpeg;base64,${tooLarge.toString('base64')}`;
  assert.throws(() => normalizePublishedCatalog(value), /1 MB/);
});

test('el carrito público admite personalizaciones aun con inventario cero', () => {
  assert.doesNotThrow(() => validateCatalogCart(cart({ quantity: 2, removed: ['cheddar'], extras: { cheddar: 3 }, notes: 'Papas sin sal 🌶️' }), catalog()));
  assert.doesNotThrow(() => validateCatalogCart(cart({ variantId: 'doble', extras: { cheddar: 4 } }), catalog()));
  assert.throws(() => validateCatalogCart(cart({ extras: { cheddar: 3 } }), catalog()), /Máximo 3/);
  assert.throws(() => validateCatalogCart(cart({ variantId: 'doble', extras: { cheddar: 5 } }), catalog()), /Máximo 6/);
});

test('quitar un ingrediente sin extra ofrecido tolera el cero de carritos anteriores y conserva el precio', () => {
  const value = catalog();
  value.products[0].extras = ['medallon'];
  const [item] = cart({ removed: ['cheddar'], extras: { cheddar: 0 } });
  assert.doesNotThrow(() => validateCatalogCart([item], value));
  assert.equal(itemPrice(item, value.products[0], value.ingredients), 10000);
  assert.throws(() => validateCatalogCart(cart({ removed: ['cheddar'], extras: { cheddar: 1 } }), value), /no está permitido/);
});

test('el límite de adicionales cuenta los medallones reales de combos', () => {
  const value = catalog(); value.products[0].recipe[1].amount = 5; value.products[0].recipe[2].amount = 5;
  assert.doesNotThrow(() => validateCatalogCart(cart({ extras: { cheddar: 10 } }), value));
  assert.throws(() => validateCatalogCart(cart({ extras: { cheddar: 11 } }), value), /Máximo 15/);
});

test('carritos restaurados detectan productos, variantes y adicionales desactualizados', () => {
  for (const changes of [{ productId: 'eliminado' }, { variantId: 'eliminada' }, { extras: { tomate: 1 } }, { removed: ['tomate'] }, { removed: ['pan'] }]) {
    assert.throws(() => validateCatalogCart(cart(changes), catalog()), /disponible|permitido|quitar/);
  }
  for (const mutate of [value => { value.products[0].active = false; }, value => { value.products[0].available = false; }, value => { value.products[0].unresolved = 'Consultar'; }, value => { value.products[0].variants[0].available = false; }]) {
    const value = catalog(); mutate(value);
    assert.throws(() => validateCatalogCart(cart(), value), /disponible/);
  }
  const value = catalog(); value.ingredients[2].available = false;
  assert.throws(() => validateCatalogCart(cart({ extras: { cheddar: 1 } }), value), /adicional.*disponible/);
  value.config.acceptingOrders = false;
  assert.throws(() => validateCatalogCart(cart(), value), /no está tomando pedidos/);
});

test('el carrito rechaza cantidades inválidas, notas abusivas, duplicados y claves peligrosas', () => {
  for (const quantity of [0, -1, 21, 1.5, Number.NaN, '2']) assert.throws(() => validateCatalogCart(cart({ quantity }), catalog()), /Cantidad/);
  for (const extras of [{ cheddar: -1 }, { cheddar: 1.5 }, { cheddar: 31 }, JSON.parse('{"__proto__":1}')]) assert.throws(() => validateCatalogCart(cart({ extras }), catalog()), /Cantidad|Identificador/);
  assert.throws(() => validateCatalogCart(cart({ notes: 'x'.repeat(501) }), catalog()), /Notas/);
  assert.throws(() => validateCatalogCart(cart({ notes: '\u0000' }), catalog()), /Notas/);
  assert.throws(() => validateCatalogCart(cart({ removed: ['cheddar', 'cheddar'] }), catalog()), /duplicados/);
  assert.throws(() => validateCatalogCart([...cart(), ...cart()], catalog()), /duplicados/);
  assert.throws(() => validateCatalogCart([], catalog()), /Carrito/);
});

test('la carga lee únicamente el JSON estático y usa sus precios publicados', async () => {
  const value = catalog(); value.products[0].variants[0].price = 12345;
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(value)); };
  const result = await loadPublishedCatalog();
  assert.equal(result.products[0].variants[0].price, 12345);
  assert.equal(requests.length, 1); assert.equal(requests[0].url, '/catalog.json');
  assert.equal(requests[0].init.credentials, 'omit'); assert.equal(requests[0].init.cache, 'no-cache');
});

test('fallas de red, HTTP o documento conservan el catálogo empaquetado utilizable', async () => {
  const fallback = defaultPublishedCatalog();
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => new Response('no', { status: 503 }), async () => new Response('malformed'), async () => new Response(JSON.stringify({ ...catalog(), orders: [] })), async () => new Response('{}', { headers: { 'content-length': String(21 * 1024 * 1024) } })]) {
    globalThis.fetch = fetcher;
    const result = await loadPublishedCatalog();
    assert.deepEqual(result, fallback);
  }
});

test('Android recupera precios nuevos desde el JSON público y nunca consulta el backend', async () => {
  const value = catalog(); value.products[0].variants[0].price = 19876;
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json(value); };
  const result = await loadPublishedCatalog({ native: true });
  assert.equal(result.products[0].variants[0].price, 19876);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, frontendConfig.catalogUrl);
  const destination = new URL(requests[0].url);
  assert.notEqual(destination.hostname, 'localhost');
  assert.equal(destination.pathname, new URL(frontendConfig.catalogUrl).pathname);
  assert.equal(requests[0].init.credentials, 'omit');
  assert.ok(!requests[0].url.includes('/api/'));
});

test('la tienda recibe aviso de copia local y se limpia al recuperar una publicación válida', async () => {
  const events = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent(event) { events.push(event.type); return true; } } });
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadPublishedCatalog(), defaultPublishedCatalog());
  const published = catalog(); published.products[0].variants[0].price = 22222;
  globalThis.fetch = async () => Response.json(published);
  assert.equal((await loadPublishedCatalog()).products[0].variants[0].price, 22222);
  assert.deepEqual(events, ['bh3:catalog-fallback', 'bh3:catalog-loaded']);
});

test('una conexión detenida se aborta usando un timeout de prueba breve', async () => {
  let signal;
  globalThis.fetch = async (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  const started = Date.now();
  const result = await loadPublishedCatalog({ timeoutMs: 5 });
  assert.equal(signal.aborted, true); assert.deepEqual(result, defaultPublishedCatalog());
  assert.ok(Date.now() - started < 1000);
});

test('el generador preserva ediciones existentes y sólo reemplaza con --refresh-seed explícito', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bh3-public-catalog-'));
  const outputPath = join(directory, 'catalog.json');
  try {
    assert.equal((await buildCatalogSnapshot({ outputPath })).created, true);
    const initial = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(initial.products.length, 48);
    assert.ok(initial.ingredients.every(ingredient => ingredient.stock === 0 && ingredient.minStock === 0));
    normalizePublishedCatalog(initial);
    writeFileSync(outputPath, '{"edited":"preserve exactly"}\n', 'utf8');
    assert.equal((await buildCatalogSnapshot({ outputPath })).created, false);
    assert.equal(readFileSync(outputPath, 'utf8'), '{"edited":"preserve exactly"}\n');
    assert.equal((await buildCatalogSnapshot({ outputPath, refreshSeed: true })).created, true);
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).products.length, 48);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
