import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=new URL('../',import.meta.url),destination=new URL('.env.catalog-secrets.local.json',root);
let secrets;
try{secrets=JSON.parse(await readFile(destination,'utf8'));}
catch(error){
  if(error.code!=='ENOENT')throw new Error('No se pudo leer la configuración privada existente del editor. No se reemplazó.');
  const existing=JSON.parse(await readFile(new URL('.env.backend-secrets.local.json',root),'utf8'));
  if(!/^[a-f0-9]{64}$/.test(existing.ADMIN_PASSWORD_SHA256))throw new Error('Primero configurá el acceso de administración.');
  secrets={ADMIN_PASSWORD_SHA256:existing.ADMIN_PASSWORD_SHA256,SESSION_SECRET:randomBytes(48).toString('base64url')};
  await writeFile(destination,`${JSON.stringify(secrets,null,2)}\n`,{flag:'wx'});
}
if(process.argv.includes('--deploy')){
  try {
    const result=execFileSync(process.execPath,[fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js',root)),'secret','bulk','--config','backend/catalog-wrangler.jsonc'],{cwd:fileURLToPath(root),encoding:'utf8',input:JSON.stringify(secrets),stdio:['pipe','pipe','pipe']});
    if(!result.includes('Successfully'))throw new Error('unexpected');
    console.log('Acceso del editor instalado. La contraseña inicial coincide con administración; su sesión está aislada.');
  }catch{throw new Error('No se pudo instalar el acceso del editor. La configuración local se conserva; revisá la sesión de Cloudflare.');}
}else console.log('Configuración privada del editor preparada sin mostrar credenciales.');
