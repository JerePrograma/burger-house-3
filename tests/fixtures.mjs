export function fixture() {
  const ingredient = (id, stock, unit = 'u', extraPortion = 1) => ({ id, name: id, stock, unit, minStock: 2, extraPrice: 500, extraPortion, maxPerPatty: 3 });
  return {
    config: { name: 'Burger House 3', tagline: 'Hecho con amor', whatsapp: '5491123344218', instagram: 'burger_house3', deliveryFee: 1000, deliveryZone: 'Consultar', acceptingOrders: true },
    ingredients: [ingredient('pan', 10), ingredient('carne', 10), ingredient('cheddar', 20), ingredient('tomate', 200, 'g', 20), ingredient('papas', 2000, 'g', 200)],
    products: [{ id: 'clasica', name: 'Clásica', category: 'hamburguesas', description: 'Burger', image: '/burger.webp', active: true, variants: [{ id: 'simple', name: 'Simple', price: 10000, patties: 1 }, { id: 'doble', name: 'Doble', price: 13000, patties: 2 }], recipe: [{ ingredientId: 'pan', amount: 1 }, { ingredientId: 'carne', amount: 1, scalesWithPatties: true }, { ingredientId: 'cheddar', amount: 1, scalesWithPatties: true, removable: true }, { ingredientId: 'tomate', amount: 20, removable: true }, { ingredientId: 'papas', amount: 200 }], extras: ['cheddar', 'tomate'] }],
    orders: [], movements: [], nextOrderNumber: 1,
  };
}
export function input(item = {}) {
  return { customer: { name: 'Cliente demo', phone: '1123344218', fulfillment: 'retiro', address: '', notes: '' }, items: [{ key: 'linea-1', productId: 'clasica', variantId: 'simple', quantity: 1, removed: [], extras: {}, notes: '', ...item }], paymentMethod: 'efectivo', source: 'web', idempotencyKey: 'pedido-demo-123' };
}
