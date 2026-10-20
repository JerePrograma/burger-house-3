import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendBase,frontendPath,routePath } from '../lib/frontend-paths.ts';
import { csvText } from '../lib/csv.ts';

test('Pages conserva la subcarpeta y Android usa rutas locales desde la raíz',()=>{
  for(const value of ['/burger-house-3/','burger-house-3','/burger-house-3']){
    const base=frontendBase(value);assert.equal(base,'/burger-house-3');
    assert.equal(frontendPath('/images/logo.png',base),'/burger-house-3/images/logo.png');
    assert.equal(frontendPath('/admin/',base),'/burger-house-3/admin/');
    assert.equal(frontendPath('/burger-house-3/admin/',base),'/burger-house-3/admin/');
    assert.equal(routePath('/burger-house-3/admin/',base),'/admin/');
    assert.equal(routePath('/another-app/',base),null);
    assert.equal(routePath('/burger-house-30/admin/',base),null);
  }
  assert.equal(frontendBase('/'),'');assert.equal(frontendPath('/admin/',''),'/admin/');assert.equal(routePath('/admin/',''),'/admin/');
});
test('los enlaces externos y anclas no reciben la base de publicación',()=>{
  for(const path of ['https://wa.me/5491123344218','//example.com','#menu','tel:1123344218'])assert.equal(frontendPath(path,'/burger-house-3'),path);
});
test('CSV preserva centavos, separadores y saltos de línea e impide fórmulas en texto',()=>{
  const value=csvText([['Proveedor','Importe'],['=HYPERLINK("https://evil.test")',1250.5],['+SUM(1;2)',-5.5],['Texto; "citado"\nOtra línea',0]]);
  assert.ok(value.startsWith('\uFEFF'));assert.ok(value.includes('"\'=HYPERLINK(""https://evil.test"")";"1250.5"'));
  assert.ok(value.includes('"\'+SUM(1;2)";"-5.5"'));assert.ok(value.includes('"Texto; ""citado""\nOtra línea";"0"'));
});
