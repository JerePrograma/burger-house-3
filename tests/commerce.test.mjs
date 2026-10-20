import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { applyAdminAction, changeOrderStatus, createIdempotentOrder, createOrder, orderConsumption, parseAdminAction, parseOrderInput, publicCatalog, publicOrder, quoteLine, trackedOrder, verifyPayment } from '../lib/commerce.ts';
import { fixture, input } from './fixtures.mjs';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { createSeed } = await import('../lib/seed.ts');

test('el servidor calcula precio y quitar ingredientes no lo baja', () => {
  const state = fixture();
  const data = parseOrderInput(input({ removed: ['tomate'], extras: { cheddar: 2 } }));
  const order = createOrder(state, data);
  assert.equal(order.total, 11000);
  assert.equal(order.lines[0].consumption.cheddar, 3);
  assert.equal(order.lines[0].consumption.tomate, undefined);
  assert.throws(() => parseOrderInput({ ...input(), total: 1 }), /campos desconocidos/);
});
test('doble escala medallón y cheddar, conservando una porción de papas por unidad', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input({ variantId: 'doble', quantity: 2 })));
  assert.equal(order.total, 26000);
  assert.deepEqual(orderConsumption(order), { pan: 2, carne: 4, cheddar: 4, tomate: 40, papas: 400 });
});
test('no descuenta al crear y verifica el pago exactamente una vez', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  assert.equal(state.ingredients[1].stock, 10);
  verifyPayment(state, order.id);
  verifyPayment(state, order.id);
  assert.equal(state.ingredients[1].stock, 9);
  assert.equal(state.movements.length, 5);
  assert.equal(order.status, 'pendiente');
});
test('la receta y precio quedan congelados frente a cambios del catálogo', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  state.products[0].recipe[1].amount = 4;
  state.products[0].variants[0].price = 1;
  verifyPayment(state, order.id);
  assert.equal(state.ingredients[1].stock, 9);
  assert.equal(order.total, 10000);
});
test('stock insuficiente al verificar no produce descuentos parciales', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  state.ingredients[4].stock = 0;
  assert.throws(() => verifyPayment(state, order.id), /papas/);
  assert.equal(state.ingredients[0].stock, 10);
  assert.equal(order.paid, false);
  assert.equal(state.movements.length, 0);
});
test('comprueba la suma del carrito para ingredientes compartidos', () => {
  const state = fixture();
  state.ingredients[1].stock = 1;
  const data = input();
  data.items.push({ ...data.items[0], key: 'linea-2' });
  assert.throws(() => createOrder(state, parseOrderInput(data)), /carne/);
  assert.equal(state.orders.length, 0);
  assert.equal(state.nextOrderNumber, 1);
});
test('límites de extras incluyen lo que trae la receta base', () => {
  const state = fixture();
  assert.throws(() => quoteLine(state, parseOrderInput(input({ extras: { cheddar: 3 } })).items[0]), /Máximo 3/);
  const order = createOrder(state, parseOrderInput(input({ variantId: 'doble', extras: { cheddar: 4 } })));
  assert.equal(order.lines[0].consumption.cheddar, 6);
  assert.throws(() => createOrder(fixture(), parseOrderInput(input({ extras: { pan: 1 } }))), /no está permitido/);
  assert.throws(() => createOrder(fixture(), parseOrderInput(input({ removed: ['carne'] }))), /No se puede quitar/);
});
test('cancelar antes de preparar devuelve el stock una sola vez', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  verifyPayment(state, order.id);
  changeOrderStatus(state, order.id, 'aceptado');
  changeOrderStatus(state, order.id, 'cancelado');
  changeOrderStatus(state, order.id, 'cancelado');
  assert.equal(state.ingredients[1].stock, 10);
  assert.equal(order.stockReturned, true);
  assert.equal(state.movements.length, 10);
});
test('cancelar después de preparar registra merma sin reponer insumos', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  verifyPayment(state, order.id);
  changeOrderStatus(state, order.id, 'aceptado');
  changeOrderStatus(state, order.id, 'preparando');
  changeOrderStatus(state, order.id, 'cancelado');
  assert.equal(state.ingredients[1].stock, 9);
  assert.equal(order.stockReturned, false);
  assert.equal(state.movements.filter(item => item.reason.startsWith('Merma')).length, 5);
  assert.throws(() => verifyPayment(state, order.id), /cancelado/);
});
test('estados secuenciales y preparación con pago verificado', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  assert.throws(() => changeOrderStatus(state, order.id, 'listo'), /un estado/);
  changeOrderStatus(state, order.id, 'aceptado');
  assert.throws(() => changeOrderStatus(state, order.id, 'preparando'), /Verificá/);
  verifyPayment(state, order.id);
  for (const status of ['preparando', 'listo', 'entregado']) changeOrderStatus(state, order.id, status);
  assert.throws(() => changeOrderStatus(state, order.id, 'cancelado'), /cerrado/);
});
test('receta por variante reemplaza a la común y multiplica formatos', () => {
  const state = fixture();
  state.products[0].variants[0].recipe = [{ ingredientId: 'pan', amount: 1 }];
  state.products[0].variants[0].recipeMultiplier = 6;
  const order = createOrder(state, parseOrderInput(input()));
  assert.deepEqual(order.lines[0].consumption, { pan: 6 });
});
test('catálogo y seguimiento ocultan stock y consumo; la respuesta propia conserva contacto', () => {
  const state = fixture();
  const order = createOrder(state, parseOrderInput(input()));
  const catalog = publicCatalog(state);
  assert.ok(catalog.ingredients.every(item => item.stock === 0 && item.minStock === 0));
  assert.equal(catalog.products[0].variants[0].available, true);
  state.ingredients[1].stock = 0;
  assert.equal(publicCatalog(state).products[0].available, false);
  const visible = publicOrder(order);
  assert.equal(visible.customer.phone, '1123344218');
  assert.deepEqual(visible.lines[0].consumption, {});
  assert.equal(order.customer.phone, '1123344218');
});
test('seguimiento exige id y token correctos y preserva datos propios de delivery', () => {
  const state = fixture();
  const data = input();
  data.customer = { ...data.customer, fulfillment: 'delivery', address: 'Calle de prueba 123', notes: 'Timbre azul' };
  const order = createOrder(state, parseOrderInput(data));
  for (const [orderId, token] of [[order.id, null], [null, order.trackingToken], [order.id, 'incorrecto'], ['otro', order.trackingToken]]) assert.throws(() => trackedOrder(state, orderId, token), error => error.status === 404);
  const visible = trackedOrder(state, order.id, order.trackingToken);
  assert.equal(visible.customer.address, data.customer.address);
  assert.equal(visible.customer.phone, data.customer.phone);
  assert.equal(visible.customer.notes, data.customer.notes);
  assert.equal(visible.deliveryFee, 1000);
  assert.deepEqual(visible.lines[0].consumption, {});
});
test('reintento idempotente devuelve el mismo pedido; distinto contenido rechaza', () => {
  const book = { state: fixture(), idempotencies: {} };
  const data = parseOrderInput(input());
  const first = createIdempotentOrder(book, data, 'hash-a');
  const second = createIdempotentOrder(book, data, 'hash-a');
  assert.equal(first.id, second.id);
  assert.equal(book.state.orders.length, 1);
  assert.throws(() => createIdempotentOrder(book, data, 'hash-b'), /otro pedido/);
});
test('validación rechaza cantidades, campos y adicionales falsificados', () => {
  for (const quantity of [-1, 0, 1.5, 21, '2', Infinity]) assert.throws(() => parseOrderInput(input({ quantity })));
  assert.throws(() => parseOrderInput(input({ extras: { cheddar: -1 } })));
  assert.throws(() => parseOrderInput(input({ removed: ['tomate', 'tomate'] })));
  assert.throws(() => parseOrderInput(input({ productId: '__proto__' })));
  assert.throws(() => parseAdminAction({ type: 'verify-payment', orderId: '1', paid: true }));
  assert.throws(() => parseOrderInput({ ...input(), customer: { ...input().customer, fulfillment: 'delivery', address: '' } }));
});
test('movimientos impiden stock negativo y edición de metadatos conserva stock actual', () => {
  const state = fixture();
  assert.throws(() => applyAdminAction(state, parseAdminAction({ type: 'stock', ingredientId: 'carne', amount: -11, reason: 'Merma' })), /negativo/);
  applyAdminAction(state, parseAdminAction({ type: 'stock', ingredientId: 'carne', amount: -2, reason: 'Merma' }));
  applyAdminAction(state, parseAdminAction({ type: 'ingredient', ingredient: { ...state.ingredients[1], stock: 10, extraPrice: 700 } }));
  assert.equal(state.ingredients[1].stock, 8);
  assert.equal(state.ingredients[1].extraPrice, 700);
});
test('un conteo obsoleto no sobrescribe una venta ocurrida mientras se contaba', () => {
  const state = fixture();
  const count = parseAdminAction({ type: 'stock', ingredientId: 'carne', amount: 2, expectedStock: 10, reason: 'Conteo físico: 12' });
  const order = createOrder(state, parseOrderInput(input()));
  verifyPayment(state, order.id);
  assert.throws(() => applyAdminAction(state, count), error => error.status === 409);
  assert.equal(state.ingredients[1].stock, 9);
  const refreshed = parseAdminAction({ ...count, expectedStock: 9, amount: 3 });
  applyAdminAction(state, refreshed);
  assert.equal(state.ingredients[1].stock, 12);
});
test('catálogo real: todos los productos e insumos admiten edición validada', () => {
  const state = createSeed();
  for (const ingredient of state.ingredients) assert.doesNotThrow(() => parseAdminAction({ type: 'ingredient', ingredient }));
  for (const product of state.products) {
    const action = parseAdminAction({ type: 'product', product });
    assert.doesNotThrow(() => applyAdminAction(state, action));
    if (product.unresolved) continue;
    for (const variant of product.variants) {
      const line = quoteLine(state, { key: 'prueba', productId: product.id, variantId: variant.id, quantity: 1, removed: [], extras: {}, notes: '' });
      assert.equal(line.unitPrice, variant.price);
      assert.ok(Object.values(line.consumption).every(amount => amount > 0 && Number.isFinite(amount)));
    }
  }
});
