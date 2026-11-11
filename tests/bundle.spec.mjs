import { test, expect } from './_setup.mjs';

// El bundle de producción (dist/web/app.js, minificado) debe comportarse igual que los módulos de desarrollo
test.use({ baseURL: 'http://localhost:8798' });

test('bundle de producción: arranque, edición en la vista previa y Mermaid', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/inline event handler/.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#home')).toBeVisible();
  expect(await page.evaluate(() => [...document.scripts].filter(s => s.src).map(s => s.src.split('/').pop()))).toContain('app.js');
  await page.evaluate(() => hideHome());
  await page.evaluate(async () => {
    editor.value = 'Uno\n\n```mermaid\ngraph LR; A-->B;\n```\n'; editor.dispatchEvent(new Event('input')); setView('preview'); updatePreview();
    await new Promise(r => setTimeout(r, 300));
  });
  await expect(page.locator('#preview .mermaid-block svg')).toBeVisible({ timeout: 15000 });
  await page.locator('.md-blk > p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dos');
  await expect.poll(() => page.evaluate(() => editor.value)).toContain('Uno dos');
  expect(errors).toEqual([]);
});
