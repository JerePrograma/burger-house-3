import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { csvText } from './csv';
import { appNotice, isNativeApp } from './platform';

export async function exportCsv(filename: string, rows: (string | number)[][]): Promise<void> {
  try {
    const text=csvText(rows),safeName=filename.replace(/[^a-zA-Z0-9_.-]/g,'_');
    if (isNativeApp()) {
      const file=await Filesystem.writeFile({path:`exports/${safeName}`,data:text,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
      if (await Share.canShare().then(result=>result.value)) await Share.share({title:filename,url:file.uri,dialogTitle:'Guardar o compartir el informe'});
      else appNotice('El informe se guardó en la caché de la aplicación. Compartir no está disponible en este dispositivo.');
    } else {
      const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=safeName;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  } catch { appNotice('No se completó la exportación. Podés volver a intentarlo.'); }
}
