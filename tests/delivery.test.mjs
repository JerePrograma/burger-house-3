import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdminAction, createIdempotentOrder, createOrder, parseAdminAction, parseOrderInput, verifyPayment } from '../lib/commerce.ts';
import { fixture, input } from './fixtures.mjs';

function deliveryInput() {
  const data = input();
  data.customer.fulfillment = 'delivery';
  data.customer.address = 'Barrio de prueba 123';
  return parseOrderInput(data);
}
test('envío a cotizar: total provisional y stock intacto hasta fijar envío y verificar pago', () => {
  const state = fixture();
  state.config.deliveryFeeMode = 'quote';
  const order = createOrder(state, deliveryInput());
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.deliveryFeePending, true);
  assert.equal(order.total, order.subtotal);
  assert.throws(() => verifyPayment(state, order.id), error => error.status === 409 && /Cotizá/.test(error.message));
  assert.equal(state.ingredients[1].stock, 10);
  const quote = parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount: 2500 });
  applyAdminAction(state, quote);
  applyAdminAction(state, quote);
  assert.equal(order.deliveryFeePending, false);
  assert.equal(order.deliveryFee, 2500);
  assert.equal(order.total, 12500);
  verifyPayment(state, order.id);
  verifyPayment(state, order.id);
  assert.equal(state.ingredients[1].stock, 9);
  assert.throws(() => applyAdminAction(state, { ...quote, amount: 3500 }), error => error.status === 409);
  assert.equal(order.total, 12500);
});
test('reintentar el pedido no elimina una cotización ya guardada ni el pago verificado', () => {
  const book = { state: fixture(), idempotencies: {} };
  book.state.config.deliveryFeeMode = 'quote';
  const data = deliveryInput();
  const order = createIdempotentOrder(book, data, 'same-body');
  applyAdminAction(book.state, parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount: 1800 }));
  verifyPayment(book.state, order.id);
  const again = createIdempotentOrder(book, data, 'same-body');
  assert.equal(again.id, order.id);
  assert.equal(again.deliveryFeePending, false);
  assert.equal(again.total, 11800);
  assert.equal(again.paid, true);
  assert.equal(book.state.orders.length, 1);
});
test('retiro no genera cotización pendiente y no admite costo de envío', () => {
  const state = fixture();
  state.config.deliveryFeeMode = 'quote';
  state.config.deliveryFee = 9999;
  const order = createOrder(state, parseOrderInput(input()));
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.deliveryFeePending, undefined);
  assert.equal(order.total, 10000);
  assert.throws(() => applyAdminAction(state, parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount: 1000 })), /retirar/);
  verifyPayment(state, order.id);
  assert.equal(order.paid, true);
});
test('cotización cero válida; negativa, fraccionaria o pedido cancelado se rechazan', () => {
  const state = fixture();
  state.config.deliveryFeeMode = 'quote';
  const order = createOrder(state, deliveryInput());
  for (const amount of [-1, 12.5, '1000', 100001]) assert.throws(() => parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount }));
  applyAdminAction(state, parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount: 0 }));
  assert.equal(order.deliveryFeePending, false);
  applyAdminAction(state, parseAdminAction({ type: 'order-status', orderId: order.id, status: 'cancelado' }));
  assert.throws(() => applyAdminAction(state, parseAdminAction({ type: 'delivery-fee', orderId: order.id, amount: 1000 })), error => error.status === 409);
});
