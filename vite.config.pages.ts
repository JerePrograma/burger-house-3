import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import frontendConfig from './frontend.config.json';

export default defineConfig({
  root: 'pages',
  define: {'import.meta.env.VITE_API_BASE_URL':JSON.stringify(process.env.VITE_API_BASE_URL || frontendConfig.apiBaseUrl)},
  base: process.env.PAGES_BASE_PATH || '/burger-house-3/',
  publicDir: '../public',
  resolve: { alias: { '@': resolve(import.meta.dirname) } },
  plugins: [react(), {
    name: 'pages-direct-routes',
    closeBundle() {
      const out = resolve('dist-pages');
      mkdirSync(resolve(out, 'admin'), { recursive: true });
      copyFileSync(resolve(out, 'index.html'), resolve(out, 'admin/index.html'));
      writeFileSync(resolve(out, '.nojekyll'), '');
    },
  }],
  server: { host: '127.0.0.1', port: 5173 },
  build: { outDir: '../dist-pages', emptyOutDir: true },
});
