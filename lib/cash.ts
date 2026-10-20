import type { Order, StoreState } from './domain';
import type { CashAction, CashAccount, CashCategory, CashLine, CashMovement, CashPayment, CashState } from './cash-domain';
import { cashBalance, cashDate } from './cash-domain';
import { CommerceError } from './errors';

const fail = (message: string, status = 400): never => { throw new CommerceError(message, status); };
const actor = 'Administradora';
const maxMoney = 100_000_000_000;
function obj(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Formato de caja inválido.');
  if (Object.keys(value).some(k => !keys.includes(k))) return fail('El envío contiene campos desconocidos.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 500, min = 0): string {
  if (typeof value !== 'string') return fail(`${label}: texto inválido.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) return fail(`${label}: longitud o caracteres inválidos.`);
  return result;
}
function id(value: unknown): string {
  const result = text(value, 'Identificador', 100, 1);
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['constructor','prototype','__proto__'].includes(result)) return fail('Identificador inválido.');
  return result;
}
function cents(value: unknown, label = 'Importe', min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > maxMoney) return fail(`${label}: usá centavos enteros y un importe válido.`);
  return value;
}
function option<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) return fail('Opción de caja inválida.');
  return value as T;
}
function civilDate(value: unknown): string {
  const date = text(value, 'Fecha', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return fail('Fecha inválida.');
  return date;
}
function iso(value: unknown): string {
  const date = text(value, 'Fecha y hora', 40, 20);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) return fail('Fecha y hora inválidas.');
  return new Date(date).toISOString();
}
const meta = (d: Record<string, unknown>) => ({ counterparty: text(d.counterparty ?? '', 'Persona o proveedor', 150), reference: text(d.reference ?? '', 'Comprobante', 150), notes: text(d.notes ?? '', 'Notas', 1000) });
export function parseCashPayments(value: unknown): CashPayment[] {
  if (!Array.isArray(value) || value.length > 10) return fail('El cobro admite hasta diez cuentas.');
  const result = value.map(v=>{const d=obj(v,['accountId','amountCents']);return {accountId:id(d.accountId),amountCents:cents(d.amountCents,'Importe del cobro',1)};});
  if (new Set(result.map(p=>p.accountId)).size !== result.length) fail('No repitas una cuenta en el mismo cobro.');
  return result;
}
export function parseCashAction(value: unknown): CashAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Acción de caja inválida.');
  const raw = value as Record<string, unknown>, type = raw.type, requestId = id(raw.requestId);
  if (type === 'cash-entry') {
    const d=obj(value,['type','requestId','direction','entry']), e=obj(d.entry,['accountId','amountCents','description','categoryId','counterparty','reference','notes','occurredAt']);
    return {type,requestId,direction:option(d.direction,['income','expense']),entry:{accountId:id(e.accountId),amountCents:cents(e.amountCents,'Importe',1),description:text(e.description,'Concepto',200,3),categoryId:id(e.categoryId),...meta(e),...(e.occurredAt?{occurredAt:iso(e.occurredAt)}:{})}};
  }
  if (type === 'cash-transfer') {
    const d=obj(value,['type','requestId','fromAccountId','toAccountId','amountCents','description','reference','notes']);
    return {type,requestId,fromAccountId:id(d.fromAccountId),toAccountId:id(d.toAccountId),amountCents:cents(d.amountCents,'Importe',1),description:text(d.description,'Concepto',200,3),reference:text(d.reference??'','Comprobante',150),notes:text(d.notes??'','Notas',1000)};
  }
  if (type === 'cash-reverse') {const d=obj(value,['type','requestId','movementId','reason']);return {type,requestId,movementId:id(d.movementId),reason:text(d.reason,'Motivo del reverso',1000,3)};}
  if (type === 'cash-refund') {const d=obj(value,['type','requestId','orderId','accountId','amountCents','reason','reference']);return {type,requestId,orderId:id(d.orderId),accountId:id(d.accountId),amountCents:cents(d.amountCents,'Devolución',1),reason:text(d.reason,'Motivo de devolución',1000,3),reference:text(d.reference??'','Comprobante',150)};}
  if (type === 'cash-open') {const d=obj(value,['type','requestId','accountId','openingCents','expectedBalanceCents','notes']);return {type,requestId,accountId:id(d.accountId),openingCents:cents(d.openingCents),expectedBalanceCents:cents(d.expectedBalanceCents),notes:text(d.notes??'','Observaciones de apertura',1000)};}
  if (type === 'cash-close') {
    const d=obj(value,['type','requestId','sessionId','countedCents','expectedBalanceCents','notes','denominations']);
    if (!Array.isArray(d.denominations) || d.denominations.length>30) fail('Conteo de billetes inválido.');
    const denominations=(d.denominations as unknown[]).map(v=>{const x=obj(v,['valueCents','count']);return {valueCents:cents(x.valueCents,'Denominación',1),count:cents(x.count,'Cantidad de billetes')};});
    if (new Set(denominations.map(d=>d.valueCents)).size!==denominations.length) fail('Hay denominaciones duplicadas.');
    return {type,requestId,sessionId:id(d.sessionId),countedCents:cents(d.countedCents),expectedBalanceCents:cents(d.expectedBalanceCents),notes:text(d.notes??'','Observaciones del cierre',1000),denominations};
  }
  if (type === 'cash-account') {
    const d=obj(value,['type','requestId','account','openingCents']),a=obj(d.account,['id','name','kind','active']);
    if(typeof a.active!=='boolean')fail('Estado de cuenta inválido.');
    return {type,requestId,account:{id:id(a.id),name:text(a.name,'Nombre de cuenta',80,2),kind:option(a.kind,['cash','bank','wallet']),active:a.active as boolean},openingCents:cents(d.openingCents)};
  }
  if (type === 'cash-category') {
    const d=obj(value,['type','requestId','category']),c=obj(d.category,['id','name','direction','active']);
    if(typeof c.active!=='boolean')fail('Estado de categoría inválido.');
    return {type,requestId,category:{id:id(c.id),name:text(c.name,'Categoría',80,2),direction:option(c.direction,['income','expense']),active:c.active as boolean}};
  }
  if(type==='cash-obligation') {
    const d=obj(value,['type','requestId','obligation']),o=obj(d.obligation,['direction','description','counterparty','reference','notes','categoryId','totalCents','dueDate']);
    return {type,requestId,obligation:{direction:option(o.direction,['payable','receivable']),description:text(o.description,'Concepto',200,3),...meta(o),categoryId:id(o.categoryId),totalCents:cents(o.totalCents,'Total',1),dueDate:civilDate(o.dueDate)}};
  }
  if(type==='cash-settle') {const d=obj(value,['type','requestId','obligationId','accountId','amountCents','reference','notes']);return {type,requestId,obligationId:id(d.obligationId),accountId:id(d.accountId),amountCents:cents(d.amountCents,'Importe',1),reference:text(d.reference??'','Comprobante',150),notes:text(d.notes??'','Notas',1000)};}
  if(type==='cash-cancel-obligation') {const d=obj(value,['type','requestId','obligationId','reason']);return {type,requestId,obligationId:id(d.obligationId),reason:text(d.reason,'Motivo',1000,3)};}
  if(type==='cash-reconcile') {const d=obj(value,['type','requestId','accountId','throughDate','statementCents','expectedBookCents','notes']);return {type,requestId,accountId:id(d.accountId),throughDate:civilDate(d.throughDate),statementCents:cents(d.statementCents),expectedBookCents:cents(d.expectedBookCents),notes:text(d.notes??'','Observaciones de conciliación',1000)};}
  return fail('Acción de caja desconocida.');
}

export function createCashState(now = new Date().toISOString()): CashState {
  const expenseNames: Record<string,string> = {insumos:'Compra de insumos',sueldos:'Sueldos y honorarios',alquiler:'Alquiler',servicios:'Servicios',impuestos:'Impuestos y tasas',delivery:'Reparto y delivery',comisiones:'Comisiones y cargos',marketing:'Marketing','otros-egresos':'Otros egresos'};
  return {version:1,initializedAt:now,accounts:[{id:'efectivo',name:'Caja del local',kind:'cash',active:true},{id:'banco',name:'Cuenta bancaria',kind:'bank',active:true},{id:'mercadopago',name:'Mercado Pago',kind:'wallet',active:true}],categories:[{id:'ventas',name:'Ventas de pedidos',direction:'income',active:true},{id:'otros-ingresos',name:'Otros ingresos',direction:'income',active:true},{id:'aportes',name:'Aportes de capital',direction:'income',active:true},...Object.entries(expenseNames).map(([id,name])=>({id,name,direction:'expense' as const,active:true}))],movements:[],sessions:[],obligations:[],reconciliations:[],audit:[],requests:{},nextMovementNumber:1,nextSessionNumber:1};
}
function audit(c:CashState, action:string, detail:string, entityId:string, now:string) {c.audit.unshift({id:crypto.randomUUID(),createdAt:now,actor,action,detail,entityId});}
const account = (c:CashState,id:string):CashAccount => c.accounts.find(a=>a.id===id) ?? fail('Cuenta no encontrada.',404);
function category(c:CashState,id:string,direction:'income'|'expense'):CashCategory {
  const found=c.categories.find(c=>c.id===id)??fail('Categoría no encontrada.',404);
  if(!found.active || found.direction!==direction)fail('La categoría está archivada o no corresponde al movimiento.');
  return found;
}
function line(c:CashState,accountId:string,amountCents:number,now:string,occurredAt=now,internal=false):CashLine {
  const a=account(c,accountId);
  if(!a.active)fail('La cuenta está archivada.',409);
  const cutoff=c.reconciliations.filter(r=>r.accountId===accountId).map(r=>r.throughDate).sort().at(-1);
  if(cutoff && cashDate(occurredAt)<=cutoff)fail('La fecha pertenece a un período conciliado. Registrá la corrección en el período actual.',409);
  const session=c.sessions.find(s=>s.accountId===accountId && s.status==='open');
  if(a.kind==='cash'&&!internal) {
    if(!session)return fail('Abrí un turno de caja antes de registrar movimientos en efectivo.',409);
    if(occurredAt<session.openedAt)fail('El efectivo debe registrarse dentro del turno abierto.',409);
  }
  return {accountId,accountName:a.name,amountCents,...(session?{sessionId:session.id}:{})};
}
type NewMovement=Omit<CashMovement,'id'|'number'|'createdAt'|'actor'> & {id?:string};
function post(c:CashState,value:NewMovement,now:string,allowHistorical=false):CashMovement {
  const totals=new Map<string,number>();
  for(const l of value.lines)totals.set(l.accountId,(totals.get(l.accountId)??0)+l.amountCents);
  for(const [id,delta] of totals) {
    const next=cashBalance(c,id)+delta;
    if(!Number.isSafeInteger(next)||(!allowHistorical&&next<0))fail(`Saldo insuficiente en ${account(c,id).name}.`,409);
    if(!allowHistorical&&delta<0) {
      const timeline=[...c.movements.map(m=>({date:m.occurredAt,number:m.number,delta:m.lines.filter(l=>l.accountId===id).reduce((s,l)=>s+l.amountCents,0)})),{date:value.occurredAt,number:c.nextMovementNumber,delta}].sort((a,b)=>a.date.localeCompare(b.date)||a.number-b.number);
      let running=0;
      for(const point of timeline){running+=point.delta;if(running<0)fail(`La fecha elegida dejaría un saldo histórico negativo en ${account(c,id).name}. Revisá el saldo inicial y la fecha del movimiento.`,409);}
    }
  }
  const result:CashMovement={...value,id:value.id??crypto.randomUUID(),number:c.nextMovementNumber++,createdAt:now,actor};
  c.movements.unshift(result);
  audit(c,result.kind,`${result.description} · movimiento #${result.number}`,result.id,now);
  return result;
}
export function ensureCash(state:StoreState,now=new Date().toISOString()):CashState {
  if(state.cash)return state.cash;
  const c=createCashState(now);
  // Published orders are preserved. Missing historical payment timestamps are
  // explicitly marked as estimated, never silently presented as exact receipts.
  for(const order of [...state.orders].reverse().filter(o=>o.paid)) {
    const a=c.accounts.find(a=>a.id===(order.paymentMethod==='efectivo'?'efectivo':order.paymentMethod==='transferencia'?'banco':'mercadopago'))!;
    post(c,{id:`historical-${order.id}`,kind:'sale',flow:'income',description:`Venta #${order.number} · importada`,counterparty:order.customer.name,reference:'',notes:'Importación de venta previa al módulo de caja. La fecha del pedido se usa como estimación de la fecha del cobro.',occurredAt:order.createdAt,lines:[{accountId:a.id,accountName:a.name,amountCents:Math.round(order.total*100)}],categoryId:'ventas',categoryName:'Ventas de pedidos',orderId:order.id,orderNumber:order.number,historical:true},now,true);
  }
  audit(c,'initialize','Control de caja habilitado. Ventas previas importadas sin alterar pedidos ni stock.','cash',now);
  state.cash=c;
  return c;
}
export function orderCollectedCents(c:CashState,orderId:string):number {return c.movements.filter(m=>m.orderId===orderId).reduce((sum,m)=>sum+m.lines.reduce((s,l)=>s+l.amountCents,0),0);}
export function recordOrderPayment(state:StoreState,order:Order,payments?:CashPayment[],now=new Date().toISOString()):void {
  const current=state.cash??ensureCash({...state},now);
  if(current.movements.some(m=>m.orderId===order.id&&m.kind==='sale'))return;
  const c=structuredClone(current);
  const selected=parseCashPayments(payments??(order.total===0?[]:[{accountId:order.paymentMethod==='efectivo'?'efectivo':order.paymentMethod==='transferencia'?'banco':'mercadopago',amountCents:Math.round(order.total*100)}]));
  if(selected.reduce((s,p)=>s+p.amountCents,0)!==Math.round(order.total*100))fail('El cobro debe coincidir exactamente con el total del pedido.');
  const lines=selected.map(p=>line(c,p.accountId,p.amountCents,now));
  post(c,{kind:'sale',flow:'income',occurredAt:now,description:order.total===0?`Pedido bonificado #${order.number}`:`Cobro de pedido #${order.number}`,counterparty:order.customer.name,reference:'',notes:`Origen: ${order.source}. ${order.total===0?'Bonificación total: no se movieron fondos.':`Medio solicitado: ${order.paymentMethod}.`}`,lines,categoryId:'ventas',categoryName:'Ventas de pedidos',orderId:order.id,orderNumber:order.number},now);
  state.cash=c;
}
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
export function applyCashAction(state:StoreState,input:CashAction,now=new Date().toISOString()):void {
  const action=parseCashAction(input),c=structuredClone(state.cash??ensureCash({...state},now));
  const fingerprint=JSON.stringify(canonical(action));
  if(c.requests[action.requestId]) {if(c.requests[action.requestId]!==fingerprint)fail('La clave de operación ya se utilizó con otros datos.',409);return;}
  execute(state,c,action,now);
  c.requests[action.requestId]=fingerprint;
  state.cash=c;
}
function execute(state:StoreState,c:CashState,a:CashAction,now:string):void {
  if(a.type==='cash-entry') {
    const e=a.entry,cat=category(c,e.categoryId,a.direction),occurredAt=e.occurredAt??now;
    if(Date.parse(occurredAt)>Date.parse(now)+60_000)fail('No se puede registrar un movimiento futuro. Usá un compromiso con vencimiento.');
    post(c,{kind:a.direction,flow:a.direction,occurredAt,description:e.description,counterparty:e.counterparty,reference:e.reference,notes:e.notes,categoryId:cat.id,categoryName:cat.name,lines:[line(c,e.accountId,e.amountCents*(a.direction==='income'?1:-1),now,occurredAt)]},now);return;
  }
  if(a.type==='cash-transfer') {
    if(a.fromAccountId===a.toAccountId)fail('Elegí dos cuentas diferentes para la transferencia.');
    post(c,{kind:'transfer',flow:'internal',occurredAt:now,description:a.description,counterparty:'',reference:a.reference,notes:a.notes,lines:[line(c,a.fromAccountId,-a.amountCents,now),line(c,a.toAccountId,a.amountCents,now)]},now);return;
  }
  if(a.type==='cash-reverse') {
    const original=c.movements.find(m=>m.id===a.movementId)??fail('Movimiento no encontrado.',404);
    if(!['income','expense','transfer','refund'].includes(original.kind))fail('Este movimiento no admite reverso manual. Para ventas usá una devolución.');
    if(c.movements.some(m=>m.reversalOf===original.id))fail('El movimiento ya tiene un reverso.',409);
    const obligation=original.obligationId?c.obligations.find(o=>o.id===original.obligationId):undefined;
    post(c,{kind:'reversal',flow:original.flow,occurredAt:now,description:`Reverso de movimiento #${original.number}`,counterparty:original.counterparty,reference:original.reference,notes:a.reason,categoryId:original.categoryId,categoryName:original.categoryName,reversalOf:original.id,obligationId:original.obligationId,orderId:original.orderId,orderNumber:original.orderNumber,lines:original.lines.map(l=>line(c,l.accountId,-l.amountCents,now))},now);
    if(obligation){obligation.paidCents-=Math.abs(original.lines.reduce((s,l)=>s+l.amountCents,0));if(obligation.status!=='cancelled')obligation.status='pending';obligation.updatedAt=now;}
    return;
  }
  if(a.type==='cash-refund') {
    const order=state.orders.find(o=>o.id===a.orderId)??fail('Pedido no encontrado.',404);
    if(!order.paid)fail('El pedido todavía no tiene un cobro.');
    if(a.amountCents>orderCollectedCents(c,order.id))fail('La devolución supera el saldo cobrado del pedido.',409);
    post(c,{kind:'refund',flow:'income',occurredAt:now,description:`Devolución de pedido #${order.number}`,counterparty:order.customer.name,reference:a.reference,notes:a.reason,categoryId:'ventas',categoryName:'Ventas de pedidos',orderId:order.id,orderNumber:order.number,lines:[line(c,a.accountId,-a.amountCents,now)]},now);return;
  }
  if(a.type==='cash-open') {
    const acc=account(c,a.accountId),expected=cashBalance(c,acc.id);
    if(acc.kind!=='cash'||!acc.active)fail('Sólo se puede abrir una cuenta de efectivo activa.');
    if(c.sessions.some(s=>s.accountId===acc.id&&s.status==='open'))fail('Esta caja ya tiene un turno abierto.',409);
    if(expected!==a.expectedBalanceCents)fail('El saldo cambió. Actualizá antes de abrir la caja.',409);
    const difference=a.openingCents-expected;
    if(difference&&a.notes.trim().length<3)fail('Explicá la diferencia del fondo inicial.');
    const session={id:crypto.randomUUID(),number:c.nextSessionNumber++,accountId:acc.id,accountName:acc.name,status:'open' as const,openedAt:now,openedBy:actor,openingCents:a.openingCents,openingExpectedCents:expected,openingDifferenceCents:difference,openingNotes:a.notes};
    c.sessions.unshift(session);
    if(difference)post(c,{kind:expected===0&&!c.movements.some(m=>m.lines.some(l=>l.accountId===acc.id))?'opening':'adjustment',flow:'internal',occurredAt:now,description:`Fondo de apertura · turno #${session.number}`,counterparty:'',reference:'',notes:a.notes,lines:[line(c,acc.id,difference,now,now,true)]},now);
    audit(c,'open-session',`Apertura del turno #${session.number}`,session.id,now);return;
  }
  if(a.type==='cash-close') {
    const session=c.sessions.find(s=>s.id===a.sessionId)??fail('Turno no encontrado.',404);
    if(session.status!=='open')fail('El turno ya está cerrado.',409);
    const expected=cashBalance(c,session.accountId);
    if(expected!==a.expectedBalanceCents)fail('Hubo movimientos mientras contabas. Actualizá el arqueo antes de cerrar.',409);
    const counted=a.denominations.reduce((s,d)=>s+d.valueCents*d.count,0);
    if(!Number.isSafeInteger(counted)||(a.denominations.length&&counted!==a.countedCents))fail('El conteo por denominaciones no coincide con el total contado.');
    const difference=a.countedCents-expected;
    if(difference&&a.notes.trim().length<3)fail('Explicá el sobrante o faltante antes de cerrar.');
    if(difference)post(c,{kind:'adjustment',flow:'internal',occurredAt:now,description:`Arqueo de cierre · turno #${session.number}`,counterparty:'',reference:'',notes:a.notes,lines:[line(c,session.accountId,difference,now,now,true)]},now);
    Object.assign(session,{status:'closed',closedAt:now,closedBy:actor,expectedCents:expected,countedCents:a.countedCents,differenceCents:difference,closingNotes:a.notes,denominations:a.denominations});
    audit(c,'close-session',`Cierre del turno #${session.number}. Diferencia: ${difference} centavos.`,session.id,now);return;
  }
  if(a.type==='cash-account') {
    const existing=c.accounts.find(x=>x.id===a.account.id);
    if(c.accounts.some(x=>x.id!==a.account.id&&x.name.toLocaleLowerCase()===a.account.name.toLocaleLowerCase()))fail('Ya existe una cuenta con ese nombre.');
    if(existing) {
      if(existing.kind!==a.account.kind)fail('No se puede cambiar el tipo de una cuenta existente.');
      if(a.openingCents)fail('El saldo inicial sólo se carga al crear una cuenta.');
      if(!a.account.active&&(cashBalance(c,existing.id)!==0||c.sessions.some(s=>s.accountId===existing.id&&s.status==='open')))fail('Para archivar la cuenta, cerrá su turno y dejá el saldo en cero.',409);
      Object.assign(existing,a.account);
    }else {
      if(c.accounts.length>=30)fail('Máximo 30 cuentas.');
      if(!a.account.active&&a.openingCents)fail('No se puede cargar saldo a una cuenta archivada.');
      c.accounts.push(a.account);
      if(a.openingCents)post(c,{kind:'opening',flow:'internal',occurredAt:now,description:`Saldo inicial · ${a.account.name}`,counterparty:'',reference:'',notes:'Saldo inicial declarado al crear la cuenta.',lines:[line(c,a.account.id,a.openingCents,now,now,true)]},now);
    }
    audit(c,'account',`${existing?'Actualización':'Alta'} de cuenta: ${a.account.name}`,a.account.id,now);return;
  }
  if(a.type==='cash-category') {
    const existing=c.categories.find(x=>x.id===a.category.id);
    if(existing&&existing.direction!==a.category.direction)fail('El tipo de una categoría existente no se puede cambiar.');
    if(a.category.id==='ventas'&&!a.category.active)fail('La categoría de ventas es del sistema y debe permanecer activa.');
    if(c.categories.some(x=>x.id!==a.category.id&&x.direction===a.category.direction&&x.name.toLocaleLowerCase()===a.category.name.toLocaleLowerCase()))fail('Ya existe una categoría con ese nombre.');
    if(existing)Object.assign(existing,a.category);else{if(c.categories.length>=100)fail('Máximo 100 categorías.');c.categories.push(a.category);}
    audit(c,'category',`Categoría: ${a.category.name}`,a.category.id,now);return;
  }
  if(a.type==='cash-obligation') {
    const o=a.obligation,cat=category(c,o.categoryId,o.direction==='payable'?'expense':'income');
    const saved={...o,id:crypto.randomUUID(),categoryName:cat.name,paidCents:0,status:'pending' as const,createdAt:now,updatedAt:now};c.obligations.unshift(saved);audit(c,'obligation',`Compromiso: ${o.description}`,saved.id,now);return;
  }
  if(a.type==='cash-settle') {
    const o=c.obligations.find(o=>o.id===a.obligationId)??fail('Compromiso no encontrado.',404);
    if(o.status!=='pending')fail('El compromiso ya está saldado o cancelado.',409);
    if(a.amountCents>o.totalCents-o.paidCents)fail('El importe supera el saldo pendiente.');
    const direction=o.direction==='payable'?'expense':'income';
    post(c,{kind:direction,flow:direction,occurredAt:now,description:`${direction==='expense'?'Pago':'Cobro'}: ${o.description}`,counterparty:o.counterparty,reference:a.reference||o.reference,notes:a.notes,categoryId:o.categoryId,categoryName:o.categoryName,obligationId:o.id,lines:[line(c,a.accountId,a.amountCents*(direction==='expense'?-1:1),now)]},now);
    o.paidCents+=a.amountCents;o.updatedAt=now;if(o.paidCents===o.totalCents)o.status='settled';return;
  }
  if(a.type==='cash-cancel-obligation') {
    const o=c.obligations.find(o=>o.id===a.obligationId)??fail('Compromiso no encontrado.',404);
    if(o.status!=='pending')fail('El compromiso ya está cerrado.',409);
    o.status='cancelled';o.updatedAt=now;o.cancellationReason=a.reason;audit(c,'cancel-obligation',`Cancelado el saldo pendiente: ${a.reason}`,o.id,now);return;
  }
  if(a.type==='cash-reconcile') {
    const acc=account(c,a.accountId);
    if(acc.kind==='cash')fail('El efectivo se controla con arqueos y cierres de turno.');
    if(a.throughDate>=cashDate(now))fail('Conciliá un día ya finalizado, anterior a hoy.');
    if(c.reconciliations.some(r=>r.accountId===acc.id&&r.throughDate>=a.throughDate))fail('Ya hay una conciliación para esa fecha o una posterior.',409);
    const book=cashBalance(c,acc.id,a.throughDate);
    if(book!==a.expectedBookCents)fail('El libro cambió. Actualizá antes de confirmar la conciliación.',409);
    const difference=a.statementCents-book;
    if(difference&&a.notes.trim().length<3)fail('Explicá la diferencia con el extracto.');
    const previous=new Set(c.reconciliations.filter(r=>r.accountId===acc.id).flatMap(r=>r.movementIds));
    const saved={id:crypto.randomUUID(),accountId:acc.id,accountName:acc.name,throughDate:a.throughDate,statementCents:a.statementCents,bookCents:book,differenceCents:difference,movementIds:c.movements.filter(m=>m.lines.some(l=>l.accountId===acc.id)&&cashDate(m.occurredAt)<=a.throughDate&&!previous.has(m.id)).map(m=>m.id),notes:a.notes,createdAt:now,actor};
    c.reconciliations.unshift(saved);audit(c,'reconcile',`Conciliación ${acc.name} hasta ${a.throughDate}`,saved.id,now);return;
  }
}

export type CashFilters={from?:string;to?:string;accountId?:string;categoryId?:string;kind?:string;query?:string};
export function cashReport(cash:CashState,filters:CashFilters={}) {
  const q=(filters.query??'').trim().toLocaleLowerCase('es');
  const movements=cash.movements.filter(m=>(!filters.from||cashDate(m.occurredAt)>=filters.from)&&(!filters.to||cashDate(m.occurredAt)<=filters.to)&&(!filters.accountId||m.lines.some(l=>l.accountId===filters.accountId))&&(!filters.categoryId||m.categoryId===filters.categoryId)&&(!filters.kind||m.kind===filters.kind)&&(!q||`${m.number} ${m.description} ${m.counterparty} ${m.reference} ${m.notes} ${m.orderNumber??''}`.toLocaleLowerCase('es').includes(q))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.number-a.number);
  let incomeCents=0,expenseCents=0,salesCents=0,refundsCents=0,internalCents=0;
  const categories=new Map<string,{id:string;name:string;incomeCents:number;expenseCents:number;netCents:number}>(),days=new Map<string,{date:string;incomeCents:number;expenseCents:number;netCents:number}>();
  for(const m of movements) {
    const amount=m.lines.filter(l=>!filters.accountId||l.accountId===filters.accountId).reduce((s,l)=>s+l.amountCents,0);
    if(m.flow==='internal'){internalCents+=amount;continue;}
    const income=m.flow==='income'?amount:0,expense=m.flow==='expense'?-amount:0;
    incomeCents+=income;expenseCents+=expense;if(m.kind==='sale')salesCents+=amount;if(m.kind==='refund'||(m.kind==='reversal'&&cash.movements.find(original=>original.id===m.reversalOf)?.kind==='refund'))refundsCents-=amount;
    const key=m.categoryId??'otros',cat=categories.get(key)??{id:key,name:m.categoryName??'Sin categoría',incomeCents:0,expenseCents:0,netCents:0};cat.incomeCents+=income;cat.expenseCents+=expense;cat.netCents+=income-expense;categories.set(key,cat);
    const date=cashDate(m.occurredAt),day=days.get(date)??{date,incomeCents:0,expenseCents:0,netCents:0};day.incomeCents+=income;day.expenseCents+=expense;day.netCents+=income-expense;days.set(date,day);
  }
  return {movements,incomeCents,expenseCents,netCents:incomeCents-expenseCents,salesCents,refundsCents,internalCents,byCategory:[...categories.values()],byDay:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
