export type Category = 'hamburguesas' | 'papas' | 'milanesas' | 'sandwiches' | 'pizzas' | 'empanadas' | 'combos' | 'panchos';
export type Ingredient = { id: string; name: string; unit: 'u' | 'g'; stock: number; minStock: number; extraPrice: number; extraPortion: number; maxPerPatty: number; available?: boolean; };
export type RecipePart = { ingredientId: string; amount: number; scalesWithPatties?: boolean; removable?: boolean; };
export type Variant = { id: string; name: string; price: number; patties: number; recipeMultiplier?: number; recipe?: RecipePart[]; available?: boolean; };
export type Product = { id: string; name: string; category: Category; description: string; image: string; variants: Variant[]; recipe: RecipePart[]; extras: string[]; active: boolean; featured?: boolean; badge?: string; unresolved?: string; available?: boolean; };
export type CartItem = { key: string; productId: string; variantId: string; quantity: number; removed: string[]; extras: Record<string, number>; notes: string; };
export type Customer = { name: string; phone: string; fulfillment: 'retiro' | 'delivery'; address: string; notes: string; };
export type OrderStatus = 'pendiente' | 'aceptado' | 'preparando' | 'listo' | 'entregado' | 'cancelado';
export type OrderLine = CartItem & { name: string; variantName: string; unitPrice: number; removedNames: string[]; extraNames: string[]; consumption: Record<string, number>; };
export type Order = { id: string; number: number; createdAt: string; customer: Customer; lines: OrderLine[]; subtotal: number; deliveryFee: number; deliveryFeePending?: boolean; total: number; paymentMethod: 'efectivo' | 'transferencia' | 'mercadopago'; paid: boolean; status: OrderStatus; source: 'web' | 'whatsapp' | 'mostrador'; trackingToken: string; stockDeducted: boolean; stockReturned: boolean; };
export type Movement = { id: string; ingredientId: string; amount: number; reason: string; createdAt: string; orderId?: string; };
export type StoreConfig = { name: string; tagline: string; whatsapp: string; instagram: string; deliveryFee: number; deliveryFeeMode?: 'fixed' | 'quote'; deliveryZone: string; acceptingOrders: boolean; };
export type StoreState = { config: StoreConfig; ingredients: Ingredient[]; products: Product[]; orders: Order[]; movements: Movement[]; nextOrderNumber: number; cash?: import('./cash-domain').CashState; };
export type Catalog = Pick<StoreState, 'config' | 'products'> & { ingredients: Ingredient[] };
export type AdminAction = import('./cash-domain').CashAction
 | { type: 'verify-payment'; orderId: string; payments?: import('./cash-domain').CashPayment[] }
 | { type: 'order-status'; orderId: string; status: OrderStatus }
 | { type: 'delivery-fee'; orderId: string; amount: number }
 | { type: 'stock'; ingredientId: string; amount: number; reason: string; expectedStock?: number }
 | { type: 'ingredient'; ingredient: Ingredient }
 | { type: 'product'; product: Product }
 | { type: 'config'; config: StoreConfig };
export const categories: {id: Category; name: string; short: string}[] = [
 {id:'hamburguesas',name:'Hamburguesas',short:'Burgers'}, {id:'papas',name:'Papas & más',short:'Papas & más'},
 {id:'milanesas',name:'Milanesas',short:'Milanesas'}, {id:'sandwiches',name:'Sándwiches',short:'Sándwiches'},
 {id:'panchos',name:'Panchos',short:'Panchos'}, {id:'pizzas',name:'Pizzas',short:'Pizzas'}, {id:'empanadas',name:'Empanadas',short:'Empanadas'}, {id:'combos',name:'Combos & promos',short:'Combos'},
];
export const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
export const statusLabels: Record<OrderStatus,string> = {pendiente:'Pendiente',aceptado:'Aceptado',preparando:'En preparación',listo:'Listo',entregado:'Entregado',cancelado:'Cancelado'};
export function itemPrice(item: CartItem, product: Product, ingredients: Ingredient[]) {
 const variant = product.variants.find(v=>v.id===item.variantId);
 return (variant?.price ?? 0) + Object.entries(item.extras).reduce((sum,[id,qty])=>sum+(ingredients.find(i=>i.id===id)?.extraPrice??0)*qty,0);
}
