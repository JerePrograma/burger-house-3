import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, sep } from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import frontendConfig from './frontend.config.json';

export default defineConfig(({mode}) => {
 const native=mode==='native';
 const cloudflare=mode==='cloudflare';
 const management=mode==='management';
 const out=resolve(native?'dist-native':management?'dist-management':cloudflare?'dist-cloudflare':'dist-pages');
 return {
  root: 'pages',
  define: {
    'import.meta.env.VITE_API_BASE_URL':JSON.stringify(process.env.VITE_API_BASE_URL || frontendConfig.apiBaseUrl),
    'import.meta.env.VITE_CATALOG_PUBLISHER_URL':JSON.stringify(process.env.VITE_CATALOG_PUBLISHER_URL || frontendConfig.publisherUrl),
  },
  base: native?'/' : management?frontendConfig.managementBasePath:process.env.PAGES_BASE_PATH || frontendConfig.publicBasePath,
  publicDir: '../public',
  resolve: { alias: { '@': resolve(import.meta.dirname), '@app-layer':resolve(import.meta.dirname,management||native?'pages/app.tsx':'pages/catalog-app.tsx') } },
  plugins: [react(), {
    name: 'pages-direct-routes',
    closeBundle() {
      // Original source flyers contain the former brand. Keep the evidence in
      // the checkout, outside all published and packaged applications.
      const archive=resolve(out,'images/references');
      if(!archive.startsWith(out+sep))throw new Error('Ruta de recursos inválida.');
      if(existsSync(archive))rmSync(archive,{recursive:true,force:true});
      for(const route of management||native?['admin','admin/nuevo']:['editar']) {
        mkdirSync(resolve(out, route), { recursive: true });
        copyFileSync(resolve(out, 'index.html'), resolve(out, route, 'index.html'));
      }
      writeFileSync(resolve(out, '.nojekyll'), '');
      if(!management&&!native) {
        const manifest:Record<string,{hash:string;size:number}>={};
        const walk=(directory:string,prefix='')=>{for(const item of readdirSync(directory,{withFileTypes:true})) {
          const path=`${prefix}/${item.name}`;
          if(item.isDirectory())walk(resolve(directory,item.name),path);
          else if(!['publication-manifest.json','_headers','_redirects','.nojekyll'].includes(item.name)) {
            const bytes=readFileSync(resolve(directory,item.name));
            manifest[path]={hash:createHash('sha256').update(bytes).digest('hex').slice(0,32),size:bytes.length};
          }
        }};
        walk(out);
        writeFileSync(resolve(out,'publication-manifest.json'),JSON.stringify({format:1,manifest}));
      }
    },
  }],
  server: { host: '127.0.0.1', port: 5173 },
  build: { outDir: out, emptyOutDir: true },
 };
});
