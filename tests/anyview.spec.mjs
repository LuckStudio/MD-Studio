import { test, expect } from './_setup.mjs';

// La vista previa se edita en cualquier vista y la barra lateral actúa sobre ella
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
});
const load = (page, md, view) => page.evaluate(async ([md, view]) => {
  editor.value = md; editor.dispatchEvent(new Event('input')); setView(view); updatePreview();
  await new Promise(r => setTimeout(r, 250));
}, [md, view]);
const src = page => page.evaluate(() => editor.value);

test('vista dividida: escribir en la vista previa actualiza el editor de texto', async ({ page }) => {
  await load(page, 'Uno\n', 'split');
  await page.locator('.md-blk p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dos');
  await expect.poll(() => page.evaluate(() => editor.value)).toBe('Uno dos\n');
  await expect(page.locator('#editor')).toHaveValue('Uno dos\n');
});

test('vista dividida: clic en el editor no inserta marcas en la vista previa y resalta su bloque', async ({ page }) => {
  await load(page, 'Uno\n\nDos tres\n', 'split');
  await page.locator('#editor').click({ position: { x: 20, y: 90 } });
  await page.evaluate(() => editor.setSelectionRange(8, 8));
  await page.locator('#editor').click({ position: { x: 20, y: 90 } });
  expect(await page.locator('#preview mark').count()).toBe(0);
});

test('la barra lateral se ve en todas las vistas', async ({ page }) => {
  for (const v of ['split', 'editor', 'preview']) {
    await page.evaluate(v => setView(v), v);
    await expect(page.locator('#leftSidebar')).toBeVisible();
  }
});

test('barra lateral → título, negrita y lista actúan sobre la vista previa', async ({ page }) => {
  await load(page, 'Hola mundo\n', 'preview');
  await page.locator('.md-blk p').click();
  await page.keyboard.press('Home');
  await page.locator('.sb-group[data-group="Encabezados"]').hover();
  await page.locator('.sb-group[data-group="Encabezados"] .sb-fly-btn', { hasText: 'H2' }).click();
  await expect.poll(() => src(page)).toBe('## Hola mundo\n');

  // negrita sobre la palabra seleccionada (en un párrafo: en un título ya es negrita y alternaría a normal)
  await load(page, 'Hola mundo\n', 'preview');
  await page.evaluate(() => {
    const h = document.querySelector('.md-blk p'); const t = h.firstChild;
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 4);
    h.closest('.md-blk').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.locator('.sb-group[data-group="Formato"]').hover();
  await page.locator('.sb-group[data-group="Formato"] .sb-fly-btn', { hasText: 'Negrita' }).click();
  await expect.poll(() => src(page)).toBe('**Hola** mundo\n');

  // lista: se inserta como bloque nuevo después
  await page.locator('.sb-group[data-group="Listas"]').hover();
  await page.locator('.sb-group[data-group="Listas"] .sb-fly-btn', { hasText: 'Viñetas' }).click();
  await expect.poll(() => src(page)).toContain('\n\n- Elemento uno\n- Elemento dos');
  await expect(page.locator('#preview ul')).toHaveCount(1);
});

test('barra lateral: en vista dividida actúa sobre la superficie donde estaba el cursor', async ({ page }) => {
  await load(page, 'Texto\n', 'split');
  // cursor en el editor → la lista se inserta en el textarea
  await page.locator('#editor').click();
  await page.locator('.sb-group[data-group="Listas"]').hover();
  await page.locator('.sb-group[data-group="Listas"] .sb-fly-btn', { hasText: 'Numerada' }).click();
  await expect.poll(() => src(page)).toContain('1. Primero');
  // cursor en la vista previa → deshacer revierte la edición de la vista previa
  await page.locator('.md-blk p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' X');
  await expect.poll(() => src(page)).toContain('Texto X');
  await page.waitForTimeout(450);
  await page.locator('.sb-btn[data-tip^="Deshacer"]').click();
  await expect.poll(() => src(page)).not.toContain('Texto X');
});

test('barra lateral con documento vacío: el bloque se añade igualmente', async ({ page }) => {
  await load(page, '', 'preview');
  await page.locator('.sb-group[data-group="Insertar"]').hover();
  await page.locator('.sb-group[data-group="Insertar"] .sb-fly-btn', { hasText: 'Tabla' }).click();
  await expect.poll(() => src(page)).toContain('| Columna A |');
  await expect(page.locator('#preview table')).toHaveCount(1);
});

test('el botón «+» junto al bloque abre el menú de bloques e inserta debajo', async ({ page }) => {
  await load(page, 'Uno\n\nDos\n', 'preview');
  await page.locator('.md-blk').first().hover();
  await expect(page.locator('#blkPlus')).toBeVisible();
  await page.locator('#blkPlus').click();
  await expect(page.locator('#slashMenu')).toHaveClass(/show/);
  await page.locator('.slash-item', { hasText: 'Cita' }).click();
  await expect.poll(() => src(page)).toBe('Uno\n\n> Cita\n\nDos\n');
});
