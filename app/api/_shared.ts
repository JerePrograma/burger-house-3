import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../chatgpt-auth';
import { CommerceError } from '../../lib/commerce';
import { StoreRepository } from '../../lib/repository';
import { createSeed } from '../../lib/seed';

export function repository() {
  if (!env.DB) throw new CommerceError('La base de datos todavía no está disponible.', 503);
  // New source-of-truth catalog gets its own demo dataset. The previous demo
  // remains recoverable in its original row; do not merge its old menu or edits.
  return new StoreRepository(env.DB, createSeed, 'burger-house-3-catalogo-20261019-v2');
}
export async function requireOwner(store: StoreRepository) {
  const user = await getChatGPTUser();
  if (!user) throw new CommerceError('Ingresá con ChatGPT para administrar el local.', 401);
  // The initial deployment is owner-private. Bind its first authenticated admin;
  // explicitly provision the owner before broadening access to this demo.
  await store.requireOwner(user.userId);
  return user;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function apiError(error: unknown) {
  if (error instanceof CommerceError) return json({ error: error.message }, error.status);
  return json({ error: 'No se pudo completar la operación. Volvé a intentarlo.' }, 500);
}
export async function readJson(request: Request): Promise<unknown> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new CommerceError('Origen de solicitud no permitido.', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new CommerceError('Se requiere un envío JSON.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > 65_536) throw new CommerceError('El envío es demasiado grande.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 65_536) throw new CommerceError('El envío es demasiado grande.', 413);
  try { return JSON.parse(text); } catch { throw new CommerceError('El envío no contiene JSON válido.'); }
}
export async function fingerprint(value: unknown): Promise<string> {
  const stable = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(stable) : entry && typeof entry === 'object' ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, stable(value)])) : entry;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(value))));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
