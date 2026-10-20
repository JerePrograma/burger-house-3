import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, input } from './fixtures.mjs';
import { cashBalance, cashDate, cashMoney } from '../lib/cash-domain.ts';
import { applyCashAction, cashReport, ensureCash, orderCollectedCents, parseCashAction } from '../lib/cash.ts';
import { changeOrderStatus, createOrder, parseOrderInput, verifyPayment } from '../lib/commerce.ts';
import { StoreRepository } from '../lib/repository.ts';
import worker from '../backend/worker.ts';
import { issueSession } from '../backend/auth.ts';

const NOW = '2026-10-20T18:00:00.000Z';
const account = (state, kind) => state.cash.accounts.find(entry => entry.kind === kind).id;
const category = (state, direction) => state.cash.categories.find(entry => entry.direction === direction && !['ventas', 'devoluciones'].includes(entry.id)).id;
const run = (state, action, now = NOW) => applyCashAction(state, parseCashAction({ requestId: randomUUID(), ...action }), now);
const entry = (state, direction, amountCents, accountId = account(state, 'cash'), rest = {}) => run(state, {
  type: 'cash-entry', direction,
  entry: { accountId, amountCents, description: direction === 'income' ? 'Ingreso de prueba' : 'Compra de insumos', categoryId: category(state, direction), counterparty: 'Proveedor de prueba', reference: 'TEST', notes: '', ...rest },
});
const sale = state => createOrder(state, parseOrderInput(input()), NOW);
const activeSession = state => state.cash.sessions.find(session => session.status === 'open');
const close = (state, countedCents, rest = {}) => run(state, { type: 'cash-close', sessionId: activeSession(state).id, countedCents, expectedBalanceCents: cashBalance(state.cash, account(state, 'cash')), notes: '', denominations: [], ...rest });
const open = (state, openingCents, rest = {}) => run(state, { type: 'cash-open', accountId: account(state, 'cash'), openingCents, expectedBalanceCents: cashBalance(state.cash, account(state, 'cash')), notes: '', ...rest });

test('caja mantiene centavos enteros y valida importes antes de registrar', () => {
  const state = fixture();
  entry(state, 'income', 1001);
  entry(state, 'expense', 101);
  assert.equal(cashBalance(state.cash, account(state, 'cash')), 900);
  assert.ok(cashMoney(1001).includes('10,01'));
  for (const amountCents of [0, -1, 1.1, '100', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const before = structuredClone(state);
    assert.throws(() => entry(state, 'income', amountCents));
    assert.deepEqual(state, before);
  }
});

test('verificar pago registra una venta exacta con pago mixto y conserva idempotencia', () => {
  const state = fixture();
  const order = sale(state);
  const payments = [{ accountId: account(state, 'cash'), amountCents: 600000 }, { accountId: account(state, 'bank'), amountCents: 400000 }];
  verifyPayment(state, order.id, NOW, payments);
  verifyPayment(state, order.id, NOW, payments);
  const sales = state.cash.movements.filter(movement => movement.kind === 'sale');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].orderId, order.id);
  assert.equal(sales[0].lines.reduce((sum, line) => sum + line.amountCents, 0), 1000000);
  assert.equal(cashBalance(state.cash, account(state, 'cash')), 600000);
  assert.equal(cashBalance(state.cash, account(state, 'bank')), 400000);
  assert.equal(state.ingredients.find(item => item.id === 'carne').stock, 9);
  assert.equal(state.movements.length, 5);
});

test('pago mixto incompleto, excesivo o de cuenta inexistente no toca venta ni stock', () => {
  for (const payments of [
    [{ accountId: 'efectivo', amountCents: 999999 }],
    [{ accountId: 'efectivo', amountCents: 1000001 }],
    [{ accountId: 'inexistente', amountCents: 1000000 }],
  ]) {
    const state = fixture();
    const order = sale(state);
    const before = structuredClone(state);
    assert.throws(() => verifyPayment(state, order.id, NOW, payments));
    assert.deepEqual(state, before);
  }
});

test('efectivo exige apertura: un rechazo deja el pedido, stock y libro sin cambios', () => {
  const state = fixture();
  close(state, 0);
  const order = sale(state);
  const before = structuredClone(state);
  assert.throws(() => verifyPayment(state, order.id, NOW));
  assert.deepEqual(state, before);
  assert.throws(() => entry(state, 'income', 100));
  assert.deepEqual(state, before);
  order.paymentMethod = 'transferencia';
  verifyPayment(state, order.id, NOW);
  assert.equal(cashBalance(state.cash, account(state, 'bank')), 1000000);
});

test('cancelación conserva el cobro y requiere devolución explícita con límite al monto pagado', () => {
  const state = fixture();
  const order = sale(state);
  verifyPayment(state, order.id, NOW);
  changeOrderStatus(state, order.id, 'cancelado', NOW);
  assert.equal(cashBalance(state.cash), 1000000);
  assert.equal(state.cash.movements.filter(movement => movement.kind === 'refund').length, 0);
  const refund = { type: 'cash-refund', orderId: order.id, accountId: account(state, 'cash'), amountCents: 300000, reason: 'Devolución parcial al cliente', reference: 'DEV-1' };
  run(state, refund);
  assert.equal(cashBalance(state.cash), 700000);
  const before = structuredClone(state);
  assert.throws(() => run(state, { ...refund, amountCents: 700001 }));
  assert.deepEqual(state, before);
  run(state, { ...refund, amountCents: 700000 });
  assert.equal(cashBalance(state.cash), 0);
  assert.throws(() => run(state, { ...refund, amountCents: 1 }));
  assert.equal(state.ingredients.find(item => item.id === 'carne').stock, 10);
});

test('transferencias conservan fondos totales y no inflan ingresos ni egresos', () => {
  const state = fixture();
  entry(state, 'income', 10000);
  run(state, { type: 'cash-transfer', fromAccountId: account(state, 'cash'), toAccountId: account(state, 'bank'), amountCents: 4321, description: 'Depósito de efectivo', reference: 'DEP-1', notes: '' });
  assert.equal(cashBalance(state.cash), 10000);
  assert.equal(cashBalance(state.cash, account(state, 'cash')), 5679);
  assert.equal(cashBalance(state.cash, account(state, 'bank')), 4321);
  const report = cashReport(state.cash);
  assert.equal(report.incomeCents, 10000);
  assert.equal(report.expenseCents, 0);
  assert.equal(report.netCents, 10000);
  assert.equal(state.cash.movements.filter(movement => movement.kind === 'transfer').length, 1);
  assert.throws(() => run(state, { type: 'cash-transfer', fromAccountId: account(state, 'cash'), toAccountId: account(state, 'cash'), amountCents: 1, description: 'Misma cuenta', reference: '', notes: '' }));
});

test('cuentas no permiten egresos ni transferencias sin fondos', () => {
  const state = fixture();
  for (const kind of ['cash', 'bank', 'wallet']) {
    const before = structuredClone(state);
    assert.throws(() => entry(state, 'expense', 1, account(state, kind)));
    assert.deepEqual(state, before);
    assert.throws(() => run(state, { type: 'cash-transfer', fromAccountId: account(state, kind), toAccountId: account(state, kind === 'bank' ? 'wallet' : 'bank'), amountCents: 1, description: 'Sin fondos', reference: '', notes: '' }));
    assert.deepEqual(state, before);
  }
});

test('requestId evita duplicados y rechaza reutilizar la misma clave con otro contenido', () => {
  const state = fixture();
  const action = parseCashAction({ type: 'cash-entry', requestId: 'test-cash-idempotent', direction: 'income', entry: { accountId: account(state, 'cash'), amountCents: 12345, description: 'Aporte del local', categoryId: category(state, 'income'), counterparty: '', reference: '', notes: '' } });
  applyCashAction(state, action, NOW);
  const before = structuredClone(state);
  applyCashAction(state, action, NOW);
  assert.deepEqual(state, before);
  assert.throws(() => applyCashAction(state, { ...action, entry: { ...action.entry, amountCents: 12346 } }, NOW));
  assert.deepEqual(state, before);
});

test('reverso se registra en el turno actual sin modificar movimientos ni cierres históricos', () => {
  const state = fixture();
  entry(state, 'income', 10000);
  entry(state, 'expense', 2500);
  const original = state.cash.movements.find(movement => movement.kind === 'expense');
  const originalSnapshot = structuredClone(original);
  close(state, 7500);
  const closedSnapshot = structuredClone(state.cash.sessions.find(session => session.status === 'closed'));
  assert.throws(() => run(state, { type: 'cash-reverse', movementId: original.id, reason: 'Error de carga' }));
  open(state, 7500);
  run(state, { type: 'cash-reverse', movementId: original.id, reason: 'Error de carga' });
  assert.equal(cashBalance(state.cash), 10000);
  assert.deepEqual(state.cash.movements.find(movement => movement.id === original.id), originalSnapshot);
  assert.deepEqual(state.cash.sessions.find(session => session.id === closedSnapshot.id), closedSnapshot);
  assert.equal(state.cash.movements.filter(movement => movement.reversalOf === original.id).length, 1);
  assert.throws(() => run(state, { type: 'cash-reverse', movementId: original.id, reason: 'Segundo reverso' }));
  assert.equal(cashReport(state.cash).expenseCents, 0);
});

test('arqueo valida denominaciones, conserva snapshot y registra diferencia como ajuste interno', () => {
  const state = fixture();
  entry(state, 'income', 10000);
  const before = structuredClone(state);
  assert.throws(() => close(state, 9000, { denominations: [{ valueCents: 1000, count: 8 }], notes: 'Faltante' }));
  assert.deepEqual(state, before);
  assert.throws(() => close(state, 10000, { denominations: [{ valueCents: 1000, count: 5 }, { valueCents: 1000, count: 5 }] }));
  assert.deepEqual(state, before);
  assert.throws(() => close(state, 9000));
  assert.deepEqual(state, before);
  const sessionId = activeSession(state).id;
  const command = parseCashAction({ type: 'cash-close', requestId: 'test-close-once', sessionId, countedCents: 9000, expectedBalanceCents: 10000, notes: 'Faltante encontrado en el arqueo', denominations: [{ valueCents: 1000, count: 9 }] });
  applyCashAction(state, command, NOW);
  const closed = state.cash.sessions.find(session => session.id === sessionId);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.expectedCents, 10000);
  assert.equal(closed.countedCents, 9000);
  assert.equal(closed.differenceCents, -1000);
  assert.equal(cashBalance(state.cash), 9000);
  assert.equal(cashReport(state.cash).incomeCents, 10000);
  const after = structuredClone(state);
  applyCashAction(state, command, NOW);
  assert.deepEqual(state, after);
  assert.throws(() => run(state, { ...command, requestId: 'other-close-attempt' }));
  assert.deepEqual(state, after);
});

test('apertura y cierre rechazan saldos esperados obsoletos', () => {
  const state = fixture();
  entry(state, 'income', 10000);
  const before = structuredClone(state);
  assert.throws(() => close(state, 10000, { expectedBalanceCents: 9999 }));
  assert.deepEqual(state, before);
  close(state, 10000);
  const afterClose = structuredClone(state);
  assert.throws(() => open(state, 10000, { expectedBalanceCents: 9999 }));
  assert.deepEqual(state, afterClose);
  open(state, 9900, { notes: 'Diferencia del recuento al abrir' });
  const current = activeSession(state);
  assert.equal(current.openingExpectedCents, 10000);
  assert.equal(current.openingDifferenceCents, -100);
  assert.equal(cashBalance(state.cash), 9900);
  assert.throws(() => open(state, 9900));
});

test('compromisos permiten pagos parciales y exigen registrar cobros para reflejar dinero', () => {
  const state = fixture();
  entry(state, 'income', 20000, account(state, 'bank'));
  run(state, { type: 'cash-obligation', obligation: { direction: 'payable', description: 'Compra de mercadería', counterparty: 'Proveedor demo', reference: 'FAC-1', notes: '', categoryId: category(state, 'expense'), totalCents: 10000, dueDate: '2026-10-21' } });
  const obligation = state.cash.obligations[0];
  assert.equal(obligation.paidCents, 0);
  assert.equal(obligation.status, 'pending');
  assert.equal(cashBalance(state.cash), 20000);
  run(state, { type: 'cash-settle', obligationId: obligation.id, accountId: account(state, 'bank'), amountCents: 4000, reference: 'PAGO-1', notes: '' });
  assert.equal(state.cash.obligations.find(item => item.id === obligation.id).paidCents, 4000);
  assert.equal(cashBalance(state.cash), 16000);
  const before = structuredClone(state);
  assert.throws(() => run(state, { type: 'cash-settle', obligationId: obligation.id, accountId: account(state, 'bank'), amountCents: 6001, reference: '', notes: '' }));
  assert.deepEqual(state, before);
  run(state, { type: 'cash-settle', obligationId: obligation.id, accountId: account(state, 'bank'), amountCents: 6000, reference: 'PAGO-2', notes: '' });
  assert.equal(state.cash.obligations.find(item => item.id === obligation.id).paidCents, 10000);
  assert.equal(state.cash.obligations.find(item => item.id === obligation.id).status, 'settled');
  assert.equal(cashBalance(state.cash), 10000);
  assert.equal(state.cash.movements.filter(item => item.obligationId === obligation.id).length, 2);
});

test('anular un compromiso pendiente conserva trazabilidad y bloquea pagos posteriores', () => {
  const state = fixture();
  run(state, { type: 'cash-obligation', obligation: { direction: 'receivable', description: 'Saldo de un evento', counterparty: 'Cliente demo', reference: 'EVENTO-1', notes: '', categoryId: category(state, 'income'), totalCents: 50000, dueDate: '2026-10-25' } });
  const obligation = state.cash.obligations[0];
  run(state, { type: 'cash-cancel-obligation', obligationId: obligation.id, reason: 'Evento cancelado por el cliente' });
  const cancelled = state.cash.obligations.find(item => item.id === obligation.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.cancellationReason.includes('Evento'));
  assert.equal(cashBalance(state.cash), 0);
  assert.throws(() => run(state, { type: 'cash-settle', obligationId: obligation.id, accountId: account(state, 'bank'), amountCents: 100, reference: '', notes: '' }));
});

test('conciliación utiliza fecha de corte, exige saldo vigente y no modifica el libro', () => {
  const state = fixture();
  const bank = account(state, 'bank');
  entry(state, 'income', 10000, bank, { occurredAt: '2026-10-18T15:00:00.000Z' });
  entry(state, 'income', 5000, bank, { occurredAt: '2026-10-20T15:00:00.000Z' });
  const movementSnapshot = structuredClone(state.cash.movements);
  const reconciliation = { type: 'cash-reconcile', accountId: bank, throughDate: '2026-10-19', statementCents: 9900, expectedBookCents: 10000, notes: 'Diferencia pendiente de identificar' };
  run(state, reconciliation);
  const reconciled = state.cash.reconciliations[0];
  assert.equal(reconciled.bookCents, 10000);
  assert.equal(reconciled.statementCents, 9900);
  assert.equal(reconciled.differenceCents, -100);
  assert.equal(reconciled.movementIds.length, 1);
  assert.deepEqual(state.cash.movements, movementSnapshot);
  assert.equal(cashBalance(state.cash, bank), 15000);
  const before = structuredClone(state);
  assert.throws(() => run(state, { ...reconciliation, expectedBookCents: 9999 }));
  assert.deepEqual(state, before);
});

test('informes usan fecha argentina, filtros combinados y separan transferencias', () => {
  const state = fixture();
  const bank = account(state, 'bank');
  assert.equal(cashDate('2026-10-20T01:00:00.000Z'), '2026-10-19');
  entry(state, 'income', 10100, bank, { description: 'Cobro de catering especial', occurredAt: '2026-10-20T01:00:00.000Z' });
  entry(state, 'income', 200, bank, { description: 'Otro cobro', occurredAt: '2026-10-20T15:00:00.000Z' });
  const report = cashReport(state.cash, { from: '2026-10-19', to: '2026-10-19', accountId: bank, categoryId: category(state, 'income'), query: 'catering' });
  assert.equal(report.movements.length, 1);
  assert.equal(report.incomeCents, 10100);
  assert.equal(report.netCents, 10100);
  assert.equal(report.byDay[0].date, '2026-10-19');
});

test('migración de ventas anteriores registra historial sin duplicarlo ni reabrir caja', () => {
  const state = fixture();
  const order = sale(state);
  verifyPayment(state, order.id, NOW);
  delete state.cash;
  ensureCash(state, NOW);
  const historical = state.cash.movements.filter(movement => movement.orderId === order.id);
  assert.equal(historical.length, 1);
  assert.equal(historical[0].historical, true);
  assert.equal(cashBalance(state.cash), 1000000);
  assert.equal(state.cash.sessions.filter(session => session.status === 'open').length, 0);
  const before = structuredClone(state.cash);
  ensureCash(state, NOW);
  assert.deepEqual(state.cash, before);
});

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

test('CAS: dos cargas simultáneas con la misma clave registran un solo ingreso', async () => {
  const state = fixture();
  const action = parseCashAction({ type: 'cash-entry', requestId: 'parallel-income-once', direction: 'income', entry: { accountId: account(state, 'cash'), amountCents: 5500, description: 'Aporte simultáneo', categoryId: category(state, 'income'), counterparty: '', reference: '', notes: '' } });
  const store = new StoreRepository(new MemoryD1(), () => structuredClone(state));
  await Promise.all([
    store.update(document => applyCashAction(document.state, action, NOW)),
    store.update(document => applyCashAction(document.state, action, NOW)),
  ]);
  const saved = (await store.read()).state;
  assert.equal(cashBalance(saved.cash), 5500);
  assert.equal(saved.cash.movements.filter(movement => movement.kind === 'income').length, 1);
  assert.equal(saved.cash.audit.filter(event => event.action === 'income').length, 1);
});

test('CAS: egresos simultáneos no gastan dos veces el mismo saldo', async () => {
  const state = fixture();
  entry(state, 'income', 10000);
  const makeExpense = () => parseCashAction({ type: 'cash-entry', requestId: randomUUID(), direction: 'expense', entry: { accountId: account(state, 'cash'), amountCents: 6000, description: 'Compra simultánea', categoryId: category(state, 'expense'), counterparty: '', reference: '', notes: '' } });
  const first = makeExpense(), second = makeExpense();
  const store = new StoreRepository(new MemoryD1(), () => structuredClone(state));
  const results = await Promise.allSettled([
    store.update(document => applyCashAction(document.state, first, NOW)),
    store.update(document => applyCashAction(document.state, second, NOW)),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const saved = (await store.read()).state;
  assert.equal(cashBalance(saved.cash), 4000);
  assert.equal(saved.cash.movements.filter(movement => movement.kind === 'expense').length, 1);
});

test('CAS: devoluciones simultáneas no superan lo efectivamente cobrado', async () => {
  const state = fixture();
  const order = sale(state);
  verifyPayment(state, order.id, NOW);
  changeOrderStatus(state, order.id, 'cancelado', NOW);
  const makeRefund = () => parseCashAction({ type: 'cash-refund', requestId: randomUUID(), orderId: order.id, accountId: account(state, 'cash'), amountCents: 600000, reason: 'Devolución al cliente', reference: '' });
  const first = makeRefund(), second = makeRefund();
  const store = new StoreRepository(new MemoryD1(), () => structuredClone(state));
  const results = await Promise.allSettled([
    store.update(document => applyCashAction(document.state, first, NOW)),
    store.update(document => applyCashAction(document.state, second, NOW)),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const saved = (await store.read()).state;
  assert.equal(cashBalance(saved.cash), 400000);
  assert.equal(saved.cash.movements.filter(movement => movement.kind === 'refund').length, 1);
  assert.equal(saved.ingredients.find(item => item.id === 'carne').stock, 10);
});

test('conciliación bloquea cargas retroactivas pero admite correcciones en el período actual', () => {
  const state = fixture();
  const bank = account(state, 'bank');
  entry(state, 'income', 10000, bank, { occurredAt: '2026-10-18T15:00:00.000Z' });
  run(state, { type: 'cash-reconcile', accountId: bank, throughDate: '2026-10-19', statementCents: 10000, expectedBookCents: 10000, notes: '' });
  const before = structuredClone(state);
  assert.throws(() => entry(state, 'income', 5000, bank, { occurredAt: '2026-10-18T18:00:00.000Z' }));
  assert.deepEqual(state, before);
  entry(state, 'income', 5000, bank, { occurredAt: '2026-10-20T18:00:00.000Z' });
  assert.equal(cashBalance(state.cash, bank), 15000);
  assert.equal(state.cash.reconciliations[0].bookCents, 10000);
});

test('reversar el pago de un compromiso repone el saldo pendiente sin borrar el comprobante', () => {
  const state = fixture();
  entry(state, 'income', 20000, account(state, 'bank'));
  run(state, { type: 'cash-obligation', obligation: { direction: 'payable', description: 'Factura del proveedor', counterparty: 'Proveedor demo', reference: 'FAC-2', notes: '', categoryId: category(state, 'expense'), totalCents: 10000, dueDate: '2026-10-21' } });
  const obligationId = state.cash.obligations[0].id;
  run(state, { type: 'cash-settle', obligationId, accountId: account(state, 'bank'), amountCents: 10000, reference: 'PAGO-ERRONEO', notes: '' });
  const payment = state.cash.movements.find(movement => movement.obligationId === obligationId);
  const snapshot = structuredClone(payment);
  run(state, { type: 'cash-reverse', movementId: payment.id, reason: 'Pago cargado en la cuenta equivocada' });
  const saved = state.cash.obligations.find(obligation => obligation.id === obligationId);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.paidCents, 0);
  assert.equal(cashBalance(state.cash), 20000);
  assert.deepEqual(state.cash.movements.find(movement => movement.id === payment.id), snapshot);
});

test('API protege el libro de caja y no expone datos financieros en catálogo ni seguimiento', async () => {
  const state = fixture();
  entry(state, 'income', 12345, account(state, 'bank'), { description: 'FINANZAS-PRIVADAS-TEST', notes: 'DATOS-INTERNOS-NO-PUBLICOS' });
  const order = sale(state);
  const db = new MemoryD1();
  db.row = { document: JSON.stringify({ state, ownerUserId: null, idempotencies: {} }), version: 1 };
  const env = { DB: db, FRONTEND_URL: 'https://frontend.test/burger-house-3', SESSION_SECRET: 'test-session-secret-not-for-production', ADMIN_PASSWORD_SHA256: 'not-used' };
  const unauthenticated = await worker.fetch(new Request('https://api.test/api/admin'), env);
  assert.equal(unauthenticated.status, 401);
  const maliciousAction = { type: 'cash-entry', requestId: 'unauthorized-cash-action', direction: 'income', entry: { accountId: account(state, 'bank'), amountCents: 999999, description: 'No autorizado', categoryId: category(state, 'income'), counterparty: '', reference: '', notes: '' } };
  const attemptedPost = await worker.fetch(new Request('https://api.test/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-chatgpt-user-id': 'fake-owner' }, body: JSON.stringify(maliciousAction) }), env);
  assert.equal(attemptedPost.status, 401);
  for (const url of ['https://api.test/api/catalog', `https://api.test/api/orders?id=${order.id}&token=${order.trackingToken}`]) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.includes('FINANZAS-PRIVADAS-TEST'), false);
    assert.equal(body.includes('DATOS-INTERNOS-NO-PUBLICOS'), false);
    assert.equal(body.includes('reconciliations'), false);
  }
  const token = await issueSession(env.SESSION_SECRET);
  const privateResponse = await worker.fetch(new Request('https://api.test/api/admin', { headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(privateResponse.status, 200);
  const visibleToAdmin = await privateResponse.json();
  assert.equal(cashBalance(visibleToAdmin.cash), 12345);
});

test('un egreso bancario retroactivo no puede dejar saldo histórico negativo aunque hoy haya fondos', () => {
  const state = fixture();
  const bank = account(state, 'bank');
  entry(state, 'income', 10000, bank, { occurredAt: '2026-10-20T15:00:00.000Z' });
  const before = structuredClone(state);
  assert.throws(() => entry(state, 'expense', 1000, bank, { occurredAt: '2026-10-19T15:00:00.000Z' }), /histórico negativo/);
  assert.deepEqual(state, before);
  assert.equal(cashBalance(state.cash, bank), 10000);
  entry(state, 'income', 2000, bank, { occurredAt: '2026-10-18T15:00:00.000Z' });
  entry(state, 'expense', 1000, bank, { occurredAt: '2026-10-19T15:00:00.000Z' });
  assert.equal(cashBalance(state.cash, bank, '2026-10-19'), 1000);
  assert.equal(cashBalance(state.cash, bank), 11000);
});

test('reversar un pago parcial de un compromiso cancelado conserva la cancelación y recalcula lo pagado', () => {
  const state = fixture();
  const bank = account(state, 'bank');
  entry(state, 'income', 20000, bank);
  run(state, { type: 'cash-obligation', obligation: { direction: 'payable', description: 'Factura luego cancelada', counterparty: 'Proveedor demo', reference: 'FAC-CANCELADA', notes: '', categoryId: category(state, 'expense'), totalCents: 10000, dueDate: '2026-10-21' } });
  const obligationId = state.cash.obligations[0].id;
  run(state, { type: 'cash-settle', obligationId, accountId: bank, amountCents: 4000, reference: 'PAGO-PARCIAL', notes: '' });
  const payment = state.cash.movements.find(movement => movement.obligationId === obligationId);
  const paymentSnapshot = structuredClone(payment);
  run(state, { type: 'cash-cancel-obligation', obligationId, reason: 'Proveedor anuló el saldo de la factura' });
  const cancellationReason = state.cash.obligations.find(obligation => obligation.id === obligationId).cancellationReason;
  run(state, { type: 'cash-reverse', movementId: payment.id, reason: 'Pago parcial cargado por error' });
  const saved = state.cash.obligations.find(obligation => obligation.id === obligationId);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.paidCents, 0);
  assert.equal(saved.cancellationReason, cancellationReason);
  assert.equal(cashBalance(state.cash, bank), 20000);
  assert.deepEqual(state.cash.movements.find(movement => movement.id === payment.id), paymentSnapshot);
  assert.equal(state.cash.movements.filter(movement => movement.reversalOf === payment.id).length, 1);
  assert.throws(() => run(state, { type: 'cash-settle', obligationId, accountId: bank, amountCents: 1000, reference: '', notes: '' }));
});

test('reversar una devolución errónea recompone el cobro disponible y mantiene el límite neto de reembolso', () => {
  const state = fixture();
  const order = sale(state);
  verifyPayment(state, order.id, NOW);
  changeOrderStatus(state, order.id, 'cancelado', NOW);
  const orderSnapshot = structuredClone(order);
  const stockSnapshot = structuredClone(state.ingredients);
  const stockMovementsSnapshot = structuredClone(state.movements);
  const refundAction = { type: 'cash-refund', orderId: order.id, accountId: account(state, 'cash'), amountCents: 300000, reason: 'Devolución cargada por error', reference: 'DEV-ERRONEA' };
  run(state, refundAction);
  const refund = state.cash.movements.find(movement => movement.kind === 'refund');
  const refundSnapshot = structuredClone(refund);
  assert.equal(orderCollectedCents(state.cash, order.id), 700000);
  assert.equal(cashReport(state.cash).refundsCents, 300000);
  run(state, { type: 'cash-reverse', movementId: refund.id, reason: 'Corrección de devolución duplicada en la carga' });
  const reversal = state.cash.movements.find(movement => movement.reversalOf === refund.id);
  assert.equal(reversal.orderId, order.id);
  assert.equal(reversal.orderNumber, order.number);
  assert.equal(orderCollectedCents(state.cash, order.id), 1000000);
  assert.equal(cashBalance(state.cash), 1000000);
  assert.equal(cashReport(state.cash).refundsCents, 0);
  assert.equal(cashReport(state.cash).incomeCents, 1000000);
  assert.deepEqual(state.cash.movements.find(movement => movement.id === refund.id), refundSnapshot);
  const beforeRetry = structuredClone(state);
  assert.throws(() => run(state, { type: 'cash-reverse', movementId: refund.id, reason: 'Segundo intento de reverso' }));
  assert.throws(() => run(state, { type: 'cash-reverse', movementId: reversal.id, reason: 'Intento de revertir un reverso' }));
  assert.throws(() => run(state, { type: 'cash-reverse', movementId: state.cash.movements.find(movement => movement.kind === 'sale').id, reason: 'Intento de revertir una venta' }));
  assert.deepEqual(state, beforeRetry);
  run(state, { ...refundAction, amountCents: 1000000, reason: 'Devolución total correcta', reference: 'DEV-CORRECTA' });
  assert.equal(orderCollectedCents(state.cash, order.id), 0);
  assert.equal(cashBalance(state.cash), 0);
  assert.equal(cashReport(state.cash).refundsCents, 1000000);
  assert.equal(cashReport(state.cash).incomeCents, 0);
  const beforeExcess = structuredClone(state);
  assert.throws(() => run(state, { ...refundAction, amountCents: 1 }));
  assert.deepEqual(state, beforeExcess);
  assert.deepEqual(state.orders.find(item => item.id === order.id), orderSnapshot);
  assert.deepEqual(state.ingredients, stockSnapshot);
  assert.deepEqual(state.movements, stockMovementsSnapshot);
});

test('un pedido totalmente bonificado verifica sin turno ni fondos y descuenta stock exactamente una vez', () => {
  const state = fixture();
  state.products[0].variants[0].price = 0;
  close(state, 0);
  const order = sale(state);
  assert.equal(order.total, 0);
  assert.equal(activeSession(state), undefined);
  const beforeInvalidPayment = structuredClone(state);
  assert.throws(() => verifyPayment(state, order.id, NOW, [{ accountId: account(state, 'bank'), amountCents: 1 }]));
  assert.deepEqual(state, beforeInvalidPayment);
  verifyPayment(state, order.id, NOW, []);
  const afterVerification = structuredClone(state);
  verifyPayment(state, order.id, NOW, []);
  assert.deepEqual(state, afterVerification);
  assert.equal(state.orders.find(item => item.id === order.id).paid, true);
  assert.equal(state.ingredients.find(item => item.id === 'carne').stock, 9);
  assert.equal(state.movements.length, 5);
  const sales = state.cash.movements.filter(movement => movement.kind === 'sale');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].orderId, order.id);
  assert.deepEqual(sales[0].lines, []);
  assert.match(sales[0].notes, /Bonificación total/);
  assert.equal(cashBalance(state.cash), 0);
  assert.equal(cashReport(state.cash).incomeCents, 0);
  assert.equal(cashReport(state.cash).salesCents, 0);
  assert.equal(activeSession(state), undefined);
});
