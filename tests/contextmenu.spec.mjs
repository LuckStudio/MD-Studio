import { test, expect } from './_setup.mjs';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const n of root.keys()) await root.removeEntry(n, { recursive: true });
  });
  await page.reload();
  await page.evaluate(() => hideHome());
});
const load = (page, md, view = 'preview') => page.evaluate(async ([md, view]) => {
  editor.value = md; editor.dispatchEvent(new Event('input')); setView(view); updatePreview();
  await new Promise(r => setTimeout(r, 250));
}, [md, view]);
const src = page => page.evaluate(() => editor.value);
const menu = page => page.locator('.ctx-menu').first();
const item = (page, name) => page.locator('.ctx-item', { hasText: name }).first();

test('vista previa: duplicar, subir, bajar y eliminar bloques', async ({ page }) => {
  await load(page, 'Uno\n\nDos\n\nTres\n');
  await page.locator('.md-blk p', { hasText: 'Dos' }).click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await item(page, 'Duplicar bloque').click();
  await expect.poll(() => src(page)).toBe('Uno\n\nDos\n\nDos\n\nTres\n');

  await page.locator('.md-blk p', { hasText: 'Tres' }).click({ button: 'right' });
  await item(page, 'Subir bloque').click();
  await expect.poll(() => src(page)).toBe('Uno\n\nDos\n\nTres\n\nDos\n');

  await page.locator('.md-blk p', { hasText: 'Uno' }).click({ button: 'right' });
  await item(page, 'Bajar bloque').click();
  await expect.poll(() => src(page)).toBe('Dos\n\nUno\n\nTres\n\nDos\n');

  await page.locator('.md-blk p', { hasText: 'Tres' }).click({ button: 'right' });
  await item(page, 'Eliminar bloque').click();
  await expect.poll(() => src(page)).toBe('Dos\n\nUno\n\nDos\n');
});

test('vista previa: convertir en título, lista de tareas y párrafo (submenú)', async ({ page }) => {
  await load(page, 'Hola\n');
  await page.locator('.md-blk p').click({ button: 'right' });
  await item(page, 'Convertir en').hover();
  await item(page, 'Título 2').click();
  await expect.poll(() => src(page)).toBe('## Hola\n');
  await page.locator('.md-blk h2').click({ button: 'right' });
  await item(page, 'Convertir en').hover();
  await item(page, 'Lista de tareas').click();
  await expect.poll(() => src(page)).toBe('- [ ] Hola\n');
  await page.locator('.md-blk li').click({ button: 'right' });
  await item(page, 'Convertir en').hover();
  await item(page, 'Párrafo').click();
  await expect.poll(() => src(page)).toBe('Hola\n');
});

test('vista previa: insertar debajo desde el submenú', async ({ page }) => {
  await load(page, 'Uno\n');
  await page.locator('.md-blk p').click({ button: 'right' });
  await item(page, 'Insertar debajo').hover();
  await item(page, 'Separador').click();
  await expect.poll(() => src(page)).toBe('Uno\n\n---\n');
});

test('tabla: menú de celda añade fila y alinea la columna', async ({ page }) => {
  await load(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await page.locator('#preview td').first().click({ button: 'right' });
  await item(page, 'Tabla').hover();
  await item(page, 'Insertar fila debajo').click();
  await expect(page.locator('#preview tbody tr')).toHaveCount(2);
  await page.locator('#preview td').first().click({ button: 'right' });
  await item(page, 'Tabla').hover();
  await item(page, 'Alinear columna').hover();
  await page.locator('.ctx-item', { hasText: /^A la derecha$/ }).click();
  await expect.poll(() => src(page)).toContain('--:');
});

test('pestañas: duplicar y cerrar las demás', async ({ page }) => {
  page.on('dialog', d => d.accept());   // las pestañas con cambios piden confirmar al cerrar
  await page.evaluate(() => { createTab('a', 'uno'); createTab('b', 'dos'); createTab('c', 'tres'); renderTabs(); });
  expect(await page.evaluate(() => S.tabs.length)).toBe(3);
  await page.locator('.tab-item').nth(1).click({ button: 'right' });
  await item(page, 'Duplicar pestaña').click();
  await expect.poll(() => page.evaluate(() => S.tabs.length)).toBe(4);
  await page.locator('.tab-item').first().click({ button: 'right' });
  await item(page, 'Cerrar las demás').click();
  await expect.poll(() => page.evaluate(() => S.tabs.length)).toBe(1);
});

test('editor de texto: copiar deshabilitado sin selección y seleccionar todo', async ({ page }) => {
  await load(page, 'Texto de prueba\n', 'editor');
  await page.locator('#editor').click({ button: 'right' });
  await expect(item(page, 'Copiar')).toHaveClass(/disabled/);
  await item(page, 'Seleccionar todo').click();
  await expect.poll(() => page.evaluate(() => editor.selectionEnd - editor.selectionStart)).toBe(16);
  await page.locator('#editor').click({ button: 'right' });
  await expect(item(page, 'Cortar')).not.toHaveClass(/disabled/);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('teclado: flechas, submenú con flecha derecha y Esc; Mayús+clic derecho deja el menú nativo', async ({ page }) => {
  await load(page, 'Uno\n');
  await page.locator('.md-blk p').click({ button: 'right', modifiers: ['Shift'] });
  await expect(menu(page)).toHaveCount(0);

  await page.locator('.md-blk p').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  // Con el menú abierto con ratón no hay elemento activo: la primera flecha abajo marca el primero
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ctx-menu')).toHaveCount(2);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.ctx-menu')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('resto de la aplicación: menú general', async ({ page }) => {
  await page.evaluate(() => { editor.value = 'algo'; editor.dispatchEvent(new Event('input')); });
  await page.locator('.statusbar').click({ button: 'right', position: { x: 400, y: 10 } });
  await expect(item(page, 'Paleta de comandos')).toBeVisible();
  await item(page, 'Nuevo documento').click();
  await expect.poll(() => page.evaluate(() => S.tabs.length)).toBe(2);
});

test('carpeta: crear un documento desde el menú del explorador', async ({ page }) => {
  page.on('dialog', d => d.accept('Plan'));
  await page.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('docs', { create: true });
    const f = await d.getFileHandle('a.md', { create: true }); const w = await f.createWritable(); await w.write('# A'); await w.close();
    await setWorkspace(new FsaDir(d));
  });
  await expect(page.locator('.ft-row.file')).toBeVisible();
  await page.waitForTimeout(400);   // termina la animación de apertura del panel
  await page.locator('#filesTree').click({ button: 'right', position: { x: 100, y: 200 } });
  await item(page, 'Nuevo documento aquí').click();
  await expect(page.locator('.ft-row.file', { hasText: 'Plan.md' })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => getActiveTab().name)).toBe('Plan');
});

test('accesibilidad del menú contextual abierto', async ({ page }) => {
  await load(page, 'Uno\n');
  await page.locator('.md-blk p').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await page.waitForTimeout(250);
  const r = await new AxeBuilder({ page }).include('.ctx-menu').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(' | '))).toEqual([]);
});
