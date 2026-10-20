import { useState, type FormEvent } from 'react';
import { IonButton, IonInput, IonSpinner, IonText } from '@ionic/react';
import { apiFetch, assetUrl, pageUrl, setAdminSession } from '@/lib/client';

export default function NativeAdminLogin({onSuccess}:{onSuccess:()=>void}) {
  const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function login(event:FormEvent) {
    event.preventDefault();if(busy||!password)return;setBusy(true);setError('');
    try {
      const response=await apiFetch('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const data=await response.json() as {token?:string;error?:string};
      if(!response.ok||!data.token)throw new Error(data.error||'No se pudo iniciar sesión.');
      setAdminSession(data.token);onSuccess();
    } catch(e) {setError(e instanceof Error?e.message:'No se pudo conectar con el local.');}
    finally {setPassword('');setBusy(false);}
  }
  return <main className="adm-access native-login"><div className="adm-access-card"><img src={assetUrl('/images/logo.png')} alt="Burger House 3"/><span className="adm-eyebrow">ADMINISTRACIÓN</span><h1>Tu local, bajo control.</h1><p>Ingresá con la clave de administradora para gestionar pedidos, caja e inventario.</p><form onSubmit={login}><IonInput label="Clave de administradora" labelPlacement="stacked" type="password" autocomplete="current-password" maxlength={200} value={password} onIonInput={e=>setPassword(e.detail.value??'')} disabled={busy}/>{error&&<IonText color="danger"><p role="alert">{error}</p></IonText>}<IonButton expand="block" type="submit" disabled={busy||!password}>{busy?<IonSpinner name="crescent"/>:'Ingresar al panel'}</IonButton></form><a className="adm-back" href={pageUrl('/')}>Volver a la tienda</a></div></main>;
}
