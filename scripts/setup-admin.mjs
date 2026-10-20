import { randomBytes, createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const accessPath = '.env.admin.local';
const secretsPath = '.env.backend-secrets.local.json';
if (existsSync(accessPath) || existsSync(secretsPath)) {
  throw new Error('El acceso ya existe. No se modifica ni se rota automáticamente.');
}
const password = randomBytes(24).toString('base64url');
const secrets = {
  ADMIN_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
  SESSION_SECRET: randomBytes(48).toString('base64url'),
};
writeFileSync(accessPath, `# Clave de administradora de Burger House 3. Archivo privado: no compartir ni subir a Git.\nADMIN_PASSWORD=${password}\n`, {mode:0o600});
writeFileSync(secretsPath, JSON.stringify(secrets), {mode:0o600});
writeFileSync('backend/.dev.vars', Object.entries(secrets).map(([name,value])=>`${name}=${value}`).join('\n')+'\n', {mode:0o600});
console.log('Acceso preparado en .env.admin.local; secretos del servidor en un archivo ignorado por Git.');
