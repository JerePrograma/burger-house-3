import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const isNativeApp = () => Capacitor.isNativePlatform();
export function appNotice(message: string) { window.dispatchEvent(new CustomEvent('bh3:notice',{detail:message})); }
export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('El enlace externo no es válido.');
  if (isNativeApp()) await Browser.open({url:url.href,toolbarColor:'#11100e'});
  else window.open(url.href,'_blank','noopener,noreferrer');
}
