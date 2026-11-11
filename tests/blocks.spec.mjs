import { test, expect } from './_setup.mjs';

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
const newLineAndSlash = async page => {
  await page.locator('.md-blk p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
};

test('"/" abre el menú y filtra; Enter inserta una tabla después del bloque', async ({ page }) => {
  await load(page, 'Hola\n');
  await newLineAndSlash(page);
  await expect(page.locator('#slashMenu')).toHaveClass(/show/);
  await expect(page.locator('.slash-item')).toHaveCount(14);
  await page.keyboard.type('tab');
  await expect(page.locator('.slash-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#slashMenu')).not.toHaveClass(/show/);
  await expect.poll(() => src(page)).toBe('Hola\n\n| Columna 1 | Columna 2 |\n| --- | --- |\n| Dato | Dato |\n');
  await expect(page.locator('#preview table')).toHaveCount(1);
});

test('Esc o un espacio cierran el menú sin insertar nada', async ({ page }) => {
  await load(page, 'Hola\n');
  await newLineAndSlash(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#slashMenu')).not.toHaveClass(/show/);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('/x ');
  await expect(page.locator('#slashMenu')).not.toHaveClass(/show/);
  expect(await src(page)).not.toContain('|');
});

test('lista de tareas y título: se insertan con el texto seleccionado para sobrescribir', async ({ page }) => {
  await load(page, 'Hola\n');
  await newLineAndSlash(page);
  await page.keyboard.type('tareas');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Comprar pan');                     // sobrescribe el marcador «Tarea»
  await expect.poll(() => src(page)).toBe('Hola\n\n- [ ] Comprar pan\n');
});

test('Mermaid: se inserta, abre el editor de código con vista previa y aplica con Ctrl+Enter', async ({ page }) => {
  await load(page, 'Hola\n');
  await newLineAndSlash(page);
  await page.keyboard.type('merm');
  await page.keyboard.press('Enter');
  await expect(page.locator('#srcOverlay')).toHaveClass(/open/);
  await expect(page.locator('#srcPreview svg')).toBeVisible({ timeout: 15000 });
  await page.locator('#srcText').fill('```mermaid\ngraph LR\n  X[Uno] --> Y[Dos]\n```');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#srcOverlay')).not.toHaveClass(/open/);
  await expect.poll(() => src(page)).toContain('X[Uno] --> Y[Dos]');
  await expect(page.locator('#preview .mermaid-block svg')).toBeVisible({ timeout: 15000 });
});

test('doble clic en un bloque de solo lectura abre su código; Esc cancela', async ({ page }) => {
  await load(page, '<div class="x">html raw</div>\n\nTexto\n');
  await page.locator('.md-blk[data-ro] .x').dblclick();
  await expect(page.locator('#srcOverlay')).toHaveClass(/open/);
  await expect(page.locator('#srcText')).toHaveValue('<div class="x">html raw</div>');
  await page.keyboard.press('Escape');
  await expect(page.locator('#srcOverlay')).not.toHaveClass(/open/);
  expect(await src(page)).toBe('<div class="x">html raw</div>\n\nTexto\n');
});

test('documento vacío: «Empezar a escribir» crea un primer bloque editable', async ({ page }) => {
  await load(page, '');
  await page.getByRole('button', { name: 'Empezar a escribir' }).click();
  await expect(page.locator('#preview h1')).toHaveText('Título');
  await page.keyboard.type('Mi plan');
  await expect.poll(() => src(page)).toContain('# Mi plan');
});
