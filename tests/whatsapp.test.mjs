import test from 'node:test';
import assert from 'node:assert/strict';
import { draftWhatsAppMessage, orderRequestIdentity, orderWhatsAppMessage, whatsappUrl } from '../lib/whatsapp.ts';
import { money } from '../lib/domain.ts';

function order() {
  return {
    id: 'order-test', number: 42, createdAt: '2026-10-20T15:00:00Z',
    customer: { name: 'María Pérez', phone: '1100000000', fulfillment: 'delivery', address: 'Calle de prueba 123, Marcos Paz', notes: 'Timbre azul' },
    lines: [{ key: 'line-1', productId: 'clasica', variantId: 'doble', quantity: 2, removed: ['tomate'], extras: { cheddar: 2 }, notes: 'Papas sin sal 🌶️', name: 'Clásica', variantName: 'Doble', unitPrice: 14000, removedNames: ['Tomate'], extraNames: ['Cheddar ×2'], consumption: {} }],
    subtotal: 28000, deliveryFee: 0, deliveryFeePending: true, total: 28000,
    paymentMethod: 'transferencia', paid: false, status: 'pendiente', source: 'web', trackingToken: 'private-order-token', stockDeducted: false, stockReturned: false,
  };
}

test('WhatsApp normaliza el teléfono internacional y preserva acentos, emoji y saltos de línea', () => {
  const message = 'Clásica con ñ, ¿sin tomate? 🌶️\nNotas: A&B + queso';
  const url = new URL(whatsappUrl('+54 (9) 11-2334-4218', message));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/5491123344218');
  assert.equal(url.searchParams.get('text'), message);
  for (const phone of ['', '123', '549112334421812345', 'https://evil.test/5491123344218']) assert.throws(() => whatsappUrl(phone, message), /WhatsApp/);
});

test('el mensaje conserva cantidades, cambios por unidad, importes congelados y todos los datos de entrega', () => {
  const saved = order();
  const message = orderWhatsAppMessage(saved);
  for (const part of ['Solicitud de pedido #42', '2 × Clásica · Doble', 'Sin: Tomate', 'Adicionales por unidad: Cheddar ×2', 'Papas sin sal 🌶️', 'María Pérez', '1100000000', saved.customer.address, 'Timbre azul', 'Transferencia']) assert.ok(message.includes(part), part);
  assert.ok(message.includes(`Importe web por unidad: ${money(14000)}`));
  assert.ok(message.includes(`Importe web del renglón: ${money(28000)}`));
  assert.ok(!message.includes(saved.trackingToken));
  assert.ok(message.includes('Disponibilidad, adicionales, envío y total final a confirmar por el local.'));
});

test('un envío a cotizar nunca se presenta como gratuito ni como total final', () => {
  const message = orderWhatsAppMessage(order());
  assert.ok(message.includes('Envío: a confirmar según el barrio'));
  assert.ok(message.includes(`Importe web sin envío: ${money(28000)}`));
  assert.ok(!message.includes(`Envío: ${money(0)}`));
  assert.ok(!message.includes('Importe web del pedido:'));
});

test('retiro y envío fijo muestran sus importes sin confundir medios de pago históricos', () => {
  const saved = order();
  saved.deliveryFeePending = false; saved.deliveryFee = 1200; saved.total = 29200; saved.paymentMethod = 'mercadopago';
  let message = orderWhatsAppMessage(saved);
  assert.ok(message.includes(`Envío: ${money(1200)}`));
  assert.ok(message.includes(`Importe web del pedido: ${money(29200)}`));
  assert.ok(message.includes('Forma de pago a coordinar: Mercado Pago'));
  saved.customer.fulfillment = 'retiro'; saved.deliveryFee = 0; saved.total = 28000; saved.paymentMethod = 'efectivo';
  message = orderWhatsAppMessage(saved);
  assert.ok(message.includes('Entrega: retiro en el local'));
  assert.ok(message.includes('Retiro: sin costo de envío'));
  assert.ok(!message.includes(saved.customer.address));
  assert.ok(message.includes('Forma de pago a coordinar: Efectivo'));
});

test('el seguimiento de pedidos ya aceptados o terminados abre una consulta y no una nueva solicitud', () => {
  for (const status of ['aceptado', 'preparando', 'listo', 'entregado', 'cancelado']) {
    const saved = order(); saved.status = status;
    const message = orderWhatsAppMessage(saved);
    assert.ok(message.startsWith('Hola Burger House 3. Consulta por el pedido #42.'));
    assert.ok(!message.includes('Solicitud de pedido #'));
  }
});

test('la solicitud alternativa conserva el carrito completo sin inventar registro ni total', () => {
  const saved = order();
  const cart = saved.lines.map(({ key, productId, variantId, quantity, removed, extras, notes }) => ({ key, productId, variantId, quantity, removed, extras, notes }));
  const products = [{ id: 'clasica', name: 'Clásica', variants: [{ id: 'doble', name: 'Doble', price: 13000 }] }];
  const ingredients = [{ id: 'tomate', name: 'Tomate' }, { id: 'cheddar', name: 'Cheddar', extraPrice: 500 }];
  const message = draftWhatsAppMessage(cart, products, ingredients, { ...saved.customer, paymentMethod: saved.paymentMethod });
  for (const part of ['Solicitud sin registrar en la web.', '2 × Clásica · Doble', 'Sin: Tomate', 'Adicionales por unidad: Cheddar ×2', 'Papas sin sal 🌶️', 'María Pérez', '1100000000', saved.customer.address, 'Timbre azul']) assert.ok(message.includes(part), part);
  assert.ok(message.includes(`Precio base de referencia por unidad: ${money(13000)}`));
  assert.ok(message.includes('Disponibilidad, adicionales, envío y total final a confirmar por el local.'));
  assert.ok(!message.includes('pedido #'));
  assert.ok(!message.includes('Subtotal'));
  assert.ok(!message.includes('Total:'));
  assert.ok(!message.includes(money(28000)));
});

test('un producto o variante ausente se deriva a consulta sin asignarle un precio cero', () => {
  const saved = order();
  const message = draftWhatsAppMessage(saved.lines, [], [], { ...saved.customer, paymentMethod: saved.paymentMethod });
  assert.ok(message.includes('Producto a consultar (clasica)'));
  assert.ok(message.includes('Opción a confirmar'));
  assert.ok(message.includes('Precio a confirmar por el local'));
  assert.ok(!message.includes(money(0)));
});

test('un reintento con el mismo contenido retiene clave aunque cambie el orden de las propiedades', () => {
  const payload = { items: order().lines, customer: order().customer, paymentMethod: 'transferencia', source: 'web' };
  const first = orderRequestIdentity(payload);
  const retry = orderRequestIdentity({ source: 'web', customer: { ...payload.customer }, paymentMethod: 'transferencia', items: payload.items, idempotencyKey: first.key }, first);
  assert.strictEqual(retry, first);
  assert.match(first.key, /^[a-f0-9-]{36}$/);
});

test('editar cliente, entrega, pago, origen o carrito genera una solicitud distinta tras un fallo', () => {
  const payload = { items: order().lines, customer: order().customer, paymentMethod: 'transferencia', source: 'web' };
  const first = orderRequestIdentity(payload);
  const changes = [
    { ...payload, customer: { ...payload.customer, name: 'Otro cliente' } },
    { ...payload, customer: { ...payload.customer, phone: '1100000001' } },
    { ...payload, customer: { ...payload.customer, address: 'Otra dirección' } },
    { ...payload, customer: { ...payload.customer, notes: 'Otra indicación' } },
    { ...payload, paymentMethod: 'efectivo' },
    { ...payload, source: 'mostrador' },
    { ...payload, items: [{ ...payload.items[0], quantity: 1 }] },
    { ...payload, items: [{ ...payload.items[0], extras: { cheddar: 1 } }] },
  ];
  for (const changed of changes) assert.notEqual(orderRequestIdentity(changed, first).key, first.key);
});
