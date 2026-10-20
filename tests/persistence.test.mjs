import test, {afterEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {Capacitor} from '@capacitor/core';

// Exercise the real persistence adapter with an isolated Preferences provider.
// This verifies its asynchronous contract without a device or browser storage.
let native=false;
const nativeValues=new Map(),webValues=new Map(),nativeCalls=[],webCalls=[];
const delayed=new Map();
const failures=new Set();
const originalIsNative=Capacitor.isNativePlatform;
const originalLocalStorage=globalThis.localStorage;
Capacitor.isNativePlatform=()=>native;
Capacitor.registerPlugin('Preferences',{web:()=>({
  async get({key}) {nativeCalls.push({method:'get',key});return {value:nativeValues.get(key)??null};},
  async set({key,value}) {
    nativeCalls.push({method:'set',key,value});
    await delayed.get(value)?.promise;
    if(failures.delete(value))throw new Error('Falla aislada de persistencia');
    nativeValues.set(key,value);
  },
})});
globalThis.localStorage={
  getItem(key){webCalls.push({method:'get',key});return webValues.get(key)??null;},
  setItem(key,value){webCalls.push({method:'set',key,value});if(failures.delete(value))throw new Error('Almacenamiento no disponible');webValues.set(key,value);},
};
const {readPreference,writePreference}=await import('../lib/persistence.ts');
function barrier(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
afterEach(()=>{native=false;nativeValues.clear();webValues.clear();nativeCalls.length=0;webCalls.length=0;delayed.clear();failures.clear();});
after(()=>{Capacitor.isNativePlatform=originalIsNative;if(originalLocalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalLocalStorage;});

test('web rehidrata el carrito previo sin modificar su contenido y conserva los datos ausentes como null',async()=>{
  const saved=JSON.stringify([{productId:'grand-tasty',notes:'Sin cebolla, por favor',quantity:2}]);
  webValues.set('bh3-cart-v1',saved);
  assert.equal(await readPreference('bh3-cart-v1'),saved);
  assert.equal(await readPreference('bh3-last-order-v1'),null);
  assert.equal(nativeCalls.length,0);
});

test('web serializa cambios rápidos y una rehidratación espera el último carrito ya solicitado',async()=>{
  webValues.set('bh3-cart-v1','anterior');
  const writes=['uno','dos','tres'].map(value=>writePreference('bh3-cart-v1',value));
  assert.equal(await readPreference('bh3-cart-v1'),'tres');
  await Promise.all(writes);
  assert.deepEqual(webCalls.filter(call=>call.method==='set').map(call=>call.value),['uno','dos','tres']);
  assert.equal(nativeCalls.length,0);
});

test('Android rehidrata carrito y seguimiento desde Preferences sin consultar localStorage',async()=>{
  native=true;
  const cart='[{"productId":"clasica","quantity":1}]',tracking='{"id":"order-id","token":"tracking-capability"}';
  nativeValues.set('bh3-cart-v1',cart);nativeValues.set('bh3-last-order-v1',tracking);
  assert.deepEqual(await Promise.all([readPreference('bh3-cart-v1'),readPreference('bh3-last-order-v1')]),[cart,tracking]);
  assert.equal(webCalls.length,0);
  assert.equal(await readPreference('sin-datos'),null);
});

test('una escritura nativa lenta no permite que un carrito anterior sobrescriba uno más reciente',async()=>{
  native=true;
  const gate=barrier();delayed.set('carrito-anterior',gate);
  const first=writePreference('bh3-cart-v1','carrito-anterior');
  const latest=writePreference('bh3-cart-v1','carrito-reciente');
  const hydrated=readPreference('bh3-cart-v1');
  let readFinished=false;void hydrated.then(()=>{readFinished=true;});
  await Promise.resolve();await Promise.resolve();
  assert.equal(readFinished,false);
  gate.release();
  await Promise.all([first,latest]);
  assert.equal(await hydrated,'carrito-reciente');
  assert.deepEqual(nativeCalls.filter(call=>call.method==='set').map(call=>call.value),['carrito-anterior','carrito-reciente']);
  assert.equal(webCalls.length,0);
});

test('carrito y seguimiento mantienen colas independientes',async()=>{
  native=true;
  const gate=barrier();delayed.set('carrito-lento',gate);
  const cart=writePreference('bh3-cart-v1','carrito-lento');
  const tracking=writePreference('bh3-last-order-v1','seguimiento-confirmado');
  await tracking;
  assert.equal(await readPreference('bh3-last-order-v1'),'seguimiento-confirmado');
  assert.equal(nativeValues.has('bh3-cart-v1'),false);
  gate.release();await cart;
  assert.equal(await readPreference('bh3-cart-v1'),'carrito-lento');
});

test('una falla nativa no bloquea una escritura posterior que ya estaba en la cola',async()=>{
  native=true;nativeValues.set('bh3-cart-v1','guardado');failures.add('fallido');
  const failed=writePreference('bh3-cart-v1','fallido');
  const recovered=writePreference('bh3-cart-v1','recuperado');
  await Promise.all([assert.rejects(failed,/persistencia/),recovered]);
  assert.equal(await readPreference('bh3-cart-v1'),'recuperado');
});

test('rehidratar tras una escritura fallida conserva lo existente y la cola web se recupera',async()=>{
  webValues.set('bh3-cart-v1','guardado');failures.add('fallido');
  const failed=writePreference('bh3-cart-v1','fallido');
  const rejection=assert.rejects(failed,/Almacenamiento/);
  assert.equal(await readPreference('bh3-cart-v1'),'guardado');
  await rejection;
  await writePreference('bh3-cart-v1','nuevo');
  assert.equal(await readPreference('bh3-cart-v1'),'nuevo');
});
