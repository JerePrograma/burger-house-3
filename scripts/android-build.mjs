import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const task=process.argv[2];
if(!['assembleDebug','bundleRelease'].includes(task))throw new Error('Tarea Android inválida.');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||(process.env.LOCALAPPDATA?resolve(process.env.LOCALAPPDATA,'Android/Sdk'):'');
if(!sdk||!existsSync(resolve(sdk,'platforms/android-36'))){
  console.error('Falta Android SDK 36. Instalalo desde Android Studio y configurá ANDROID_HOME. Consultá la sección Android de README.md.');
  process.exit(1);
}
const windows=process.platform==='win32';
const result=spawnSync(windows?'gradlew.bat':'./gradlew',[task],{cwd:resolve('android'),stdio:'inherit',shell:windows,env:{...process.env,ANDROID_HOME:sdk}});
if(result.error){console.error('No se pudo iniciar Gradle. Revisá Java 21 y Android Studio.');process.exit(1);}
process.exit(result.status??1);
