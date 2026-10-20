import { frontendBase, frontendPath } from './frontend-paths';
const base = frontendBase(import.meta.env.BASE_URL || '/');
const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const SESSION_KEY = 'bh3-admin-session';

export function assetUrl(path: string): string {
  return path.startsWith('/images/') ? `${base}${path}` : path;
}
export function pageUrl(path: string): string {
  return frontendPath(path,base);
}
export function adminLoginUrl(): string {
  return `${apiBase}/admin/login?return_to=${encodeURIComponent(new URL(pageUrl('/admin/'), location.origin).href)}`;
}
export function acceptAdminSession(): void {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get('admin_token');
  if (token) {
    sessionStorage.setItem(SESSION_KEY, token);
    history.replaceState(null, '', location.pathname + location.search);
  }
}
export function clearAdminSession(): void { sessionStorage.removeItem(SESSION_KEY); }
export function setAdminSession(token: string): void {
  if (typeof token!=='string'||token.length>1500||!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token)) throw new Error('La sesión recibida no es válida.');
  sessionStorage.setItem(SESSION_KEY,token);
}
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = sessionStorage.getItem(SESSION_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'omit' });
}
