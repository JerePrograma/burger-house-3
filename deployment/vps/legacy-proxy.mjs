const origin='https://srv2083548.hstgr.cloud';
const publicOrigin='https://scalaris.com.ar';
const base='/burger-house-3';
const legacyOrigins=new Set(['https://burger-house-3-web.jeremias-j-riv.workers.dev','https://burger-house-3-management.jeremias-j-riv.workers.dev']);
export default {async fetch(request,env){
  if(env.MIGRATING==='true')return Response.json({error:'Estamos trasladando la gestion al VPS. Volve a intentar en unos minutos.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'120'}});
  const url=new URL(request.url);
  if(env.COMPONENT==='web'||env.COMPONENT==='management'){
    const path=env.COMPONENT==='management'&&url.pathname==='/'?'/admin/':url.pathname;
    return Response.redirect(publicOrigin+base+path+url.search,307);
  }
  const prefix=env.COMPONENT==='publisher'?'/burger-house-3-editor':'/burger-house-3-api';
  if(env.COMPONENT==='api'&&url.pathname==='/admin/login'&&request.method==='GET')return Response.redirect(publicOrigin+prefix+'/admin/login?return_to='+encodeURIComponent(publicOrigin+base+'/admin/'),307);
  const headers=new Headers(request.headers),incomingOrigin=headers.get('Origin');
  if(legacyOrigins.has(incomingOrigin))headers.set('Origin',publicOrigin);
  headers.delete('Host');headers.delete('Cookie');
  const upstream=await fetch(origin+prefix+url.pathname+url.search,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body}:{}),redirect:'manual'});
  const response=new Response(upstream.body,upstream);
  response.headers.delete('Set-Cookie');response.headers.set('Cache-Control','no-store');
  if(legacyOrigins.has(incomingOrigin))response.headers.set('Access-Control-Allow-Origin',incomingOrigin);
  return response;
}};
