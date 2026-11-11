import { test as base, expect } from '@playwright/test';

// Todas las pruebas usan esta versión de `test`: activa el puente que expone las exportaciones de
// los módulos como globales (ver app/src/main.js) para poder llamar a la app desde page.evaluate.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => { window.__EXPOSE_APP__ = true; window.__NO_SPLASH__ = true; });
    await use(page);
  },
});
export { expect };
