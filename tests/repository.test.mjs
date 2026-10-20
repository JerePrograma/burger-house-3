import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fixture, input } from './fixtures.mjs';
// Resolve extensionless project imports when running the TS source in Node.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { StoreRepository } = await import('../lib/repository.ts');
const { createIdempotentOrder, createOrder, parseOrderInput, verifyPayment } = await import('../lib/commerce.ts');

class MemoryD1 {
  row = null;
  prepare(sql) {
    return { bind: (...values) => ({
      first: async () => this.row ? { ...this.row } : null,
      run: async () => {
        if (sql.startsWith('INSERT')) {
          if (!this.row) this.row = { document: values[1], version: 0 };
          return { meta: { changes: 1 } };
        }
        if (this.row && this.row.version === values[2]) {
          this.row = { document: values[0], version: this.row.version + 1 };
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    }) };
  }
}
test('CAS: dos verificaciones concurrentes no venden el último medallón dos veces', async () => {
  const state = fixture();
  state.ingredients[1].stock = 1;
  const first = createOrder(state, parseOrderInput(input()));
  const second = createOrder(state, parseOrderInput({ ...input(), idempotencyKey: 'segundo-pedido-123' }));
  const store = new StoreRepository(new MemoryD1(), () => structuredClone(state));
  const results = await Promise.allSettled([
    store.update(document => verifyPayment(document.state, first.id)),
    store.update(document => verifyPayment(document.state, second.id)),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const saved = (await store.read()).state;
  assert.equal(saved.ingredients[1].stock, 0);
  assert.equal(saved.orders.filter(order => order.paid).length, 1);
});
test('CAS: mismo idempotencyKey concurrente crea una sola orden y un solo número', async () => {
  const store = new StoreRepository(new MemoryD1(), fixture);
  const data = parseOrderInput(input());
  const results = await Promise.all([
    store.update(document => createIdempotentOrder(document, data, 'same')),
    store.update(document => createIdempotentOrder(document, data, 'same')),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await store.read()).state.nextOrderNumber, 2);
  assert.equal((await store.read()).state.orders.length, 1);
});
test('owner queda persistido y una cuenta distinta no accede', async () => {
  const store = new StoreRepository(new MemoryD1(), fixture);
  await store.requireOwner('cuenta-propietaria');
  await store.requireOwner('cuenta-propietaria');
  await assert.rejects(() => store.requireOwner('otra-cuenta'), /no tiene acceso/);
  assert.equal((await store.read()).ownerUserId, 'cuenta-propietaria');
});
