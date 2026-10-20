const encoder = new TextEncoder();
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function key(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, usage);
}
export async function issueSession(secret: string, now = Date.now()): Promise<string> {
  const payload = encode(encoder.encode(JSON.stringify({sub:'admin', iat:now, exp:now + 8*60*60*1000, nonce:crypto.randomUUID()})));
  const signature = await crypto.subtle.sign('HMAC', await key(secret,['sign']), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifySession(token: string, secret: string, now = Date.now()): Promise<boolean> {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || token.length > 1500) return false;
    if (!await crypto.subtle.verify('HMAC', await key(secret,['verify']), decode(signature), encoder.encode(payload))) return false;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return data.sub==='admin' && typeof data.iat==='number' && data.iat<=now+10000 && typeof data.exp==='number' && data.exp>now && data.exp-data.iat<=8*60*60*1000;
  } catch { return false; }
}
export function safeReturn(frontend: string, returnTo: string | null): string {
  const allowed = new URL(`${frontend.replace(/\/$/,'')}/admin/`);
  if (!returnTo) return allowed.href;
  const candidate = new URL(returnTo);
  if (candidate.origin!==allowed.origin || candidate.pathname!==allowed.pathname || candidate.search || candidate.hash) throw new Error('Destino no permitido.');
  return candidate.href;
}
