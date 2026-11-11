import { defineConfig } from '@playwright/test';

// Usa el Edge instalado en Windows (no descarga navegadores). En CI: PW_CHANNEL=chrome
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8799',
    channel: process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  },
  webServer: [
    { command: 'node tools/serve.mjs', env: { PORT: '8799' }, url: 'http://localhost:8799', reuseExistingServer: true },
    // Bundle de producción (dist/web, lo genera `npm run build`): lo usa tests/bundle.spec.mjs
    { command: 'node tools/serve.mjs --prod', env: { PORT: '8798' }, url: 'http://localhost:8798', reuseExistingServer: true },
  ],
});
