import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogWhatsAppMessage, whatsappUrl } from '../lib/whatsapp.ts';
import { money } from '../lib/domain.ts';

function fixture() {
  return {
    products: [{
      id: 'clasica', name: 'Clásica', active: true, available: true,
      variants: [{ id: 'doble', name: 'Doble', price: 13000 }],
      recipe: [{ ingredientId: 'tomate', amount: 1, removable: true }], extras: ['cheddar'],
    }],
    ingredients: [{ id: 'tomate', name: 'Tomate', extraPrice: 0 }, { id: 'cheddar', name: 'Cheddar', extraPrice: 500, available: true }],
    cart: [{ key: 'private-line-key', productId: 'clasica', variantId: 'doble', quantity: 2, removed: ['tomate'], extras: { cheddar: 2 }, notes: 'Papas sin sal 🌶️' }],
    checkout: { name: ' María Pérez ', phone: '', fulfillment: 'delivery', address: ' Calle 123 ', notes: ' Timbre azul ', paymentMethod: 'transferencia' },
    config: { name: 'Burger House 3', deliveryFeeMode: 'quote', deliveryFee: 0 },
  };
}
function message(data = fixture()) {
  return catalogWhatsAppMessage(data.cart, data.products, data.ingredients, data.checkout, data.config);
}

test('catálogo prepara un mensaje breve con extras calculados por unidad y sin registro interno', () => {
  const result = message();
  for (const expected of [
    `2 × Clásica · Doble — ${money(28000)}`, 'Sin por unidad: Tomate',
    'Extras por unidad: Cheddar ×2', 'Papas sin sal 🌶️', `Productos: ${money(28000)}`,
    'Delivery: Calle 123', 'Nombre: María Pérez', 'Pago: Transferencia', 'Observaciones: Timbre azul',
  ]) assert.ok(result.includes(expected), expected);
  for (const internal of ['private-line-key', 'registr', 'Estado', 'Subtotal web', 'Celular:', 'pedido #']) assert.ok(!result.includes(internal), internal);
  assert.ok(result.length < 500);
  assert.equal(new URL(whatsappUrl('5491123344218', result)).searchParams.get('text'), result);
});

test('delivery a cotizar no promete envío gratuito ni inventa un total final', () => {
  const data = fixture();
  for (const mode of ['quote', undefined]) {
    data.config.deliveryFeeMode = mode;
    const result = message(data);
    assert.ok(result.includes('Envío: a confirmar según el barrio'));
    assert.ok(!result.includes('Total:'));
    assert.ok(!result.includes(`Envío: ${money(0)}`));
  }
});

test('envío fijo suma la tarifa una vez y conserva un celular opcional', () => {
  const data = fixture();
  data.config.deliveryFeeMode = 'fixed'; data.config.deliveryFee = 1200;
  data.checkout.phone = ' 11 2345 6789 ';
  const result = message(data);
  assert.ok(result.includes(`Envío: ${money(1200)}`));
  assert.ok(result.includes(`Total: ${money(29200)}`));
  assert.ok(result.includes('Celular: 11 2345 6789'));
  assert.ok(!result.includes('a confirmar según el barrio'));
});

test('retiro no suma tarifa ni muestra la dirección anterior de delivery', () => {
  const data = fixture(); data.checkout.fulfillment = 'retiro'; data.config.deliveryFee = 1200;
  const result = message(data);
  assert.ok(result.includes('Retiro en el local · sin costo de envío'));
  assert.ok(result.includes(`Total: ${money(28000)}`));
  assert.ok(!result.includes('Calle 123'));
  assert.ok(!result.includes(money(29200)));
});

test('productos, variantes y adicionales ausentes o agotados se rechazan sin precios ficticios', () => {
  const changes = [
    data => { data.products = []; },
    data => { data.products[0].variants = []; },
    data => { data.products[0].active = false; },
    data => { data.products[0].available = false; },
    data => { data.products[0].variants[0].available = false; },
    data => { data.products[0].unresolved = 'Contenido a consultar'; },
    data => { data.ingredients = [data.ingredients[0]]; },
    data => { data.ingredients[1].available = false; },
    data => { data.products[0].extras = []; },
    data => { data.products[0].recipe = []; },
    data => { data.products[0].variants[0].price = NaN; },
    data => { data.ingredients[1].extraPrice = -1; },
    data => { data.cart[0].quantity = 0; },
    data => { data.cart[0].extras.cheddar = -1; },
    data => { data.cart[0].extras.cheddar = 1.5; },
  ];
  for (const change of changes) {
    const data = fixture(); change(data);
    assert.throws(() => message(data), Error);
  }
});

test('se requieren productos, nombre y dirección sólo para delivery', () => {
  let data = fixture(); data.cart = [];
  assert.throws(() => message(data), /producto/);
  data = fixture(); data.checkout.name = ' ';
  assert.throws(() => message(data), /nombre/);
  data = fixture(); data.checkout.address = ' ';
  assert.throws(() => message(data), /dirección/);
  data.checkout.fulfillment = 'retiro';
  assert.doesNotThrow(() => message(data));
});
