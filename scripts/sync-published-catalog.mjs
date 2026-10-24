import { writeFile } from 'node:fs/promises';
import { normalizePublishedCatalog } from '../lib/catalog-static.ts';
import frontend from '../frontend.config.json' with { type: 'json' };
import { createHash } from 'node:crypto';

// Deployment must carry the live catalog forward rather than overwrite mobile edits.
const initialize=process.argv.includes('--initialize-from-api');
const source=initialize?`${frontend.apiBaseUrl}/api/catalog`:(process.env.CATALOG_SNAPSHOT_URL||frontend.upstreamCatalogUrl);
const response=await fetch(source,{cache:'no-store',signal:AbortSignal.timeout(20000)});
if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('No se pudo recuperar el catálogo vigente. La publicación se detuvo para preservar los cambios del comercio.');
const raw=await response.text();
const value=JSON.parse(raw);
if(initialize){
  // Availability in the former API was inferred from stock. The static catalog
  // starts with explicit availability and never exposes that internal stock.
  for(const ingredient of value.ingredients??[])ingredient.available=true;
  for(const product of value.products??[]){
    product.available=product.active&&!product.unresolved;
    for(const variant of product.variants??[])variant.available=!product.unresolved;
  }
}
const catalog=normalizePublishedCatalog(value);
await writeFile(new URL('../public/catalog.json',import.meta.url),`${JSON.stringify(catalog,null,2)}\n`);
await writeFile(new URL('../.catalog-deploy-base.json',import.meta.url),JSON.stringify({sourceUrl:source,revision:initialize?null:createHash('sha256').update(raw).digest('hex')}));
console.log(`Catálogo ${initialize?'migrado desde la tienda anterior':'publicado recuperado'}: ${catalog.products.length} productos. No se modificaron pedidos, caja ni inventario.`);
