import type { AdminAction, CartItem, Catalog, Customer, Ingredient, Order, OrderLine, OrderStatus, Product, StoreConfig, StoreState, Variant } from './domain';

export class CommerceError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'CommerceError'; this.status = status; }
}
export type OrderInput = { customer: Customer; items: CartItem[]; paymentMethod: Order['paymentMethod']; source: Order['source']; idempotencyKey: string };
export type OrderBook = { state: StoreState; idempotencies: Record<string, { fingerprint: string; orderId: string }> };
const fail = (message: string, status = 400): never => { throw new CommerceError(message, status); };
const categories = ['hamburguesas', 'papas', 'milanesas', 'sandwiches', 'pizzas', 'empanadas', 'combos', 'panchos'] as const;
const statuses: OrderStatus[] = ['pendiente', 'aceptado', 'preparando', 'listo', 'entregado', 'cancelado'];
const round = (value: number) => Math.round(value * 1000) / 1000;

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Formato de datos inválido.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) return fail('El envío contiene campos desconocidos.');
  return record;
}
function string(value: unknown, label: string, max = 200, min = 0): string {
  if (typeof value !== 'string') return fail(`${label}: texto inválido.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) return fail(`${label}: longitud o caracteres inválidos.`);
  return result;
}
function id(value: unknown): string {
  const result = string(value, 'Identificador', 80, 1);
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['__proto__', 'prototype', 'constructor'].includes(result)) return fail('Identificador inválido.');
  return result;
}
function number(value: unknown, label: string, min = 0, max = 10_000_000, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return fail(`${label}: número inválido.`);
  return round(value);
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return fail(`${label}: valor inválido.`);
  return value;
}
function list<T>(value: unknown, max: number, parse: (value: unknown) => T, min = 0): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail('Cantidad de elementos inválida.');
  return value.map(parse);
}
function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) return fail(`${label}: opción inválida.`);
  return value as T;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) fail(`${label}: hay elementos duplicados.`);
}

function parseCustomer(value: unknown): Customer {
  const data = object(value, ['name', 'phone', 'fulfillment', 'address', 'notes']);
  const fulfillment = oneOf(data.fulfillment, ['retiro', 'delivery'], 'Entrega');
  const phone = string(data.phone, 'Teléfono', 30, 7);
  if (!/^[+\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7) fail('Ingresá un teléfono válido.');
  const address = string(data.address, 'Dirección', 250, fulfillment === 'delivery' ? 5 : 0);
  return { name: string(data.name, 'Nombre', 80, 2), phone, fulfillment, address, notes: string(data.notes ?? '', 'Observaciones', 500) };
}
function parseCartItem(value: unknown): CartItem {
  const data = object(value, ['key', 'productId', 'variantId', 'quantity', 'removed', 'extras', 'notes']);
  const extraData = data.extras;
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData) || Object.keys(extraData).length > 30) fail('Adicionales inválidos.');
  const extras: Record<string, number> = {};
  for (const [key, amount] of Object.entries(extraData as Record<string, unknown>)) {
    const extraId = id(key);
    const count = number(amount, 'Cantidad de adicionales', 0, 30, true);
    if (count > 0) extras[extraId] = count;
  }
  const removed = list(data.removed, 50, id);
  unique(removed, 'Ingredientes quitados');
  return { key: id(data.key), productId: id(data.productId), variantId: id(data.variantId), quantity: number(data.quantity, 'Cantidad', 1, 20, true), removed, extras, notes: string(data.notes ?? '', 'Observaciones', 500) };
}
export function parseOrderInput(value: unknown): OrderInput {
  const data = object(value, ['customer', 'items', 'paymentMethod', 'source', 'idempotencyKey']);
  const items = list(data.items, 30, parseCartItem, 1);
  unique(items.map(item => item.key), 'Productos del carrito');
  const key = string(data.idempotencyKey, 'Clave de pedido', 100, 8);
  if (!/^[a-zA-Z0-9_-]+$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Clave de pedido inválida.');
  return { customer: parseCustomer(data.customer), items, paymentMethod: oneOf(data.paymentMethod, ['efectivo', 'transferencia', 'mercadopago'], 'Medio de pago'), source: oneOf(data.source, ['web', 'whatsapp', 'mostrador'], 'Origen'), idempotencyKey: key };
}

function ingredientById(state: StoreState, ingredientId: string): Ingredient {
  return state.ingredients.find(item => item.id === ingredientId) ?? fail('La receta contiene un ingrediente inexistente.', 409);
}
function recipeConsumption(product: Product, variant: Variant, removed: string[] = []): Record<string, number> {
  const consumption: Record<string, number> = {};
  for (const part of variant.recipe ?? product.recipe) {
    if (removed.includes(part.ingredientId)) {
      if (!part.removable) fail('Ese ingrediente forma parte de la base y no se puede quitar.');
      continue;
    }
    const amount = part.amount * (variant.recipeMultiplier ?? 1) * (part.scalesWithPatties ? Math.max(1, variant.patties) : 1);
    consumption[part.ingredientId] = round((consumption[part.ingredientId] ?? 0) + amount);
  }
  return consumption;
}
function recipeFits(state: StoreState, consumption: Record<string, number>): boolean {
  return Object.entries(consumption).every(([ingredientId, amount]) => (state.ingredients.find(item => item.id === ingredientId)?.stock ?? -1) >= amount);
}
export function quoteLine(state: StoreState, item: CartItem): OrderLine {
  const product = state.products.find(entry => entry.id === item.productId);
  if (!product || !product.active || product.unresolved) return fail('El producto no está disponible.', 409);
  const variant = product.variants.find(entry => entry.id === item.variantId) ?? fail('La variante elegida no existe.');
  if (item.removed.some(ingredientId => !(variant.recipe ?? product.recipe).some(part => part.ingredientId === ingredientId && part.removable))) fail('No se puede quitar uno de los ingredientes seleccionados.');
  const consumption = recipeConsumption(product, variant, item.removed);
  let unitPrice = variant.price;
  const extraNames: string[] = [];
  for (const [ingredientId, quantity] of Object.entries(item.extras)) {
    if (!product.extras.includes(ingredientId)) fail('Ese adicional no está permitido en este producto.');
    const ingredient = ingredientById(state, ingredientId);
    const basePortions = (consumption[ingredientId] ?? 0) / ingredient.extraPortion;
    const maximum = ingredient.maxPerPatty * Math.max(1, consumption.medallon ?? variant.patties, variant.recipeMultiplier ?? 1);
    if (basePortions + quantity > maximum + 0.0001) fail(`Máximo ${maximum} porciones de ${ingredient.name}, contando las incluidas.`);
    consumption[ingredientId] = round((consumption[ingredientId] ?? 0) + ingredient.extraPortion * quantity);
    unitPrice += ingredient.extraPrice * quantity;
    extraNames.push(`${ingredient.name} ×${quantity}`);
  }
  return { ...structuredClone(item), name: product.name, variantName: variant.name, unitPrice, removedNames: item.removed.map(ingredientId => ingredientById(state, ingredientId).name), extraNames, consumption };
}
export function orderConsumption(order: Order): Record<string, number> {
  const total: Record<string, number> = {};
  for (const line of order.lines) for (const [ingredientId, amount] of Object.entries(line.consumption)) total[ingredientId] = round((total[ingredientId] ?? 0) + amount * line.quantity);
  return total;
}
function assertStock(state: StoreState, consumption: Record<string, number>) {
  for (const [ingredientId, amount] of Object.entries(consumption)) {
    const ingredient = ingredientById(state, ingredientId);
    if (ingredient.stock < amount) fail(`No alcanza el stock de ${ingredient.name}. Actualizá el pedido.`, 409);
  }
}
export function createOrder(state: StoreState, input: OrderInput, now = new Date().toISOString(), orderId: string = crypto.randomUUID(), trackingToken: string = crypto.randomUUID()): Order {
  if (!state.config.acceptingOrders) fail('El local no está tomando pedidos en este momento.', 409);
  const lines = input.items.map(item => quoteLine(state, item));
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const quoteDelivery = input.customer.fulfillment === 'delivery' && state.config.deliveryFeeMode === 'quote';
  const deliveryFee = input.customer.fulfillment === 'delivery' && !quoteDelivery ? state.config.deliveryFee : 0;
  const order: Order = { id: orderId, number: state.nextOrderNumber, createdAt: now, customer: structuredClone(input.customer), lines, subtotal, deliveryFee, ...(quoteDelivery ? { deliveryFeePending: true } : {}), total: subtotal + deliveryFee, paymentMethod: input.paymentMethod, paid: false, status: 'pendiente', source: input.source, trackingToken, stockDeducted: false, stockReturned: false };
  assertStock(state, orderConsumption(order));
  state.nextOrderNumber++;
  state.orders.unshift(order);
  return order;
}
export function createIdempotentOrder(book: OrderBook, input: OrderInput, fingerprint: string): Order {
  const previous = book.idempotencies[input.idempotencyKey];
  if (previous) {
    if (previous.fingerprint !== fingerprint) fail('Esa clave ya se utilizó con otro pedido.', 409);
    return book.state.orders.find(order => order.id === previous.orderId) ?? fail('No se pudo recuperar el pedido original.', 409);
  }
  const created = createOrder(book.state, input);
  book.idempotencies[input.idempotencyKey] = { fingerprint, orderId: created.id };
  return created;
}
function movement(state: StoreState, ingredientId: string, amount: number, reason: string, now: string, orderId?: string) {
  state.movements.unshift({ id: crypto.randomUUID(), ingredientId, amount: round(amount), reason, createdAt: now, ...(orderId ? { orderId } : {}) });
}
function findOrder(state: StoreState, orderId: string): Order {
  return state.orders.find(order => order.id === orderId) ?? fail('Pedido no encontrado.', 404);
}
export function verifyPayment(state: StoreState, orderId: string, now = new Date().toISOString()): Order {
  const order = findOrder(state, orderId);
  if (order.status === 'cancelado') fail('No se puede verificar un pedido cancelado.', 409);
  if (order.deliveryFeePending) fail('Cotizá el envío según el barrio antes de verificar el pago.', 409);
  if (order.paid) return order;
  if (!['pendiente', 'aceptado'].includes(order.status)) fail('El pago debe verificarse antes de preparar el pedido.', 409);
  const consumption = orderConsumption(order);
  assertStock(state, consumption);
  for (const [ingredientId, amount] of Object.entries(consumption)) {
    ingredientById(state, ingredientId).stock = round(ingredientById(state, ingredientId).stock - amount);
    movement(state, ingredientId, -amount, `Venta #${order.number}: pago verificado`, now, order.id);
  }
  order.paid = true;
  order.stockDeducted = true;
  return order;
}
export function changeOrderStatus(state: StoreState, orderId: string, status: OrderStatus, now = new Date().toISOString()): Order {
  const order = findOrder(state, orderId);
  if (order.status === status) return order;
  if (['entregado', 'cancelado'].includes(order.status)) fail('El pedido ya está cerrado.', 409);
  if (status === 'cancelado') {
    if (order.stockDeducted && !order.stockReturned) {
      const canReturn = ['pendiente', 'aceptado'].includes(order.status);
      for (const [ingredientId, amount] of Object.entries(orderConsumption(order))) {
        if (canReturn) ingredientById(state, ingredientId).stock = round(ingredientById(state, ingredientId).stock + amount);
        movement(state, ingredientId, canReturn ? amount : 0, canReturn ? `Devolución por cancelación #${order.number}` : `Merma por cancelación #${order.number}: ${amount} ${ingredientById(state, ingredientId).unit} utilizados`, now, order.id);
      }
      order.stockReturned = canReturn;
    }
    order.status = status;
    return order;
  }
  const current = statuses.indexOf(order.status);
  if (statuses[current + 1] !== status) fail('Avanzá el pedido de a un estado por vez.', 409);
  if (status === 'preparando' && !order.paid) fail('Verificá el pago antes de empezar la preparación.', 409);
  order.status = status;
  return order;
}

export function publicCatalog(state: StoreState): Catalog {
  return {
    config: structuredClone(state.config),
    ingredients: state.ingredients.map(ingredient => ({ ...ingredient, stock: 0, minStock: 0, available: ingredient.stock >= ingredient.extraPortion })),
    products: state.products.map(product => {
      const variants = product.variants.map(variant => ({ ...variant, available: product.active && !product.unresolved && recipeFits(state, recipeConsumption(product, variant)) }));
      return { ...structuredClone(product), variants, available: variants.some(variant => variant.available) };
    }),
  };
}
// This response is only returned to the creator or a holder of the tracking
// capability. Never provide a public order listing; recipe consumption is internal.
export function publicOrder(order: Order): Order {
  const result = structuredClone(order);
  result.lines = result.lines.map(line => ({ ...line, consumption: {} }));
  return result;
}
export function trackedOrder(state: StoreState, orderId: string | null, token: string | null): Order {
  if (!orderId || !token || orderId.length > 80 || token.length > 100) return fail('Pedido no encontrado.', 404);
  const order = state.orders.find(order => order.id === orderId && order.trackingToken === token);
  if (!order) return fail('Pedido no encontrado.', 404);
  return publicOrder(order);
}

function parseIngredient(value: unknown): Ingredient {
  const data = object(value, ['id', 'name', 'unit', 'stock', 'minStock', 'extraPrice', 'extraPortion', 'maxPerPatty', 'available']);
  return { id: id(data.id), name: string(data.name, 'Ingrediente', 80, 1), unit: oneOf(data.unit, ['u', 'g'], 'Unidad'), stock: number(data.stock, 'Stock'), minStock: number(data.minStock, 'Stock mínimo'), extraPrice: number(data.extraPrice, 'Precio adicional', 0, 1_000_000, true), extraPortion: number(data.extraPortion, 'Porción adicional', 0.001), maxPerPatty: number(data.maxPerPatty, 'Máximo por medallón', 0, 30, true) };
}
function parseRecipe(value: unknown, min = 1) {
  const recipe = list(value, 100, value => {
    const part = object(value, ['ingredientId', 'amount', 'scalesWithPatties', 'removable']);
    return { ingredientId: id(part.ingredientId), amount: number(part.amount, 'Cantidad de receta', 0.001), ...(part.scalesWithPatties === undefined ? {} : { scalesWithPatties: boolean(part.scalesWithPatties, 'Escala') }), ...(part.removable === undefined ? {} : { removable: boolean(part.removable, 'Se puede quitar') }) };
  }, min);
  unique(recipe.map(part => part.ingredientId), 'Receta');
  return recipe;
}
function parseProduct(value: unknown): Product {
  const data = object(value, ['id', 'name', 'category', 'description', 'image', 'variants', 'recipe', 'extras', 'active', 'featured', 'badge', 'unresolved', 'available']);
  const unresolved = data.unresolved === undefined ? undefined : string(data.unresolved, 'Pendiente de definir', 500);
  const variants = list(data.variants, 20, value => {
    const variant = object(value, ['id', 'name', 'price', 'patties', 'recipeMultiplier', 'recipe', 'available']);
    return { id: id(variant.id), name: string(variant.name, 'Variante', 80, 1), price: number(variant.price, 'Precio', 0, 1_000_000, true), patties: number(variant.patties, 'Medallones', 0, 12, true), ...(variant.recipeMultiplier === undefined ? {} : { recipeMultiplier: number(variant.recipeMultiplier, 'Multiplicador', 0.001, 100) }), ...(variant.recipe === undefined ? {} : { recipe: parseRecipe(variant.recipe) }) };
  }, unresolved ? 0 : 1);
  const recipe = parseRecipe(data.recipe, unresolved || variants.every(variant=>variant.recipe?.length) ? 0 : 1);
  unique(variants.map(variant => variant.id), 'Variantes');
  const extras = list(data.extras, 40, id);
  unique(extras, 'Adicionales');
  const image = string(data.image, 'Imagen', 500);
  if (image && (!image.startsWith('/') || image.startsWith('//') || image.includes('..'))) fail('Usá una imagen local del catálogo.');
  return { id: id(data.id), name: string(data.name, 'Producto', 100, 1), category: oneOf(data.category, categories, 'Categoría'), description: string(data.description, 'Descripción', 1000), image, variants, recipe, extras, active: boolean(data.active, 'Activo'), ...(data.featured === undefined ? {} : { featured: boolean(data.featured, 'Destacado') }), ...(data.badge === undefined ? {} : { badge: string(data.badge, 'Etiqueta', 80) }), ...(unresolved === undefined ? {} : { unresolved }) };
}
function parseConfig(value: unknown): StoreConfig {
  const data = object(value, ['name', 'tagline', 'whatsapp', 'instagram', 'deliveryFee', 'deliveryFeeMode', 'deliveryZone', 'acceptingOrders']);
  const whatsapp = string(data.whatsapp, 'WhatsApp', 25);
  if (whatsapp && !/^\+?\d{7,20}$/.test(whatsapp)) fail('WhatsApp debe contener el número con código de país.');
  const instagram = string(data.instagram, 'Instagram', 50);
  if (instagram && !/^@?[a-zA-Z0-9_.]+$/.test(instagram)) fail('Usuario de Instagram inválido.');
  return { name: string(data.name, 'Nombre del local', 100, 1), tagline: string(data.tagline, 'Lema', 200), whatsapp, instagram, deliveryFee: number(data.deliveryFee, 'Envío', 0, 100_000, true), ...(data.deliveryFeeMode === undefined ? {} : { deliveryFeeMode: oneOf(data.deliveryFeeMode, ['fixed', 'quote'] as const, 'Modo de envío') }), deliveryZone: string(data.deliveryZone, 'Zona de entrega', 500), acceptingOrders: boolean(data.acceptingOrders, 'Aceptar pedidos') };
}
export function parseAdminAction(value: unknown): AdminAction {
  if (!value || typeof value !== 'object') return fail('Acción inválida.');
  const type = (value as Record<string, unknown>).type;
  if (type === 'verify-payment') { const data = object(value, ['type', 'orderId']); return { type, orderId: id(data.orderId) }; }
  if (type === 'order-status') { const data = object(value, ['type', 'orderId', 'status']); return { type, orderId: id(data.orderId), status: oneOf(data.status, statuses, 'Estado') }; }
  if (type === 'delivery-fee') { const data = object(value, ['type', 'orderId', 'amount']); return { type, orderId: id(data.orderId), amount: number(data.amount, 'Costo de envío', 0, 100_000, true) }; }
  if (type === 'stock') { const data = object(value, ['type', 'ingredientId', 'amount', 'reason', 'expectedStock']); return { type, ingredientId: id(data.ingredientId), amount: number(data.amount, 'Movimiento', -10_000_000), reason: string(data.reason, 'Motivo', 200, 3), ...(data.expectedStock === undefined ? {} : { expectedStock: number(data.expectedStock, 'Stock esperado') }) }; }
  if (type === 'ingredient') { const data = object(value, ['type', 'ingredient']); return { type, ingredient: parseIngredient(data.ingredient) }; }
  if (type === 'product') { const data = object(value, ['type', 'product']); return { type, product: parseProduct(data.product) }; }
  if (type === 'config') { const data = object(value, ['type', 'config']); return { type, config: parseConfig(data.config) }; }
  return fail('Acción desconocida.');
}
export function applyAdminAction(state: StoreState, action: AdminAction, now = new Date().toISOString()): void {
  if (action.type === 'verify-payment') { verifyPayment(state, action.orderId, now); return; }
  if (action.type === 'order-status') { changeOrderStatus(state, action.orderId, action.status, now); return; }
  if (action.type === 'delivery-fee') {
    const order = findOrder(state, action.orderId);
    if (order.customer.fulfillment !== 'delivery') fail('Un pedido para retirar no tiene costo de envío.');
    if (order.paid || !['pendiente', 'aceptado'].includes(order.status)) fail('El envío sólo se puede cotizar antes del pago y de la preparación.', 409);
    order.deliveryFee = action.amount;
    order.deliveryFeePending = false;
    order.total = order.subtotal + action.amount;
    return;
  }
  if (action.type === 'stock') {
    const ingredient = ingredientById(state, action.ingredientId);
    if (action.expectedStock !== undefined && ingredient.stock !== action.expectedStock) fail('El stock cambió mientras contabas. Actualizá el inventario y revisá el conteo.', 409);
    const next = round(ingredient.stock + action.amount);
    if (next < 0 || next > 10_000_000 || action.amount === 0) fail('El movimiento debe modificar el stock sin dejarlo negativo.');
    ingredient.stock = next;
    movement(state, ingredient.id, action.amount, action.reason, now);
    return;
  }
  if (action.type === 'ingredient') {
    const index = state.ingredients.findIndex(item => item.id === action.ingredient.id);
    const previous = index < 0 ? 0 : state.ingredients[index].stock;
    if (index >= 0 && state.ingredients[index].unit !== action.ingredient.unit) fail('La unidad de un insumo existente no se puede cambiar; creá otro insumo.');
    if (index < 0) {
      state.ingredients.push(action.ingredient);
      if (action.ingredient.stock) movement(state, action.ingredient.id, action.ingredient.stock, 'Stock inicial de insumo', now);
    } else state.ingredients[index] = { ...action.ingredient, stock: previous };
    return;
  }
  if (action.type === 'product') {
    for (const ingredientId of [...action.product.recipe.map(part => part.ingredientId), ...action.product.variants.flatMap(variant => (variant.recipe ?? []).map(part => part.ingredientId)), ...action.product.extras]) ingredientById(state, ingredientId);
    const index = state.products.findIndex(item => item.id === action.product.id);
    if (index < 0) state.products.push(action.product); else state.products[index] = action.product;
    return;
  }
  state.config = action.config;
}
