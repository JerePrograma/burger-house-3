export type CashAccount = { id: string; name: string; kind: 'cash' | 'bank' | 'wallet'; active: boolean };
export type CashCategory = { id: string; name: string; direction: 'income' | 'expense'; active: boolean };
export type CashLine = { accountId: string; accountName: string; amountCents: number; sessionId?: string };
export type CashMovement = {
  id: string; number: number; kind: 'sale' | 'income' | 'expense' | 'transfer' | 'refund' | 'reversal' | 'opening' | 'adjustment';
  flow: 'income' | 'expense' | 'internal'; createdAt: string; occurredAt: string; actor: string;
  description: string; counterparty: string; reference: string; notes: string; lines: CashLine[];
  categoryId?: string; categoryName?: string; orderId?: string; orderNumber?: number; obligationId?: string; reversalOf?: string; historical?: boolean;
};
export type CashSession = {
  id: string; number: number; accountId: string; accountName: string; status: 'open' | 'closed';
  openedAt: string; openedBy: string; openingCents: number; openingExpectedCents: number; openingDifferenceCents: number; openingNotes: string;
  closedAt?: string; closedBy?: string; expectedCents?: number; countedCents?: number; differenceCents?: number; closingNotes?: string;
  denominations?: { valueCents: number; count: number }[];
};
export type CashObligation = {
  id: string; direction: 'payable' | 'receivable'; description: string; counterparty: string; reference: string; notes: string;
  categoryId: string; categoryName: string; totalCents: number; paidCents: number; dueDate: string;
  status: 'pending' | 'settled' | 'cancelled'; createdAt: string; updatedAt: string; cancellationReason?: string;
};
export type CashReconciliation = {
  id: string; accountId: string; accountName: string; throughDate: string; statementCents: number; bookCents: number;
  differenceCents: number; movementIds: string[]; notes: string; createdAt: string; actor: string;
};
export type CashAudit = { id: string; createdAt: string; actor: string; action: string; detail: string; entityId: string };
export type CashState = {
  version: 1; initializedAt: string; accounts: CashAccount[]; categories: CashCategory[]; movements: CashMovement[];
  sessions: CashSession[]; obligations: CashObligation[]; reconciliations: CashReconciliation[]; audit: CashAudit[];
  requests: Record<string, string>; nextMovementNumber: number; nextSessionNumber: number;
};
export type CashPayment = { accountId: string; amountCents: number };
type Command = { requestId: string };
type MovementFields = { accountId: string; amountCents: number; description: string; categoryId: string; counterparty: string; reference: string; notes: string; occurredAt?: string };
export type CashAction = Command & (
  | { type: 'cash-entry'; direction: 'income' | 'expense'; entry: MovementFields }
  | { type: 'cash-transfer'; fromAccountId: string; toAccountId: string; amountCents: number; description: string; reference: string; notes: string }
  | { type: 'cash-reverse'; movementId: string; reason: string }
  | { type: 'cash-refund'; orderId: string; accountId: string; amountCents: number; reason: string; reference: string }
  | { type: 'cash-open'; accountId: string; openingCents: number; expectedBalanceCents: number; notes: string }
  | { type: 'cash-close'; sessionId: string; countedCents: number; expectedBalanceCents: number; notes: string; denominations: {valueCents: number; count: number}[] }
  | { type: 'cash-account'; account: CashAccount; openingCents: number }
  | { type: 'cash-category'; category: CashCategory }
  | { type: 'cash-obligation'; obligation: Omit<CashObligation, 'id' | 'paidCents' | 'status' | 'createdAt' | 'updatedAt' | 'categoryName' | 'cancellationReason'> }
  | { type: 'cash-settle'; obligationId: string; accountId: string; amountCents: number; reference: string; notes: string }
  | { type: 'cash-cancel-obligation'; obligationId: string; reason: string }
  | { type: 'cash-reconcile'; accountId: string; throughDate: string; statementCents: number; expectedBookCents: number; notes: string }
);
export const cashAccountKinds = { cash: 'Efectivo', bank: 'Cuenta bancaria', wallet: 'Billetera digital' };
export const cashKindLabels: Record<CashMovement['kind'], string> = { sale: 'Venta', income: 'Ingreso', expense: 'Egreso', transfer: 'Transferencia', refund: 'Devolución', reversal: 'Reverso', opening: 'Saldo inicial', adjustment: 'Diferencia de caja' };
export const cashMoney = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents === 0 ? 0 : cents / 100);
export const cashDate = (date: string | Date) => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export const cashBalance = (cash: CashState, accountId?: string, throughDate?: string) => cash.movements.reduce((sum, m) => (!throughDate || cashDate(m.occurredAt) <= throughDate) ? sum + m.lines.filter(l=>!accountId || l.accountId===accountId).reduce((n,l)=>n+l.amountCents,0) : sum, 0);
