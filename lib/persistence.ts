import { Preferences } from '@capacitor/preferences';
import { isNativeApp } from './platform';
const writes=new Map<string,Promise<void>>();

/** Buyer cart/tracking only. Administrative credentials are never persisted here. */
export async function readPreference(key: string): Promise<string | null> {
  await writes.get(key)?.catch(()=>undefined);
  if (isNativeApp()) return (await Preferences.get({key})).value;
  return localStorage.getItem(key);
}
export function writePreference(key: string, value: string): Promise<void> {
  const operation=(writes.get(key)??Promise.resolve()).catch(()=>undefined).then(async()=>{
    if (isNativeApp()) await Preferences.set({key,value});
    else localStorage.setItem(key,value);
  });
  writes.set(key,operation);
  const cleanup=()=>{if(writes.get(key)===operation)writes.delete(key);};
  void operation.then(cleanup,cleanup);
  return operation;
}
