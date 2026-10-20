import type { Ingredient, Product, RecipePart, StoreState, Variant } from './domain';
import { buildBurgers, burgerIngredients } from './catalog-burgers';

/** Prices and stated contents come exclusively from the 17 current WhatsApp
 * JPEGs in ../referencias. Initial inventory, unspecified recipe quantities and
 * extra prices are illustrative DEMO data. The extra patty's published price
 * is $3,500. Unknown compositions require consultation before ordering. */
const part = (ingredientId: string, amount: number, removable = true): RecipePart => ({ ingredientId, amount, removable });
const ingredient = (id: string, name: string, unit: Ingredient['unit'], stock: number, minStock: number,
  extraPrice = 0, extraPortion = 1, maxPerPatty = 6): Ingredient =>
  ({ id, name, unit, stock, minStock, extraPrice, extraPortion, maxPerPatty });
const one = (price: number, name = 'Porción'): Variant[] => [{ id: 'porcion', name, price, patties: 0 }];
const friesExtras = ['cheddar-salsa', 'bacon', 'verdeo', 'huevo'];
const pizzaExtras = ['muzzarella', 'jamon', 'calabresa', 'morron', 'huevo', 'tomate', 'cebolla-picada'];
const mealExtras = ['cheddar', 'queso-jyq', 'bacon', 'jamon', 'huevo', 'lechuga', 'tomate', 'cebolla-caramelizada'];
const panchoExtras = ['cheddar-salsa', 'bacon', 'jamon', 'queso-jyq', 'aderezo'];
const pizzaBase = (): RecipePart[] => [part('pizza-base', 1, false), part('salsa-tomate', 80), part('muzzarella', 250)];
const fullFries = (amount: number): RecipePart[] => [part('papas', amount, false), part('cheddar-salsa', 50), part('bacon', 30), part('verdeo', 10)];

function product(id: string, name: string, category: Product['category'], description: string,
  image: string, variants: Variant[], recipe: RecipePart[], extras: string[] = [], options: Partial<Product> = {}): Product {
  return { id, name, category, description, image: `/images/current-${image}.webp`, variants, recipe, extras: [...extras], active: true, ...options };
}

export function createSeed(): StoreState {
  const ingredients: Ingredient[] = [
    ...burgerIngredients,
    ingredient('pan-papa', 'Pan de papa', 'u', 120, 20),
    ingredient('medallon', 'Medallón de carne', 'u', 150, 20, 3500),
    ingredient('cheddar', 'Cheddar en fetas', 'u', 420, 40, 500, 1, 3),
    ingredient('bacon', 'Bacon / panceta', 'g', 6000, 600, 700, 20),
    ingredient('lechuga', 'Lechuga', 'g', 3000, 300, 300, 15),
    ingredient('tomate', 'Tomate', 'g', 5000, 500, 300, 30),
    ingredient('huevo', 'Huevo', 'u', 80, 10, 700),
    ingredient('jamon', 'Jamón', 'g', 3000, 300, 600, 25),
    ingredient('tybo', 'Queso Tybo', 'u', 100, 10, 500),
    ingredient('cebolla-caramelizada', 'Cebolla caramelizada', 'g', 2200, 250, 500, 20),
    ingredient('cebolla-crispy', 'Cebolla crispy', 'g', 120, 150, 500, 15),
    ingredient('cebolla-picada', 'Cebolla picada', 'g', 1800, 200, 250, 25),
    ingredient('salsa-tasty', 'Salsa Tasty', 'g', 1800, 200, 250, 15),
    ingredient('salsa-casa', 'Salsa de la casa', 'g', 1800, 200, 250, 15),
    ingredient('salsa-burger', 'Salsa de la burger', 'g', 1800, 200, 250, 15),
    ingredient('salsa-libra', 'Salsa Libra', 'g', 1500, 150, 250, 15),
    ingredient('salsa-bbq', 'Salsa barbacoa', 'g', 1800, 200, 250, 15),
    ingredient('ketchup', 'Ketchup', 'g', 2000, 200, 250, 15),
    ingredient('mostaza', 'Mostaza', 'g', 1500, 150, 250, 15),
    ingredient('papas', 'Papas fritas', 'g', 25000, 3000, 1000, 100),
    ingredient('cheddar-salsa', 'Salsa cheddar', 'g', 10000, 1000, 700, 40),
    ingredient('verdeo', 'Cebollita de verdeo', 'g', 800, 100, 300, 10),
    ingredient('nugget', 'Nuggets', 'u', 120, 20),
    ingredient('baston-muzzarella', 'Bastoncitos de muzzarella', 'u', 100, 15),
    ingredient('aro-cebolla', 'Aros de cebolla', 'u', 90, 15),
    ingredient('pan-pancho', 'Pan de pancho', 'u', 60, 10),
    ingredient('salchicha', 'Salchicha', 'u', 90, 15),
    ingredient('aderezo', 'Aderezo para pancho', 'g', 2000, 200, 250, 15),
    ingredient('milanesa', 'Milanesa', 'u', 36, 6),
    ingredient('pizza-base', 'Base de pizza', 'u', 35, 5),
    ingredient('muzzarella', 'Muzzarella', 'g', 12000, 1500, 1000, 100),
    ingredient('salsa-tomate', 'Salsa de tomate', 'g', 7000, 800),
    ingredient('calabresa', 'Calabresa', 'g', 1800, 200, 700, 30),
    ingredient('morron', 'Morrón', 'g', 1600, 200, 400, 30),
    ingredient('empanada-carne', 'Empanada de carne', 'u', 72, 12),
    ingredient('empanada-pollo', 'Empanada de pollo', 'u', 72, 12),
    ingredient('empanada-jamon-queso', 'Empanada de jamón y queso', 'u', 60, 12),
    ingredient('empanada-cuchillo', 'Empanada de carne cortada a cuchillo', 'u', 48, 12),
  ];

  const products: Product[] = [
    ...buildBurgers(),
    product('papas-medianas', 'Papas medianas', 'papas', 'Bandeja mediana simple o completa con cheddar, bacon y cebollita de verdeo.', 'papas',
      [{ id: 'simple', name: 'Simple', price: 8000, patties: 0 }, { id: 'completa', name: 'Completa', price: 9000, patties: 0, recipe: fullFries(300) }],
      [part('papas', 300, false)], friesExtras),
    product('papas-grandes', 'Papas grandes', 'papas', 'Bandeja grande simple o completa con cheddar, bacon y cebollita de verdeo.', 'papas',
      [{ id: 'simple', name: 'Simple', price: 10000, patties: 0 }, { id: 'completa', name: 'Completa', price: 11000, patties: 0, recipe: fullFries(500) }],
      [part('papas', 500, false)], friesExtras),
    product('papas-individuales', 'Papas individuales', 'papas', 'Bolsita individual de papas fritas.', 'papas-individuales', one(4000), [part('papas', 150, false)], friesExtras),
    product('nuggets', 'Nuggets', 'papas', 'Porción de 10 unidades.', 'nuggets', one(8000, '10 unidades'), [part('nugget', 10, false)]),
    product('bastoncitos', 'Bastoncitos de muzzarella', 'papas', 'Porción de 10 unidades.', 'bastoncitos', one(10000, '10 unidades'), [part('baston-muzzarella', 10, false)]),
    product('dips', 'Dips', 'papas', 'Cheddar, ketchup o barbacoa, a elección. $1.200 cada uno.', 'dips',
      [{ id: 'cheddar', name: 'Cheddar', price: 1200, patties: 0, recipe: [part('cheddar-salsa', 40, false)] },
        { id: 'ketchup', name: 'Ketchup', price: 1200, patties: 0, recipe: [part('ketchup', 40, false)] },
        { id: 'barbacoa', name: 'Barbacoa', price: 1200, patties: 0, recipe: [part('salsa-bbq', 40, false)] }], []),
    product('bandeja-bajonera', 'Bandeja grande bajonera', 'papas', '5 nuggets, 5 bastoncitos de muzzarella y 300 g de papas fritas con cheddar, panceta, verdeo y un huevo.', 'bandeja-mixta', one(17000),
      [part('nugget', 5, false), part('baston-muzzarella', 5, false), ...fullFries(300), part('huevo', 1)], friesExtras),
    product('pancho-doble', 'Pancho doble', 'panchos', 'Elegí aderezo y papas, jamón y queso con aderezo y papas, o cheddar y bacon.', 'panchos',
      [{ id: 'aderezo-papas', name: 'Aderezo + papas', price: 4000, patties: 0 },
        { id: 'jamon-queso', name: 'Jamón + queso + aderezo + papas', price: 5000, patties: 0, recipe: [part('pan-pancho', 1, false), part('salchicha', 2, false), part('jamon', 25), part('queso-jyq', 1), part('aderezo', 15), part('papas', 150, false)] },
        { id: 'cheddar-bacon', name: 'Cheddar + bacon', price: 5500, patties: 0, recipe: [part('pan-pancho', 1, false), part('salchicha', 2, false), part('cheddar-salsa', 40), part('bacon', 20)] }],
      [part('pan-pancho', 1, false), part('salchicha', 2, false), part('aderezo', 15), part('papas', 150, false)], panchoExtras),
    product('super-pancho', 'Súper pancho', 'panchos', 'Elegí aderezo y papas, o cheddar y bacon.', 'panchos',
      [{ id: 'aderezo-papas', name: 'Aderezo + papas', price: 2000, patties: 0 },
        { id: 'cheddar-bacon', name: 'Cheddar + bacon', price: 3500, patties: 0, recipe: [part('pan-pancho', 1, false), part('salchicha', 1, false), part('cheddar-salsa', 40), part('bacon', 20)] }],
      [part('pan-pancho', 1, false), part('salchicha', 1, false), part('aderezo', 15), part('papas', 150, false)], panchoExtras),
    product('milanesa-caballo', 'Milanesa a caballo completa', 'milanesas', 'Incluye huevo y papas fritas. Elegí para una, dos o tres personas.', 'milanesa-caballo',
      [{ id: 'una-persona', name: 'Para una persona', price: 15000, patties: 0, recipeMultiplier: 1 }, { id: 'dos-personas', name: 'Para dos personas', price: 23000, patties: 0, recipeMultiplier: 2 }, { id: 'tres-personas', name: 'Para tres personas', price: 27000, patties: 0, recipeMultiplier: 3 }],
      [part('milanesa', 1, false), part('huevo', 1), part('papas', 200, false)], mealExtras),
    product('napolitana', 'Napolitana completa', 'milanesas', 'Con jamón, muzzarella, tomate y salsa. Incluye papas fritas. Para una, dos o tres personas.', 'napolitana',
      [{ id: 'una-persona', name: 'Para una persona', price: 15000, patties: 0, recipeMultiplier: 1 }, { id: 'dos-personas', name: 'Para dos personas', price: 23000, patties: 0, recipeMultiplier: 2 }, { id: 'tres-personas', name: 'Para tres personas', price: 28000, patties: 0, recipeMultiplier: 3 }],
      [part('milanesa', 1, false), part('jamon', 40), part('muzzarella', 100), part('tomate', 60), part('salsa-tomate', 60), part('papas', 200, false)], [...mealExtras, 'muzzarella']),
    product('pizza-muzza', 'Pizza Muzza', 'pizzas', 'La muzza del menú.', 'pizza', one(11000, 'Pizza'), pizzaBase(), pizzaExtras),
    product('pizza-doble-muzza', 'Pizza Doble Muzza', 'pizzas', 'Doble muzzarella.', 'pizza', one(16000, 'Pizza'), [part('pizza-base', 1, false), part('salsa-tomate', 80), part('muzzarella', 500)], pizzaExtras),
    product('pizza-jamon-morron', 'Pizza de Jamón y Morrón', 'pizzas', 'Jamón y morrón.', 'pizza', one(14000, 'Pizza'), [...pizzaBase(), part('jamon', 100), part('morron', 60)], pizzaExtras),
    product('pizza-calabresa', 'Pizza Calabresa', 'pizzas', 'La calabresa del menú.', 'pizza', one(13500, 'Pizza'), [...pizzaBase(), part('calabresa', 80)], pizzaExtras),
    product('pizza-papa-huevo', 'Pizza de Papa y Huevo', 'pizzas', 'Papa y huevo.', 'pizza', one(15000, 'Pizza'), [...pizzaBase(), part('papas', 150), part('huevo', 2)], pizzaExtras),
    product('pizza-huevo', 'Pizza de Huevo', 'pizzas', 'La pizza de huevo del menú.', 'pizza', one(13500, 'Pizza'), [...pizzaBase(), part('huevo', 2)], pizzaExtras),
    product('pizza-napolitana', 'Pizza Napolitana', 'pizzas', 'La napolitana del menú.', 'pizza', one(13500, 'Pizza'), [...pizzaBase(), part('tomate', 90)], pizzaExtras),
    product('pizza-jamon', 'Pizza de Jamón', 'pizzas', 'La pizza de jamón del menú.', 'pizza', one(13500, 'Pizza'), [...pizzaBase(), part('jamon', 100)], pizzaExtras),
    product('pizza-fugacceta', 'Pizza Fugacceta', 'pizzas', 'La fugacceta del menú.', 'pizza', one(13500, 'Pizza'), [...pizzaBase(), part('cebolla-picada', 100)], pizzaExtras),
    product('pizza-pvc', 'Pizza PVC', 'pizzas', 'Precio publicado: $13.500. La composición de PVC debe confirmarse con el local.', 'pizza', one(13500, 'Pizza'), [], [],
      { unresolved: 'Falta confirmar qué ingredientes lleva PVC. El precio publicado es $13.500.' }),
    ...([
      ['empanadas-carne', 'Empanadas de carne', 'empanada-carne', 11000, 20000],
      ['empanadas-pollo', 'Empanadas de pollo', 'empanada-pollo', 11000, 20000],
      ['empanadas-jamon-queso', 'Empanadas de jamón y queso', 'empanada-jamon-queso', 11000, 20000],
      ['empanadas-cuchillo', 'Empanadas de carne cortada a cuchillo', 'empanada-cuchillo', 12000, 21000],
    ] as const).map(([id, name, stockId, halfPrice, dozenPrice]) => product(id, name, 'empanadas', 'Elegí media docena o docena. El precio corresponde al paquete completo.', 'empanadas',
      [{ id: 'media-docena', name: 'Media docena · 6', price: halfPrice, patties: 0, recipeMultiplier: 6 }, { id: 'docena', name: 'Docena · 12', price: dozenPrice, patties: 0, recipeMultiplier: 12 }], [part(stockId, 1, false)])),
    product('combo-especial', 'Combo especial', 'combos', '5 bastoncitos de muzzarella, 5 nuggets, papas completas con cheddar, bacon y verdeo, y una hamburguesa simple con cheddar y bacon.', 'combo-especial', one(19000, 'Combo'),
      [part('baston-muzzarella', 5, false), part('nugget', 5, false), part('papas', 300, false), part('cheddar-salsa', 50), part('verdeo', 10), part('pan-hamburguesa', 1, false), part('medallon', 1, false), part('cheddar', 1), part('bacon', 50)], [], { badge: 'Para compartir' }),
    product('promo-pizzas-1', 'Promo de pizzas N.º 1', 'combos', 'Una muzza y una muzza con huevo.', 'combo-pizzas', one(23000, 'Promo'),
      [part('pizza-base', 2, false), part('salsa-tomate', 160), part('muzzarella', 500), part('huevo', 2)]),
    product('promo-pizzas-2', 'Promo de pizzas N.º 2', 'combos', 'Precio publicado: $35.000. El folleto dice «una de jamón + una muzza + huevo». Consultá la composición exacta.', 'combo-pizzas', one(35000, 'Promo'), [], [],
      { unresolved: 'Debe confirmarse si esta promo incluye dos o tres pizzas y cómo se distribuye el huevo. Precio publicado: $35.000.' }),
    product('promo-pizzas-3', 'Promo de pizzas N.º 3', 'combos', 'Una muzza, una de jamón y una fuente mediana de papas completas.', 'combo-pizzas', one(30000, 'Promo'),
      [part('pizza-base', 2, false), part('salsa-tomate', 160), part('muzzarella', 500), part('jamon', 100), ...fullFries(300)]),
    product('cajita-4-personas', 'Cajita para 4 personas', 'combos', 'Precio publicado: $39.000. La imagen recibida recorta parte de la lista de ingredientes. Consultá el contenido exacto.', 'cajita-4-personas', one(39000, 'Para 4 personas'), [], [],
      { unresolved: 'Lista de ingredientes parcialmente recortada. Se leen milanesa, verdeo, bacon crocante, papas fritas, lechuga y tomate. Confirmar composición antes de pedir.' }),
  ];

  for (const item of products) {
    if (item.category === 'combos' && !item.unresolved) item.extras = [...new Set(item.recipe.filter(part => part.removable).map(part => part.ingredientId).concat(['cheddar', 'bacon', 'huevo']))];
  }

  const createdAt = new Date().toISOString();
  return {
    config: { name: 'Burger House 3', tagline: 'Hechas con amor y pasión', whatsapp: '5491123344218', instagram: 'burgerhousee3',
      deliveryZone: 'Marcos Paz y Mariano Acosta', deliveryFee: 0, deliveryFeeMode: 'quote', acceptingOrders: true },
    ingredients, products, orders: [],
    movements: ingredients.map((item) => ({ id: `inicial-${item.id}`, ingredientId: item.id, amount: item.stock, reason: 'Carga inicial ilustrativa de la demo', createdAt })),
    nextOrderNumber: 1,
  };
}
