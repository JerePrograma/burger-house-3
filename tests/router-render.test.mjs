import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const config = JSON.parse(require('node:fs').readFileSync(new URL('../frontend.config.json', import.meta.url), 'utf8'));
// Wrangler already pins this build tool; no additional test dependency is needed.
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const actualRouter = require.resolve('@ionic/react-router');

for (const [mode, base, paths, layer = 'app'] of [
  ['management', config.managementBasePath, [new URL(config.managementUrl).pathname, new URL(config.managementUrl).pathname + 'nuevo/']],
  ['native', '/', ['/admin/', '/editar']],
  ['cloudflare', config.publicBasePath, [new URL(config.publicUrl).pathname, new URL(config.publicUrl).pathname + 'editar/'], 'catalog-app'],
]) {
  test(`el enrutador real de Ionic arranca en ${mode} sin fallar con rutas condicionales`, async () => {
    const privateRoot = resolve(root, '.private');
    mkdirSync(privateRoot, { recursive: true });
    const directory = mkdtempSync(join(privateRoot, 'router-regression-'));
    try {
      const outfile = join(directory, 'render.mjs');
      await build({
        absWorkingDir: root,
        stdin: {
          contents: `
            import assert from 'node:assert/strict';
            import React from 'react';
            import { renderToString } from 'react-dom/server';
            import App from './pages/${layer}.tsx';
            for (const pathname of ${JSON.stringify(paths)}) {
              globalThis.routeUnderTest = pathname;
              const html = renderToString(React.createElement(App));
              assert.ok(html.includes('<ion-router-outlet'), 'El outlet debe renderizarse en ' + pathname);
            }
            console.log('router-render-ok');
          `,
          resolveDir: root,
          loader: 'tsx',
        },
        outfile,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        loader: { '.css': 'empty' },
        define: {
          'import.meta.env': JSON.stringify({
            MODE: mode,
            BASE_URL: base,
            VITE_API_BASE_URL: 'https://api.example.test',
            VITE_CATALOG_PUBLISHER_URL: 'https://editor.example.test',
          }),
        },
        plugins: [{
          name: 'use-ionic-memory-history',
          setup(builder) {
            builder.onResolve({ filter: /^@ionic\/react-router$/ }, () => ({ path: 'memory-history', namespace: 'test-router' }));
            builder.onLoad({ filter: /.*/, namespace: 'test-router' }, () => ({
              // Only replace browser history. Exercise Ionic's installed outlet,
              // route extraction and view stack, including the production failure.
              contents: `
                import React from 'react';
                import { IonReactMemoryRouter } from ${JSON.stringify(actualRouter)};
                export const IonReactRouter = props => React.createElement(IonReactMemoryRouter, {
                  ...props, initialEntries: [globalThis.routeUnderTest],
                });
              `,
              resolveDir: root,
            }));
          },
        }],
      });
      const rendered = spawnSync(process.execPath, [outfile], { cwd: root, encoding: 'utf8', timeout: 30000 });
      assert.equal(rendered.status, 0, rendered.stderr || String(rendered.error));
      assert.match(rendered.stdout, /router-render-ok/);
    } finally {
      assert.equal(dirname(directory), privateRoot);
      assert.ok(basename(directory).startsWith('router-regression-'));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
