import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(`${specifier}.ts`,context);throw error;}}});
const { createSeed } = await import('../lib/seed.ts');
import { quoteLine } from '../lib/commerce.ts';

const expected = {
 'papas-medianas': [8000,9000], 'papas-grandes':[10000,11000], 'papas-individuales':[4000], 'nuggets':[8000], 'bastoncitos':[10000], 'dips':[1200,1200,1200], 'bandeja-bajonera':[17000],
 'pancho-doble':[4000,5000,5500], 'super-pancho':[2000,3500], 'milanesa-caballo':[15000,23000,27000], 'napolitana':[15000,23000,28000],
 'pizza-muzza':[11000], 'pizza-doble-muzza':[16000], 'pizza-jamon-morron':[14000], 'pizza-calabresa':[13500], 'pizza-papa-huevo':[15000], 'pizza-huevo':[13500], 'pizza-napolitana':[13500], 'pizza-jamon':[13500], 'pizza-fugacceta':[13500], 'pizza-pvc':[13500],
 'empanadas-carne':[11000,20000], 'empanadas-pollo':[11000,20000], 'empanadas-jamon-queso':[11000,20000], 'empanadas-cuchillo':[12000,21000],
 'combo-especial':[19000], 'promo-pizzas-1':[23000], 'promo-pizzas-2':[35000], 'promo-pizzas-3':[30000], 'cajita-4-personas':[39000],
};
test('precios del resto del catálogo coinciden con los folletos JPEG vigentes',()=>{
 const products=createSeed().products;
 for(const [id,prices] of Object.entries(expected)) assert.deepEqual(products.find(p=>p.id===id)?.variants.map(v=>v.price),prices,id);
 assert.equal(products.length,48);
 for(const id of ['la-goat','milanesa-xl','caja-bestial','medio-metro-pollo','bill-ny'])assert.equal(products.some(p=>p.id===id),false);
});
test('cada foto activa existe y las únicas referencias públicas son los diecisiete JPEG nuevos',()=>{
 const state=createSeed();for(const p of state.products)assert.ok(existsSync('public'+p.image),p.id);
 assert.equal(readdirSync('public/images/references').filter(f=>f.endsWith('.webp')).length,17);
 assert.equal(readdirSync('public/images/references').some(f=>!f.startsWith('current-')),false);
});
test('contenidos publicados de nuggets, bastoncitos, bandeja y paquetes de empanadas se respetan',()=>{
 const state=createSeed(),find=id=>state.products.find(p=>p.id===id);
 assert.equal(find('nuggets').recipe[0].amount,10); assert.equal(find('bastoncitos').recipe[0].amount,10);
 assert.equal(find('bandeja-bajonera').recipe.find(r=>r.ingredientId==='papas').amount,300);
 assert.deepEqual(find('empanadas-cuchillo').variants.map(v=>v.recipeMultiplier),[6,12]);
 assert.equal(state.ingredients.find(i=>i.id==='medallon').extraPrice,3500);
 assert.equal(state.config.deliveryFeeMode,'quote');assert.equal(state.config.deliveryZone,'Marcos Paz y Mariano Acosta');
});
test('un combo de cinco burgers admite extras de cheddar hasta tres fetas por medallón real',()=>{
 const state=createSeed(),base={key:'family',productId:'combo-familiar',variantId:'simple-cheddar',quantity:1,removed:[],extras:{cheddar:10},notes:''};
 const line=quoteLine(state,base);assert.equal(line.consumption.cheddar,15);assert.equal(line.unitPrice,55000);
 assert.throws(()=>quoteLine(state,{...base,extras:{cheddar:11}}),/Máximo 15/);
});
