import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error('La publicación del VPS usa deployment/vps/Deploy-Vps.ps1 desde el puesto Windows autorizado. CI valida y compila sin publicar en Cloudflare.');
}
const result=spawnSync('powershell.exe',['-NoProfile','-File',fileURLToPath(new URL('../deployment/vps/Deploy-Vps.ps1',import.meta.url))],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
