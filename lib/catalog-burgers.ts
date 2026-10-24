import type { Ingredient, Product, RecipePart, Variant } from './domain';

/** Only the seven October 19 WhatsApp JPEGs are menu evidence. Ingredient names,
 * prices and advertised counts below are transcribed from their text. Recipe
 * weights, portions, scaling rules, inventory and other extra prices are separate
 * initial configuration defaults; the food photographs are not recipe evidence. */
export const burgerIngredients: Ingredient[] = [
  { id: 'pan-hamburguesa', name: 'Pan de hamburguesa', unit: 'u', stock: 120, minStock: 20, extraPrice: 0, extraPortion: 1, maxPerPatty: 0 },
  { id: 'queso-jyq', name: 'Queso (tipo a confirmar)', unit: 'u', stock: 100, minStock: 10, extraPrice: 500, extraPortion: 1, maxPerPatty: 3 },
];

const files = {
  cheese: 'WhatsApp Image 2026-10-19 at 9.55.31 PM.jpeg',
  classics: 'WhatsApp Image 2026-10-19 at 9.55.32 PM (1).jpeg',
  specials: 'WhatsApp Image 2026-10-19 at 9.55.32 PM.jpeg',
  bajonera: 'WhatsApp Image 2026-10-19 at 9.55.29 PM (1).jpeg',
  bombaPromo: 'WhatsApp Image 2026-10-19 at 9.55.28 PM (1).jpeg',
  family: 'WhatsApp Image 2026-10-19 at 9.55.30 PM.jpeg',
  kids: 'WhatsApp Image 2026-10-19 at 9.55.32 PM (2).jpeg',
};

// Literal flyer text is deliberately separate from the symbolic stock recipes.
export const burgerFlyerEvidence = [
  { id: 'cheese-burger', source: files.cheese, printedName: 'CHESSE BURGER', ingredientText: null, prices: { simple: 11000, doble: 14000, triple: 16000, cuadruple: 18000, quintuple: 20000 }, notes: ['El mejor cheddar. No contiene una lista de ingredientes.'] },
  { id: 'clasica', source: files.classics, printedName: 'CLÁSICA', ingredientText: 'Pan-Blend De carne-Tomate-lechuga', prices: { simple: 10000, doble: 11000, triple: 13500 } },
  { id: 'jamon-queso', source: files.classics, printedName: 'JYQ', ingredientText: 'Pan-Blend De Carne-Jamon y Queso', prices: { simple: 11000, doble: 14000, triple: 16000 }, notes: ['El tipo de queso no está especificado.'] },
  { id: 'burger-loca', source: files.classics, printedName: 'BURGER LOCA', ingredientText: 'Pan-Blend De carne-cheddar-Bacon-salsa de la casa-lechuga Tomate', prices: { simple: 11000, doble: 16000, triple: 18000 } },
  { id: 'tata-burga', source: files.classics, printedName: 'TATA BURGA', ingredientText: 'Pan-Blend De carne-cheddar-bacon-salsa de la casa-Cebolla crispy-Jamon', prices: { simple: 11000, doble: 15000, triple: 16000 } },
  { id: 'bomba-burger', source: files.classics, printedName: 'BOMBA BURGER', ingredientText: 'Pan-Blend De carne-cheddar-bacon-cebolla caramelizada-huevo-salsa de la casa-tomate y lechuga', prices: { simple: 11000, doble: 15000, triple: 16000 } },
  { id: 'chesse-burger-triple', source: files.specials, printedName: 'CHESSE BURGER TRIPLE', ingredientText: 'Pan de papa-blend de carne-cheddar-Ketchup-cebollita picada', prices: { simple: 11000, doble: 14000, triple: 16000 }, notes: ['Aunque el nombre dice TRIPLE, el folleto publica SIMPLE, DOBLE y TRIPLE.'] },
  { id: 'extra-bacon', source: files.specials, printedName: 'EXTRA BACON', ingredientText: 'Pan de papa-blend de carne-cheddar-salsa de la burger-extra bacon', prices: { simple: 11000, doble: 14000, triple: 16000 } },
  { id: 'grand-tasty', source: files.specials, printedName: 'GRAND TASTY', ingredientText: 'Pan de papa-blend de carne-doble cheddar-salsa tasty-bacon-tomate-lechuga', prices: { simple: 11000, doble: 14000, triple: 16000 } },
  { id: 'onion-crispy', source: files.specials, printedName: 'LA ONION CRISPY', ingredientText: 'Pan de papa-blend de carne-doble cheddar-bacon-salsa de la casa-Cebolla crispy', prices: { simple: 11000, doble: 14000, triple: 16000 } },
  { id: 'bbq', source: files.specials, printedName: 'BBQ', ingredientText: 'Pan de papa,blend de carne,-cheddar,bacon,cebolla caramelizada,huevo,salsa Barbacoa', prices: { simple: 11000, doble: 14000, triple: 16000 } },
  { id: 'cuarto-libra', source: files.specials, printedName: 'CUARTO DE LIBRA', ingredientText: 'Pan de papa,blend de carne,doble cheddar,salsa Libra,(cebollita picada,Ketchup,mostaza)', prices: { simple: 11000, doble: 14000, triple: 16000 }, notes: ['No queda claro si el paréntesis describe la salsa Libra o ingredientes aparte. Se mantienen todos los nombres publicados.'] },
  { id: 'big-bacon', source: files.specials, printedName: 'BIG BACON', ingredientText: 'Pan de papa-blend de carne-cheddar-bacon-salsa de la casa', prices: { simple: 11000, doble: 14000, triple: 16000 } },
  { id: 'bomba-chesse-house', source: files.specials, printedName: 'BOMBA CHESSE HOUSE', ingredientText: 'Pan de papa,blend de carne,-cheddar-bacon', prices: { doble: 16000, triple: 17500 }, notes: ['No se anuncia simple. El texto nuevo no especifica un baño de cheddar.'] },
  { id: 'la-bajonera', source: files.bajonera, printedName: 'LA BAJONERA', ingredientText: 'PAN DE PAPA; BLEND DE CARNE; CHEDDAR; BACON; AROS DE CEBOLLA; SALSITA BARBACOA', prices: { triple: 17500 }, notes: ['ÚNICAMENTE TRIPLE.'] },
  { id: 'promo-bomba-chesse', source: files.bombaPromo, printedName: 'PROMO BOMBA CHESSE HOUSE', ingredientText: null, prices: { 'promo-dos': 29000 }, notes: ['Se publican 2 unidades por $29.000, sin especificar doble o triple. Compra deshabilitada hasta confirmar tamaño y receta de la promoción.'] },
  { id: 'combo-familiar', source: files.family, printedName: 'COMBO FAMILIAR', ingredientText: '5 BURGER SIMPLES (CHEDDAR O TYBO) + BACON; 5 BURGER DOBLES (CHEDDAR O TYBO) + BACON; 5 BURGER TRIPLES (CHEDDAR O TYBO) + BACON', prices: { simples: 50000, dobles: 64000, triples: 74000 }, notes: ['Son cinco hamburguesas en cada opción. Cheddar o Tybo son alternativas, no ambos juntos.', 'Este folleto no menciona papas; los menús nuevos afirman que todas las hamburguesas vienen con papas fritas. Se aplica esa regla general, con una cantidad inicial configurable.'] },
  { id: 'combo-infantil', source: files.kids, printedName: 'COMBO INFANTIL', ingredientText: 'Hamburguesa Simple Cheddar; 4 Nuggets; Papas Fritas', prices: { infantil: 10000 } },
] as const;

const part = (ingredientId: string, amount: number, removable = true, scalesWithPatties = false): RecipePart => ({ ingredientId, amount, removable, ...(scalesWithPatties ? { scalesWithPatties: true } : {}) });
const topping = (ingredientId: string, amount: number) => part(ingredientId, amount, true, true);
const sizes = ['simple', 'doble', 'triple', 'cuadruple', 'quintuple'] as const;
const sizeNames = ['Simple', 'Doble', 'Triple', 'Cuádruple', 'Quíntuple'];
function variants(prices: number[]): Variant[] { return prices.map((price, index) => ({ id: sizes[index], name: sizeNames[index], price, patties: index + 1 })); }
const burgerExtras = ['medallon', 'cheddar', 'bacon', 'lechuga', 'tomate', 'huevo', 'jamon', 'tybo', 'cebolla-caramelizada', 'cebolla-crispy', 'cebolla-picada', 'salsa-casa', 'salsa-burger', 'salsa-tasty', 'salsa-bbq', 'ketchup', 'mostaza', 'aro-cebolla'];
function burger(id: string, name: string, description: string, prices: number[], recipe: RecipePart[], bread = 'pan-papa', options: Partial<Product> = {}): Product {
  return { id, name, category: 'hamburguesas', description: `${description} Incluye papas fritas.`, image: `/images/${id}.webp`, variants: variants(prices), recipe: [part(bread, 1, false), part('medallon', 1, false, true), part('papas', 150, false), ...recipe], extras: [...burgerExtras], active: true, ...options };
}

export function buildBurgers(): Product[] {
  const products: Product[] = [
    burger('cheese-burger', 'Cheese Burger', 'La principal de la casa, con cheddar. Elegí de simple a quíntuple. La composición completa se confirma con el comercio.', [11000, 14000, 16000, 18000, 20000], [topping('cheddar', 1)], 'pan-hamburguesa', { featured: true, badge: 'Hasta quíntuple' }),
    burger('clasica', 'Clásica', 'Pan, blend de carne, tomate y lechuga.', [10000, 11000, 13500], [topping('tomate', 30), topping('lechuga', 15)], 'pan-hamburguesa'),
    burger('jamon-queso', 'JYQ', 'Pan, blend de carne, jamón y queso. El folleto no especifica el tipo de queso.', [11000, 14000, 16000], [topping('jamon', 25), topping('queso-jyq', 1)], 'pan-hamburguesa'),
    burger('burger-loca', 'Burger Loca', 'Pan, blend de carne, cheddar, bacon, salsa de la casa, lechuga y tomate.', [11000, 16000, 18000], [topping('cheddar', 1), topping('bacon', 20), topping('salsa-casa', 15), topping('lechuga', 15), topping('tomate', 30)], 'pan-hamburguesa'),
    burger('tata-burga', 'Tata Burga', 'Pan, blend de carne, cheddar, bacon, salsa de la casa, cebolla crispy y jamón.', [11000, 15000, 16000], [topping('cheddar', 1), topping('bacon', 20), topping('salsa-casa', 15), topping('cebolla-crispy', 15), topping('jamon', 25)], 'pan-hamburguesa'),
    burger('bomba-burger', 'Bomba Burger', 'Pan, blend de carne, cheddar, bacon, cebolla caramelizada, huevo, salsa de la casa, tomate y lechuga.', [11000, 15000, 16000], [topping('cheddar', 1), topping('bacon', 20), topping('cebolla-caramelizada', 20), topping('huevo', 1), topping('salsa-casa', 15), topping('tomate', 30), topping('lechuga', 15)], 'pan-hamburguesa'),
    burger('chesse-burger-triple', 'Chesse Burger Triple', 'Pan de papa, blend de carne, cheddar, ketchup y cebollita picada. El menú ofrece simple, doble y triple.', [11000, 14000, 16000], [topping('cheddar', 1), topping('ketchup', 15), topping('cebolla-picada', 25)]),
    burger('extra-bacon', 'Extra Bacon', 'Pan de papa, blend de carne, cheddar, salsa de la burger y extra bacon.', [11000, 14000, 16000], [topping('cheddar', 1), topping('salsa-burger', 15), topping('bacon', 40)]),
    burger('grand-tasty', 'Grand Tasty', 'Pan de papa, blend de carne, doble cheddar, salsa Tasty, bacon, tomate y lechuga.', [11000, 14000, 16000], [topping('cheddar', 2), topping('salsa-tasty', 15), topping('bacon', 20), topping('tomate', 30), topping('lechuga', 15)], 'pan-papa', { featured: true, badge: 'Especial de la casa' }),
    burger('onion-crispy', 'La Onion Crispy', 'Pan de papa, blend de carne, doble cheddar, bacon, salsa de la casa y cebolla crispy.', [11000, 14000, 16000], [topping('cheddar', 2), topping('bacon', 20), topping('salsa-casa', 15), topping('cebolla-crispy', 15)]),
    burger('bbq', 'BBQ', 'Pan de papa, blend de carne, cheddar, bacon, cebolla caramelizada, huevo y salsa barbacoa.', [11000, 14000, 16000], [topping('cheddar', 1), topping('bacon', 20), topping('cebolla-caramelizada', 20), topping('huevo', 1), topping('salsa-bbq', 15)]),
    burger('cuarto-libra', 'Cuarto de Libra', 'Pan de papa, blend de carne, doble cheddar, salsa Libra, cebollita picada, ketchup y mostaza.', [11000, 14000, 16000], [topping('cheddar', 2), topping('salsa-libra', 15), topping('cebolla-picada', 25), topping('ketchup', 15), topping('mostaza', 15)]),
    burger('big-bacon', 'Big Bacon', 'Pan de papa, blend de carne, cheddar, bacon y salsa de la casa.', [11000, 14000, 16000], [topping('cheddar', 1), topping('bacon', 20), topping('salsa-casa', 15)]),
    burger('bomba-chesse-house', 'Bomba Chesse House', 'Pan de papa, blend de carne, cheddar y bacon.', [], [topping('cheddar', 1), topping('bacon', 20)], 'pan-papa', { variants: [{ id: 'doble', name: 'Doble', price: 16000, patties: 2 }, { id: 'triple', name: 'Triple', price: 17500, patties: 3 }] }),
    burger('la-bajonera', 'La Bajonera', 'Pan de papa, blend de carne, cheddar, bacon, aros de cebolla y salsita barbacoa. Únicamente triple.', [], [topping('cheddar', 1), topping('bacon', 20), topping('aro-cebolla', 1), topping('salsa-bbq', 15)], 'pan-papa', { variants: [{ id: 'triple', name: 'Triple', price: 17500, patties: 3 }], featured: true, badge: 'La nueva de la casa' }),
  ];

  const familyRecipe = (cheese: string): RecipePart[] => [part('pan-hamburguesa', 5, false), part('medallon', 5, false, true), part(cheese, 5, true, true), part('bacon', 100, true, true), part('papas', 750, false)];
  const familyVariants: Variant[] = [];
  for (const [index, price] of [50000, 64000, 74000].entries()) {
    for (const cheese of ['cheddar', 'tybo']) familyVariants.push({ id: `${sizes[index]}-${cheese}`, name: `5 ${['simples', 'dobles', 'triples'][index]} · ${cheese === 'tybo' ? 'Tybo' : 'Cheddar'}`, price, patties: index + 1, recipe: familyRecipe(cheese) });
  }
  products.push(
    { id: 'combo-familiar', name: 'Combo familiar', category: 'combos', description: '5 hamburguesas simples, dobles o triples, con cheddar o Tybo y bacon. Incluye papas según la indicación general del menú.', image: '/images/combo-familiar.webp', variants: familyVariants, recipe: familyRecipe('cheddar'), extras: [], active: true, featured: true, badge: '5 hamburguesas' },
    { id: 'combo-infantil', name: 'Combo infantil', category: 'combos', description: 'Hamburguesa simple con cheddar, 4 nuggets y papas fritas.', image: '/images/combo-infantil.webp', variants: [{ id: 'infantil', name: 'Combo infantil', price: 10000, patties: 1 }], recipe: [part('pan-hamburguesa', 1, false), part('medallon', 1, false), part('cheddar', 1), part('nugget', 4, false), part('papas', 150, false)], extras: [], active: true, badge: 'Para los más chicos' },
    { id: 'promo-bomba-chesse', name: 'Promo Bomba Chesse House · 2 por $29.000', category: 'combos', description: 'Promoción publicada de 2 Bomba Chesse House por $29.000. El folleto no indica el tamaño.', image: '/images/promo-bomba-chesse.webp', variants: [{ id: 'promo-dos', name: '2 hamburguesas · tamaño a confirmar', price: 29000, patties: 0 }], recipe: [], extras: [], active: true, badge: '2 por $29.000', unresolved: 'Falta confirmar si la promoción incluye hamburguesas dobles o triples. Precio publicado: 2 por $29.000. Consultá antes de pedir.' },
  );
  return products;
}
