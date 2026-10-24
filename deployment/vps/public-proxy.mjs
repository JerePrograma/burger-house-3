const publicOrigin = 'https://scalaris.com.ar';
const upstreamOrigin = 'https://srv2083548.hstgr.cloud';
const prefixes = ['/burger-house-3', '/burger-house-3-api', '/burger-house-3-editor'];

function isAppPath(path) {
  return prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

export async function proxyRequest(request, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (url.origin !== publicOrigin || !isAppPath(url.pathname)) {
    return new Response('Pagina no encontrada.', {status: 404});
  }
  if (url.pathname === '/burger-house-3') {
    return Response.redirect(publicOrigin + url.pathname + '/' + url.search, 308);
  }
  const headers = new Headers(request.headers);
  // The corporate site's cookies do not belong to the application on the VPS.
  for (const name of ['Host', 'Cookie', 'X-Forwarded-Host', 'X-Forwarded-For', 'Forwarded']) headers.delete(name);
  headers.set('X-Burger-Public-Origin', publicOrigin);
  const upstream = await upstreamFetch(upstreamOrigin + url.pathname + url.search, {
    method: request.method,
    headers,
    ...(!['GET', 'HEAD'].includes(request.method) ? {body: request.body} : {}),
    redirect: 'manual',
    cf: {cacheTtl: 0},
  });
  const response = new Response(upstream.body, upstream);
  response.headers.delete('Set-Cookie');
  const location = response.headers.get('Location');
  if (location) {
    const target = new URL(location, upstreamOrigin);
    if (target.origin === upstreamOrigin && isAppPath(target.pathname)) {
      response.headers.set('Location', publicOrigin + target.pathname + target.search + target.hash);
    }
  }
  return response;
}

export default {fetch: request => proxyRequest(request)};
