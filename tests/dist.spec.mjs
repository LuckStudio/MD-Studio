import { test, expect } from './_setup.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// La versión de un solo archivo (npm run build) debe funcionar abierta con doble clic (file://)
test('dist/claude-md-editor.html: render completo sin servidor', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/inline event handler/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(resolve('dist/claude-md-editor.html')).href);
  await page.evaluate(() => { localStorage.clear(); hideHome(); });
  await page.evaluate(async () => {
    editor.value = '# Hola\n\n```js\nlet a = 1\n```\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B;\n```\n';
    editor.dispatchEvent(new Event('input')); updatePreview();
  });
  await expect(page.locator('#preview pre .hljs-keyword')).toBeVisible();
  await expect(page.locator('#preview .katex')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#preview .mermaid-block svg')).toBeVisible({ timeout: 15_000 });
  // tipografías locales incrustadas
  expect(await page.evaluate(() => document.fonts.check("16px 'Lora'"))).toBe(true);
  expect(errors).toEqual([]);
});
