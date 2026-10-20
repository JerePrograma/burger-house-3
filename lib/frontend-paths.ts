export function frontendBase(value = '/'): string {
  return `/${value.split('/').filter(Boolean).join('/')}`.replace(/\/$/, '');
}
export function frontendPath(path: string, base: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || (base && (path===base || path.startsWith(`${base}/`)))) return path;
  return `${base}${path}`;
}
export function routePath(path: string, base: string): string | null {
  if (base && path !== base && !path.startsWith(`${base}/`)) return null;
  return path.slice(base.length) || '/';
}
