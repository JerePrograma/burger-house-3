import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBurgers, burgerFlyerEvidence, burgerIngredients } from '../lib/catalog-burgers.ts';
import { parseAdminAction, quoteLine } from '../lib/commerce.ts';
import { fixture } from './fixtures.mjs';

const find = id => buildBurgers().find(product => product.id === id);
test('sólo catálogo de hamburguesas y promociones presentes en los siete JPEG nuevos', () => {
  const products = buildBurgers();
  assert.equal(products.length, 18);
  assert.equal(products.filter(product => product.category === 'hamburguesas').length, 15);
  assert.equal(products.filter(product => product.category === 'combos').length, 3);
  assert.equal(new Set(products.map(product => product.id)).size, products.length);
  for (const absent of ['la-goat', 'la-burgasa', 'bill-ny', 'burga-casa']) assert.equal(products.some(product => product.id === absent), false);
  for (const evidence of burgerFlyerEvidence) assert.ok(evidence.source.startsWith('WhatsApp Image 2026-10-19'));
  for (const product of products) assert.doesNotThrow(() => parseAdminAction({ type: 'product', product }));
});
test('cada precio y tamaño transcripto coincide con evidencia nueva', () => {
  for (const evidence of burgerFlyerEvidence) {
    const product = find(evidence.id);
    assert.ok(product, evidence.id);
    if (evidence.id === 'combo-familiar') {
      assert.deepEqual(product.variants.map(variant => variant.price), [50000, 50000, 64000, 64000, 74000, 74000]);
    } else assert.deepEqual(Object.fromEntries(product.variants.map(variant => [variant.id, variant.price])), evidence.prices, evidence.id);
  }
  assert.equal(find('cheese-burger').variants.at(-1).patties, 5);
  assert.deepEqual(find('la-bajonera').variants.map(variant => variant.id), ['triple']);
  assert.deepEqual(find('bomba-chesse-house').variants.map(variant => variant.id), ['doble', 'triple']);
});
test('Clásica no hereda cheddar/huevo viejos y Burger Loca usa salsa de la casa', () => {
  assert.deepEqual(find('clasica').recipe.map(part => part.ingredientId), ['pan-hamburguesa', 'medallon', 'papas', 'tomate', 'lechuga']);
  assert.ok(find('burger-loca').recipe.some(part => part.ingredientId === 'salsa-casa'));
  assert.equal(find('burger-loca').recipe.some(part => part.ingredientId === 'salsa-tasty'), false);
  assert.ok(find('jamon-queso').recipe.some(part => part.ingredientId === 'queso-jyq'));
  assert.ok(find('la-bajonera').recipe.some(part => part.ingredientId === 'aro-cebolla'));
});
test('familiar descuenta cinco burgers del tamaño elegido y el queso es excluyente', () => {
  const state = fixture();
  const product = find('combo-familiar');
  state.products = [product];
  const requiredIds = [...new Set(product.variants.flatMap(variant => variant.recipe.map(part => part.ingredientId)))];
  state.ingredients = requiredIds.map(id => ({ id, name: id, unit: 'u', stock: 100000, minStock: 0, extraPrice: 0, extraPortion: 1, maxPerPatty: 3 }));
  const line = quoteLine(state, { key: 'familiar', productId: product.id, variantId: 'triple-tybo', quantity: 1, removed: [], extras: {}, notes: '' });
  assert.equal(line.unitPrice, 74000);
  assert.equal(line.consumption['pan-hamburguesa'], 5);
  assert.equal(line.consumption.medallon, 15);
  assert.equal(line.consumption.tybo, 15);
  assert.equal(line.consumption.cheddar, undefined);
});
test('infantil conserva cuatro nuggets y promo Bomba conserva precio publicado bloqueando compra', () => {
  assert.equal(find('combo-infantil').recipe.find(part => part.ingredientId === 'nugget').amount, 4);
  const promo = find('promo-bomba-chesse');
  assert.equal(promo.variants[0].price, 29000);
  assert.ok(promo.unresolved);
  const state = fixture();
  state.products = [promo];
  assert.throws(() => quoteLine(state, { key: 'promo', productId: promo.id, variantId: 'promo-dos', quantity: 1, removed: [], extras: {}, notes: '' }), /no está disponible/);
  assert.equal(burgerIngredients.find(ingredient => ingredient.id === 'queso-jyq').name, 'Queso (tipo a confirmar)');
});
test('la nueva categoría panchos se puede guardar sin reutilizar otra categoría', () => {
  const pancho = { ...find('cheese-burger'), id: 'pancho-prueba', category: 'panchos' };
  assert.equal(parseAdminAction({ type: 'product', product: pancho }).product.category, 'panchos');
});
