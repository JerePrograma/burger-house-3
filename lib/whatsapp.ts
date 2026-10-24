import { itemPrice, money, statusLabels, type CartItem, type Customer, type Ingredient, type Order, type Product, type StoreConfig } from './domain';

export type WhatsAppCheckout = Customer & { paymentMethod: Order['paymentMethod'] };
export type OrderRequestIdentity = { snapshot: string; key: string };

const paymentLabels: Record<Order['paymentMethod'], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
};
const confirmation = 'Disponibilidad, adicionales, envío y total final a confirmar por el local.';

/** Click-to-chat uses the international phone number without formatting. */
export function whatsappUrl(phone: string, message: string): string {
  if (typeof phone !== 'string' || !/^[+\d\s()-]+$/.test(phone)) throw new Error('El WhatsApp del local no es válido.');
  const digits = phone.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits)) throw new Error('El WhatsApp del local debe incluir el código de país.');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function customerDetails(customer: Customer, paymentMethod: Order['paymentMethod']): string[] {
  return [
    `Nombre: ${customer.name}`,
    `Celular: ${customer.phone}`,
    customer.fulfillment === 'delivery' ? `Entrega: delivery\nDirección: ${customer.address}` : 'Entrega: retiro en el local',
    `Forma de pago a coordinar: ${paymentLabels[paymentMethod]}`,
    ...(customer.notes ? [`Notas del pedido: ${customer.notes}`] : []),
  ];
}

/** Uses the server's frozen order amounts and names, not a later catalog. */
export function orderWhatsAppMessage(order: Order): string {
  const heading = order.status === 'pendiente' ? 'Solicitud de pedido' : 'Consulta por el pedido';
  const lines = order.lines.map((line, index) => [
    `${index + 1}. ${line.quantity} × ${line.name} · ${line.variantName}`,
    ...(line.removedNames.length ? [`   Sin: ${line.removedNames.join(', ')}`] : []),
    ...(line.extraNames.length ? [`   Adicionales por unidad: ${line.extraNames.join(', ')}`] : []),
    ...(line.notes ? [`   Notas para estas unidades: ${line.notes}`] : []),
    `   Importe web por unidad: ${money(line.unitPrice)}`,
    `   Importe web del renglón: ${money(line.unitPrice * line.quantity)}`,
  ].join('\n')).join('\n\n');
  const totals = [
    `Subtotal web de productos: ${money(order.subtotal)}`,
    order.customer.fulfillment === 'retiro' ? 'Retiro: sin costo de envío' : order.deliveryFeePending ? 'Envío: a confirmar según el barrio' : `Envío: ${money(order.deliveryFee)}`,
    order.deliveryFeePending ? `Importe web sin envío: ${money(order.subtotal)}` : `Importe web del pedido: ${money(order.total)}`,
  ];
  return [
    `Hola Burger House 3. ${heading} #${order.number}.`,
    `Estado en la web: ${statusLabels[order.status]}`,
    '', lines, '', ...totals, '',
    ...customerDetails(order.customer, order.paymentMethod),
    '', confirmation,
  ].join('\n');
}

/** A request for the business to quote: it has no server order number or final total. */
export function draftWhatsAppMessage(cart: CartItem[], products: Product[], ingredients: Ingredient[], checkout: WhatsAppCheckout): string {
  const lines = cart.map((item, index) => {
    const product = products.find(candidate => candidate.id === item.productId);
    const variant = product?.variants.find(candidate => candidate.id === item.variantId);
    const removed = item.removed.map(id => ingredients.find(ingredient => ingredient.id === id)?.name ?? id);
    const extras = Object.entries(item.extras).filter(([, count]) => count > 0).map(([id, count]) => `${ingredients.find(ingredient => ingredient.id === id)?.name ?? id} ×${count}`);
    return [
      `${index + 1}. ${item.quantity} × ${product?.name ?? `Producto a consultar (${item.productId})`} · ${variant?.name ?? 'Opción a confirmar'}`,
      ...(removed.length ? [`   Sin: ${removed.join(', ')}`] : []),
      ...(extras.length ? [`   Adicionales por unidad: ${extras.join(', ')}`] : []),
      ...(item.notes ? [`   Notas para estas unidades: ${item.notes}`] : []),
      variant ? `   Precio base de referencia por unidad: ${money(variant.price)}` : '   Precio a confirmar por el local',
    ].join('\n');
  }).join('\n\n');
  return [
    'Hola Burger House 3. Quisiera consultar y confirmar esta solicitud por WhatsApp.',
    'Solicitud sin registrar en la web.',
    '', lines, '', ...customerDetails(checkout, checkout.paymentMethod),
    '', 'Los precios base de catálogo son referencias; no incluyen los adicionales ni el envío.',
    confirmation,
  ].join('\n');
}

/** A catalog request is sent directly to the business, without creating an order. */
export function catalogWhatsAppMessage(cart: CartItem[], products: Product[], ingredients: Ingredient[], checkout: WhatsAppCheckout, config: StoreConfig): string {
  if (!cart.length) throw new Error('Agregá algún producto a tu pedido.');
  if (!checkout.name.trim()) throw new Error('Completá tu nombre.');
  if (!paymentLabels[checkout.paymentMethod]) throw new Error('Elegí una forma de pago válida.');
  if (!['retiro', 'delivery'].includes(checkout.fulfillment)) throw new Error('Elegí retiro o delivery.');
  if (checkout.fulfillment === 'delivery' && !checkout.address.trim()) throw new Error('Completá la dirección de entrega.');

  let subtotal = 0;
  const lines = cart.map(item => {
    const product = products.find(candidate => candidate.id === item.productId);
    const variant = product?.variants.find(candidate => candidate.id === item.variantId);
    if (!product || !product.active || product.available === false || product.unresolved || !variant || variant.available === false) {
      throw new Error('Un producto de tu pedido ya no está disponible. Revisá el carrito.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || !Number.isFinite(variant.price) || variant.price < 0) {
      throw new Error('Revisá la cantidad y el precio del producto.');
    }
    const removable = (variant.recipe ?? product.recipe).filter(part => part.removable).map(part => part.ingredientId);
    const removed = item.removed.map(id => {
      const ingredient = ingredients.find(candidate => candidate.id === id);
      if (!ingredient || !removable.includes(id)) throw new Error('Un ingrediente de tu pedido cambió. Revisá el carrito.');
      return ingredient.name;
    });
    const extras = Object.entries(item.extras).flatMap(([id, count]) => {
      const ingredient = ingredients.find(candidate => candidate.id === id);
      if (!Number.isInteger(count) || count < 0 || count > 30) throw new Error('Revisá la cantidad de adicionales.');
      if (count === 0) return [];
      if (!ingredient || !product.extras.includes(id) || ingredient.available === false || !Number.isFinite(ingredient.extraPrice) || ingredient.extraPrice < 0) {
        throw new Error('Un adicional de tu pedido ya no está disponible. Revisá el carrito.');
      }
      return [`${ingredient.name} ×${count}`];
    });
    const amount = itemPrice(item, product, ingredients) * item.quantity;
    if (!Number.isFinite(amount)) throw new Error('No pudimos calcular el importe. Revisá el carrito.');
    subtotal += amount;
    return [
      `${item.quantity} × ${product.name} · ${variant.name} — ${money(amount)}`,
      ...(removed.length ? [`  Sin por unidad: ${removed.join(', ')}`] : []),
      ...(extras.length ? [`  Extras por unidad: ${extras.join(', ')}`] : []),
      ...(item.notes.trim() ? [`  Nota: ${item.notes.trim()}`] : []),
    ].join('\n');
  });
  const delivery = checkout.fulfillment === 'delivery';
  const quoted = delivery && (config.deliveryFeeMode ?? 'quote') === 'quote';
  if (delivery && !quoted && (!Number.isFinite(config.deliveryFee) || config.deliveryFee < 0)) throw new Error('Consultá el costo de envío con el local.');
  return [
    `Hola ${config.name}, quiero pedir:`,
    '', ...lines, '',
    `Productos: ${money(subtotal)}`,
    delivery ? `Delivery: ${checkout.address.trim()}` : 'Retiro en el local · sin costo de envío',
    ...(quoted ? ['Envío: a confirmar según el barrio'] : delivery ? [`Envío: ${money(config.deliveryFee)}`] : []),
    ...(!quoted ? [`Total: ${money(subtotal + (delivery ? config.deliveryFee : 0))}`] : []),
    '', `Nombre: ${checkout.name.trim()}`,
    ...(checkout.phone.trim() ? [`Celular: ${checkout.phone.trim()}`] : []),
    `Pago: ${paymentLabels[checkout.paymentMethod]}`,
    ...(checkout.notes.trim() ? [`Observaciones: ${checkout.notes.trim()}`] : []),
    '', 'Disponibilidad a confirmar por el local.',
  ].join('\n');
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'idempotencyKey').sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

/** Retry the same request safely; editing any submitted detail starts a new request. */
export function orderRequestIdentity(payload: unknown, previous?: OrderRequestIdentity): OrderRequestIdentity {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('El pedido no tiene un formato válido.');
  const snapshot = JSON.stringify(stable(payload));
  return previous?.snapshot === snapshot ? previous : { snapshot, key: crypto.randomUUID() };
}
