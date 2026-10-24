import bundledCatalog from '../public/catalog.json' with { type: 'json' };
import frontendConfig from '../frontend.config.json' with { type: 'json' };
import type { CartItem, Catalog, Ingredient, Product, RecipePart, StoreConfig, Variant } from './domain';

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const LOAD_TIMEOUT_MS = 15000;
const categoryNames = ['hamburguesas', 'papas', 'milanesas', 'sandwiches', 'pizzas', 'empanadas', 'combos', 'panchos'] as const;
function fail(message: string): never { throw new Error(message); }

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label}: formato inválido.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) return fail(`${label}: contiene campos desconocidos o privados.`);
  return result;
}
function text(value: unknown, label: string, max = 500, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return fail(`${label}: texto inválido.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, 'Identificador', 80, 1);
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['__proto__', 'prototype', 'constructor'].includes(result)) return fail('Identificador inválido.');
  return result;
}
function number(value: unknown, label: string, min = 0, max = 10_000_000, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return fail(`${label}: número inválido.`);
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return fail(`${label}: valor inválido.`);
  return value;
}
function optionalBoolean(value: unknown, label: string, fallback = true): boolean {
  return value === undefined ? fallback : boolean(value, label);
}
function list<T>(value: unknown, label: string, max: number, parse: (value: unknown) => T, min = 0): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail(`${label}: cantidad de elementos inválida.`);
  return value.map(parse);
}
function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label}: hay elementos duplicados.`);
}
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(`${label}: opción inválida.`);
  return value as T;
}
function sizeOf(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return fail('El catálogo no es un documento JSON válido.'); }
}

function image(value: unknown): string {
  const result = text(value, 'Imagen', Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64, 1);
  if (result.startsWith('/images/')) {
    let decoded: string;
    try { decoded = decodeURIComponent(result); } catch { return fail('La ruta de la imagen no es válida.'); }
    if (result.length > 500 || /[\\?#\u0000-\u0020]/.test(decoded) || decoded.split('/').some(part => part === '..' || part === '.') || !/\.(?:webp|png|jpe?g)$/i.test(decoded)) return fail('Usá una imagen PNG, JPEG o WebP dentro de /images/.');
    return result;
  }
  const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(result);
  if (!match || match[2].length % 4 !== 0) return fail('La imagen debe ser PNG, JPEG o WebP; no se admite SVG.');
  const bytes = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return fail('Cada imagen debe ocupar como máximo 1 MB.');
  let header: string;
  try { header = atob(match[2].slice(0, 24)); } catch { return fail('La imagen contiene datos inválidos.'); }
  const valid = match[1] === 'png' ? header.startsWith('\x89PNG\r\n\x1a\n')
    : match[1] === 'jpeg' ? header.startsWith('\xff\xd8\xff')
    : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  if (!valid) return fail('El contenido de la imagen no coincide con su formato.');
  return result;
}
function recipe(value: unknown): RecipePart[] {
  const parts = list(value, 'Receta', 100, value => {
    const part = record(value, ['ingredientId', 'amount', 'scalesWithPatties', 'removable'], 'Ingrediente de receta');
    return {
      ingredientId: id(part.ingredientId), amount: number(part.amount, 'Cantidad de receta', 0.001),
      ...(part.scalesWithPatties === undefined ? {} : { scalesWithPatties: boolean(part.scalesWithPatties, 'Escalar ingrediente') }),
      ...(part.removable === undefined ? {} : { removable: boolean(part.removable, 'Ingrediente removible') }),
    };
  });
  unique(parts.map(part => part.ingredientId), 'Receta');
  return parts;
}
function parseIngredient(value: unknown): Ingredient {
  const data = record(value, ['id', 'name', 'unit', 'stock', 'minStock', 'extraPrice', 'extraPortion', 'maxPerPatty', 'available'], 'Ingrediente');
  // Stock is deliberately absent from the public contract's meaning, even when
  // an administrative export provides these compatibility fields.
  if (data.stock !== undefined) number(data.stock, 'Stock');
  if (data.minStock !== undefined) number(data.minStock, 'Stock mínimo');
  return {
    id: id(data.id), name: text(data.name, 'Nombre de ingrediente', 80, 1), unit: choice(data.unit, ['u', 'g'], 'Unidad'),
    stock: 0, minStock: 0, extraPrice: number(data.extraPrice, 'Precio del adicional', 0, 1_000_000),
    extraPortion: number(data.extraPortion, 'Porción adicional', 0.001), maxPerPatty: number(data.maxPerPatty, 'Máximo de adicionales', 0, 30, true),
    available: optionalBoolean(data.available, 'Disponibilidad del ingrediente'),
  };
}
function parseVariant(value: unknown): Variant {
  const data = record(value, ['id', 'name', 'price', 'patties', 'recipeMultiplier', 'recipe', 'available'], 'Variante');
  return {
    id: id(data.id), name: text(data.name, 'Nombre de variante', 100, 1), price: number(data.price, 'Precio', 0, 1_000_000),
    patties: number(data.patties, 'Medallones', 0, 20, true), available: optionalBoolean(data.available, 'Disponibilidad de variante'),
    ...(data.recipeMultiplier === undefined ? {} : { recipeMultiplier: number(data.recipeMultiplier, 'Multiplicador', 0.001, 100) }),
    ...(data.recipe === undefined ? {} : { recipe: recipe(data.recipe) }),
  };
}
function parseProduct(value: unknown): Product {
  const data = record(value, ['id', 'name', 'category', 'description', 'image', 'variants', 'recipe', 'extras', 'active', 'featured', 'badge', 'unresolved', 'available'], 'Producto');
  const active = boolean(data.active, 'Producto publicado');
  const unresolved = data.unresolved === undefined ? undefined : text(data.unresolved, 'Datos por confirmar', 1000);
  const manuallyAvailable = optionalBoolean(data.available, 'Disponibilidad del producto');
  // Keep each manual switch independent. Publishing an archived or sold-out
  // product must not erase which individual variants the business offers.
  const variants = list(data.variants, 'Variantes', 30, parseVariant, 1);
  const extras = list(data.extras, 'Adicionales', 100, id);
  unique(variants.map(variant => variant.id), 'Variantes'); unique(extras, 'Adicionales');
  return {
    id: id(data.id), name: text(data.name, 'Nombre del producto', 100, 1), category: choice(data.category, categoryNames, 'Categoría'),
    description: text(data.description, 'Descripción', 1000), image: image(data.image), variants, recipe: recipe(data.recipe), extras, active,
    available: manuallyAvailable,
    ...(data.featured === undefined ? {} : { featured: boolean(data.featured, 'Destacado') }),
    ...(data.badge === undefined ? {} : { badge: text(data.badge, 'Etiqueta', 80) }),
    ...(unresolved === undefined ? {} : { unresolved }),
  };
}
function parseConfig(value: unknown): StoreConfig {
  const data = record(value, ['name', 'tagline', 'whatsapp', 'instagram', 'deliveryFee', 'deliveryFeeMode', 'deliveryZone', 'acceptingOrders'], 'Configuración');
  const whatsapp = text(data.whatsapp, 'WhatsApp', 20, 8);
  if (!/^\+?\d{8,15}$/.test(whatsapp)) fail('WhatsApp debe tener código de país y entre 8 y 15 dígitos.');
  const instagram = text(data.instagram, 'Instagram', 50);
  if (instagram && !/^@?[a-zA-Z0-9_.]+$/.test(instagram)) fail('El usuario de Instagram no es válido.');
  return {
    name: text(data.name, 'Nombre del comercio', 100, 1), tagline: text(data.tagline, 'Lema', 200), whatsapp, instagram,
    deliveryFee: number(data.deliveryFee, 'Envío', 0, 100_000), deliveryZone: text(data.deliveryZone, 'Zona de entrega', 500),
    acceptingOrders: boolean(data.acceptingOrders, 'Aceptar pedidos'),
    ...(data.deliveryFeeMode === undefined ? {} : { deliveryFeeMode: choice(data.deliveryFeeMode, ['fixed', 'quote'] as const, 'Modo de envío') }),
  };
}

/** Validate and copy a public document. Operational data never leaves this API;
 * stock compatibility fields are zeroed without changing manual availability. */
export function normalizePublishedCatalog(value: unknown): Catalog {
  if (sizeOf(value) > MAX_DOCUMENT_BYTES) return fail('El catálogo supera el máximo de 20 MB.');
  const data = record(value, ['config', 'products', 'ingredients'], 'Catálogo');
  const ingredients = list(data.ingredients, 'Ingredientes', 300, parseIngredient);
  const products = list(data.products, 'Productos', 300, parseProduct);
  unique(ingredients.map(ingredient => ingredient.id), 'Ingredientes'); unique(products.map(product => product.id), 'Productos');
  const ingredientIds = new Set(ingredients.map(ingredient => ingredient.id));
  for (const product of products) {
    for (const ingredientId of [...product.extras, ...product.recipe.map(part => part.ingredientId), ...product.variants.flatMap(variant => (variant.recipe ?? []).map(part => part.ingredientId))]) {
      if (!ingredientIds.has(ingredientId)) fail(`El producto ${product.name} contiene un ingrediente inexistente.`);
    }
  }
  return { config: parseConfig(data.config), products, ingredients };
}

export function defaultPublishedCatalog(): Catalog {
  return normalizePublishedCatalog(bundledCatalog);
}

async function readPublicDocument(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_DOCUMENT_BYTES) fail('El catálogo supera el máximo de 20 MB.');
  if (!response.body) return JSON.parse(await response.text());
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let length = 0, content = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_DOCUMENT_BYTES) { await reader.cancel(); fail('El catálogo supera el máximo de 20 MB.'); }
      content += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(content + decoder.decode());
  } finally { reader.releaseLock(); }
}

function announceCatalogLoad(state: 'loaded' | 'fallback'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(`bh3:catalog-${state}`));
}

/** Web reads same-origin static JSON; Android reads the public static URL.
 * Callers can render the bundled snapshot while updated prices/photos load. */
export async function loadPublishedCatalog(options: { native?: boolean; timeoutMs?: number } = {}): Promise<Catalog> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
    const native = options.native ?? import.meta.env?.MODE === 'native';
    const url = native ? frontendConfig.catalogUrl : `${base}catalog.json`;
    const request = (async () => {
      const response = await fetch(url, { cache: 'no-cache', credentials: 'omit', signal: controller.signal });
      if (!response.ok) fail('No se pudo cargar el catálogo publicado.');
      return normalizePublishedCatalog(await readPublicDocument(response));
    })();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('El catálogo demoró demasiado.')); }, options.timeoutMs ?? LOAD_TIMEOUT_MS); });
    const catalog = await Promise.race([request, timeout]);
    announceCatalogLoad('loaded');
    return catalog;
  } catch {
    announceCatalogLoad('fallback');
    return defaultPublishedCatalog();
  }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Validate restored carts against the current public menu; never use stock or
 * create an administrative order when handing a request over to WhatsApp. */
export function validateCatalogCart(cart: CartItem[], catalog: Catalog): void {
  if (!catalog.config.acceptingOrders) fail('El local no está tomando pedidos en este momento.');
  const items = list(cart, 'Carrito', 30, value => {
    const data = record(value, ['key', 'productId', 'variantId', 'quantity', 'removed', 'extras', 'notes'], 'Producto del carrito');
    const removed = list(data.removed, 'Ingredientes quitados', 100, id);
    unique(removed, 'Ingredientes quitados');
    if (!data.extras || typeof data.extras !== 'object' || Array.isArray(data.extras) || Object.keys(data.extras).length > 100) fail('Adicionales inválidos.');
    const extras: Record<string, number> = {};
    for (const [key, value] of Object.entries(data.extras as Record<string, unknown>)) extras[id(key)] = number(value, 'Cantidad de adicionales', 0, 30, true);
    return { key: id(data.key), productId: id(data.productId), variantId: id(data.variantId), quantity: number(data.quantity, 'Cantidad', 1, 20, true), removed, extras, notes: text(data.notes, 'Notas', 500) };
  }, 1);
  unique(items.map(item => item.key), 'Productos del carrito');
  for (const item of items) {
    const product = catalog.products.find(product => product.id === item.productId);
    if (!product || !product.active || product.unresolved || product.available === false) fail('Un producto del carrito ya no está disponible. Revisá tu pedido.');
    const variant = product.variants.find(variant => variant.id === item.variantId);
    if (!variant || variant.available === false) fail(`La variante elegida de ${product.name} ya no está disponible.`);
    const parts = variant.recipe ?? product.recipe;
    if (item.removed.some(ingredientId => !parts.some(part => part.ingredientId === ingredientId && part.removable))) fail(`No se puede quitar uno de los ingredientes de ${product.name}.`);
    const consumption: Record<string, number> = {};
    for (const part of parts) if (!item.removed.includes(part.ingredientId)) {
      consumption[part.ingredientId] = (consumption[part.ingredientId] ?? 0) + part.amount * (variant.recipeMultiplier ?? 1) * (part.scalesWithPatties ? Math.max(1, variant.patties) : 1);
    }
    for (const [ingredientId, quantity] of Object.entries(item.extras)) {
      // Older restored carts kept a zero-valued extra when an ingredient was
      // removed. It requests nothing, including for ingredients never offered
      // as paid extras, and must not trigger membership or portion limits.
      if (quantity === 0) continue;
      if (!product.extras.includes(ingredientId)) fail('Un adicional del carrito ya no está permitido en este producto.');
      const ingredient = catalog.ingredients.find(ingredient => ingredient.id === ingredientId);
      if (!ingredient || (quantity > 0 && ingredient.available === false)) fail('Un adicional del carrito ya no está disponible.');
      const basePortions = (consumption[ingredientId] ?? 0) / ingredient.extraPortion;
      const maximum = ingredient.maxPerPatty * Math.max(1, consumption.medallon ?? variant.patties, variant.recipeMultiplier ?? 1);
      if (basePortions + quantity > maximum + 0.0001) fail(`Máximo ${maximum} porciones de ${ingredient.name}, contando las incluidas.`);
    }
  }
}
