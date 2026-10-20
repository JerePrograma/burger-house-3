import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { IonApp, IonContent, IonPage, IonRouterOutlet, IonSpinner, IonToast, useIonRouter, useIonViewDidEnter } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { frontendBase, routePath } from '../lib/frontend-paths';
import { appNotice, isNativeApp, openExternalUrl } from '../lib/platform';

const base=frontendBase(import.meta.env.BASE_URL);
const Store=lazy(()=>import('../app/page'));
const AdminPage=lazy(()=>import('../app/admin/page'));
async function dismissPageDialogs(): Promise<boolean> {
  const dialogs=[...document.querySelectorAll('ion-modal')].filter(modal=>modal.isOpen);
  const results=await Promise.all(dialogs.map(modal=>modal.dismiss(undefined,'navigation')));
  return results.every(Boolean);
}
async function scrollToAnchor(hash:string) {
  if(!hash)return;
  let target:HTMLElement|null=null;
  try{target=document.getElementById(decodeURIComponent(hash.slice(1)));}catch{return;}
  const content=target?.closest('ion-content');
  if(!target||!content)return;
  const scroll=await content.getScrollElement();
  await content.scrollToPoint(undefined,scroll.scrollTop+target.getBoundingClientRect().top-scroll.getBoundingClientRect().top-90,300);
}
function Page({children,kind}:{children:ReactNode;kind:'store'|'admin'}) {
  useIonViewDidEnter(()=>{
    window.dispatchEvent(new Event('bh3:navigation'));
    void scrollToAnchor(location.hash);
  });
  return <IonPage className={`bh3-page bh3-${kind}-page`}><IonContent className="bh3-content"><Suspense fallback={<div className="bh3-loading"><IonSpinner name="crescent"/><p>Preparando el local…</p></div>}>{children}</Suspense></IonContent></IonPage>;
}
function Navigation() {
  const current=useLocation(),navigate=useNavigate(),router=useIonRouter();
  const previousPath=useRef(current.pathname);
  useEffect(()=>{
    if(previousPath.current!==current.pathname)void dismissPageDialogs();
    previousPath.current=current.pathname;
    window.dispatchEvent(new Event('bh3:navigation'));
    const frame=requestAnimationFrame(()=>void scrollToAnchor(current.hash));
    return()=>cancelAnimationFrame(frame);
  },[current.key,current.hash,current.search]);
  useEffect(()=>{
    const ready=()=>{void scrollToAnchor(location.hash);};
    window.addEventListener('bh3:content-ready',ready);
    return()=>window.removeEventListener('bh3:content-ready',ready);
  },[]);
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element).closest('a[href]') as HTMLAnchorElement|null;
      if(!link||link.hasAttribute('download'))return;
      const href=link.getAttribute('href');if(!href)return;
      const url=new URL(href,location.href);
      if(!['http:','https:'].includes(url.protocol))return;
      const path=url.origin===location.origin?routePath(url.pathname,base):null;
      if(path!==null&&!link.target){
        event.preventDefault();
        if(url.pathname===location.pathname&&url.search===location.search&&url.hash===location.hash)void scrollToAnchor(url.hash);
        else void dismissPageDialogs().then(allowed=>{if(allowed)navigate(`${path}${url.search}${url.hash}`);});
      }else if(isNativeApp()){
        event.preventDefault();void openExternalUrl(url.href).catch(()=>appNotice('No se pudo abrir el enlace. Volvé a intentarlo.'));
      }
    };
    document.addEventListener('click',click);
    return()=>document.removeEventListener('click',click);
  },[navigate]);
  useEffect(()=>{
    if(!isNativeApp())return;
    const handler=(event:Event)=>{
      const back=event as CustomEvent<{register:(priority:number,handler:()=>void)=>void}>;
      back.detail.register(-1,()=>{if(router.canGoBack())router.goBack();else void CapacitorApp.minimizeApp();});
    };
    document.addEventListener('ionBackButton',handler);
    return()=>document.removeEventListener('ionBackButton',handler);
  },[router]);
  return null;
}
export default function App() {
  const [notice,setNotice]=useState('');
  useEffect(()=>{const handler=(event:Event)=>setNotice(String((event as CustomEvent).detail||''));window.addEventListener('bh3:notice',handler);return()=>window.removeEventListener('bh3:notice',handler);},[]);
  return <IonApp><IonReactRouter basename={base||undefined} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Navigation/><IonRouterOutlet><Route path="/" element={<Page kind="store"><Store/></Page>}/><Route path="/admin" element={<Page kind="admin"><AdminPage/></Page>}/><Route path="*" element={<Navigate to="/" replace/>}/></IonRouterOutlet></IonReactRouter><IonToast isOpen={!!notice} message={notice} duration={4500} position="bottom" onDidDismiss={()=>setNotice('')}/></IonApp>;
}
