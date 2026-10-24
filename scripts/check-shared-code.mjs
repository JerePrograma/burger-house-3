import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('shared-code.json',root),'utf8'));
const normalize=value=>value.replaceAll('\r\n','\n').replaceAll('burger-house-3','__project__').replaceAll('tu-comida','__project__').replaceAll('Burger House 3','__Project__').replaceAll('Tu Comida','__Project__').replaceAll('BURGER HOUSE 3','__PROJECT__').replaceAll('TU COMIDA','__PROJECT__').replaceAll('tucomida','__namespace__').replaceAll('bh3','__namespace__');
const failed=[];
for(const [file,expected] of Object.entries(manifest.files)){
  const source=normalize(await readFile(new URL(file,root),'utf8'));
  if(createHash('sha256').update(source).digest('hex')!==expected)failed.push(file);
}
if(failed.length)throw new Error(`Revisar y homologar los cambios de código común: ${failed.join(', ')}`);
console.log(`Código común verificado: ${Object.keys(manifest.files).length} archivos. Identidad, datos y adaptadores de alojamiento quedan configurados por proyecto.`);
