import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './register-ts.mjs';

const defaultOutput = fileURLToPath(new URL('../public/catalog.json', import.meta.url));

/** A seed is only an initial public document. Never overwrite a published menu
 * as a side effect of a build: the business may have edited prices or photos. */
export async function buildCatalogSnapshot({ outputPath = defaultOutput, refreshSeed = false } = {}) {
  if (existsSync(outputPath) && !refreshSeed) return { created: false, outputPath };
  const { createSeed } = await import('../lib/seed.ts');
  const state = createSeed();
  const catalog = {
    config: state.config,
    ingredients: state.ingredients.map(ingredient => ({ ...ingredient, stock: 0, minStock: 0, available: ingredient.available !== false })),
    products: state.products.map(product => {
      const available = product.active && !product.unresolved && product.available !== false;
      const variants = product.variants.map(variant => ({ ...variant, available: available && variant.available !== false }));
      return { ...product, variants, available: available && variants.some(variant => variant.available) };
    }),
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: 'utf8', flag: refreshSeed ? 'w' : 'wx' });
  return { created: true, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== '--refresh-seed')) throw new Error('Opción desconocida. Usá --refresh-seed sólo para reemplazar el catálogo por la semilla.');
  const result = await buildCatalogSnapshot({ refreshSeed: args.includes('--refresh-seed') });
  process.stdout.write(result.created ? 'Catálogo público inicial generado.\n' : 'Catálogo público existente conservado.\n');
}
