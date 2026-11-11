import { test, expect } from './_setup.mjs';

// Pantalla de carga (icono + barra). El resto de pruebas la desactivan (window.__NO_SPLASH__); aquí se vuelve a activar.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__NO_SPLASH__ = false; try { sessionStorage.clear(); localStorage.removeItem('claudemd_splash'); } catch (e) { /* ignorar */ } });
});

test('la pantalla de carga está desde el primer pintado, muestra solo icono y barra, y se retira sola', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#splash')).toBeVisible();
  await expect(page.locator('#splash .splash-icon')).toBeVisible();
  await expect(page.locator('#splash .splash-bar')).toBeVisible();
  expect((await page.locator('#splash').innerText()).trim()).toBe('');     // sin textos
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 9000 });
  await expect(page.locator('#home')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('splashing'))).toBe(false);
});

test('no se carga ninguna librería 3D', async ({ page }) => {
  const urls = [];
  page.on('request', r => urls.push(r.url()));
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 9000 });
  expect(urls.filter(u => /three/i.test(u))).toEqual([]);
});

test('prefers-reduced-motion: la pantalla se retira igualmente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 9000 });
});

test('se puede desactivar en Apariencia y la preferencia se recuerda', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 9000 });
  await page.evaluate(() => { hideHome(); openSettings(); });
  await page.locator('#splashSwitch').click();
  expect(await page.evaluate(() => localStorage.getItem('claudemd_splash'))).toBe('0');
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);        // ya no se muestra
});

test('las visitas siguientes de la misma sesión usan la versión corta', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 9000 });
  await page.addInitScript(() => { window.__NO_SPLASH__ = false; });
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 7000 });
});
