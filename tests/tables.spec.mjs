import { test, expect } from './_setup.mjs';

const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
});
const load = (page, md) => page.evaluate(async md => {
  editor.value = md; editor.dispatchEvent(new Event('input')); setView('preview'); updatePreview();
  await new Promise(r => setTimeout(r, 250));
}, md);
const src = page => page.evaluate(() => editor.value);

test('la barra de tabla aparece con el cursor en una celda y añade filas y columnas', async ({ page }) => {
  await load(page, TABLE);
  await expect(page.locator('#tblBar')).not.toHaveClass(/show/);
  await page.locator('#preview td').first().click();
  await expect(page.locator('#tblBar')).toHaveClass(/show/);
  await page.locator('#tblBar [data-tbl="row-add"]').click();
  await expect.poll(() => src(page)).toMatch(/\| 1 \| 2 \|\n\|\s+\|\s+\|/);
  await page.locator('#tblBar [data-tbl="col-add"]').click();
  await expect.poll(async () => (await src(page)).split('\n')[0].split('|').length).toBe(5);   // 3 columnas
});

test('Tab recorre las celdas y en la última añade una fila', async ({ page }) => {
  await load(page, TABLE);
  await page.locator('#preview th').first().click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');                              // desde la última celda: fila nueva
  await page.keyboard.type('X');
  await expect.poll(() => src(page)).toMatch(/\| X \|/);
  await expect(page.locator('#preview tbody tr')).toHaveCount(2);
});

test('alinear columna, borrar columna y borrar la tabla', async ({ page }) => {
  await load(page, TABLE + '\nTexto\n');
  await page.locator('#preview td').first().click();
  await page.locator('#tblBar [data-tbl="align"]').click();
  await expect.poll(() => src(page)).toContain(':--');
  await page.locator('#tblBar [data-tbl="col-del"]').click();
  await expect.poll(async () => (await src(page)).split('\n')[0]).toMatch(/^\|\s*B\s*\|$/);
  await page.locator('#tblBar [data-tbl="table-del"]').click();
  await expect.poll(() => src(page)).toBe('Texto\n');
});

test('Ctrl+Z / Ctrl+Y deshacen y rehacen ediciones de la vista previa', async ({ page }) => {
  await load(page, 'Uno\n');
  await page.locator('.md-blk p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dos');
  await expect.poll(() => src(page)).toBe('Uno dos\n');
  await page.waitForTimeout(500);
  await page.keyboard.type(' tres');
  await expect.poll(() => src(page)).toBe('Uno dos tres\n');
  await page.keyboard.press('Control+z');
  await expect.poll(() => src(page)).toBe('Uno dos\n');
  await page.keyboard.press('Control+z');
  await expect.poll(() => src(page)).toBe('Uno\n');
  await page.keyboard.press('Control+y');
  await expect.poll(() => src(page)).toBe('Uno dos\n');
  await expect(page.locator('#preview p')).toHaveText('Uno dos');
});
