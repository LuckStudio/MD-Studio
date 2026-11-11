import { test, expect } from './_setup.mjs';

// Edición directa en la vista previa: se escribe sobre el documento renderizado y solo
// cambia el trozo de Markdown del bloque tocado.
const DOC = '# Título\n\nPrimer párrafo.\n\n- uno\n- dos\n\n```js\nlet a = 1\n```\n\nÚltimo.\n';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
});
test.afterEach(() => { expect(errors).toEqual([]); });

const load = (page, md, view = 'preview') => page.evaluate(async ([md, view]) => {
  editor.value = md; editor.dispatchEvent(new Event('input'));
  setView(view); updatePreview();
  await new Promise(r => setTimeout(r, 200));
}, [md, view]);
const src = page => page.evaluate(() => editor.value);
// Selecciona una palabra dentro de un párrafo (como haría un doble clic)
const selectText = (page, word) => page.evaluate(w => {
  const p = [...document.querySelectorAll('.md-blk p')].find(x => x.textContent.includes(w));
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.nodeValue.indexOf(w);
    if (i >= 0) {
      p.closest('.md-blk').focus();
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return;
    }
  }
}, word);

test('la vista previa es editable en dividida y solo-previsualización, y no en solo-editor', async ({ page }) => {
  await load(page, DOC, 'split');
  await expect(page.locator('.md-blk[contenteditable="true"]')).toHaveCount(5);
  await page.evaluate(() => setView('preview'));
  await expect(page.locator('.md-blk[contenteditable="true"]')).toHaveCount(5);   // título, párrafo, lista, código, párrafo
  await page.evaluate(() => setView('editor'));
  await expect(page.locator('.md-blk[contenteditable="true"]')).toHaveCount(0);
  await page.evaluate(() => { setView('split'); togglePreviewEdit(); });         // bloquear
  await expect(page.locator('.md-blk[contenteditable="true"]')).toHaveCount(0);
});

test('escribir en un párrafo solo cambia ese trozo del Markdown', async ({ page }) => {
  await load(page, DOC);
  await page.locator('.md-blk p', { hasText: 'Primer' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Añadido.');
  await expect.poll(() => src(page)).toBe(DOC.replace('Primer párrafo.', 'Primer párrafo. Añadido.'));
  await expect(page.locator('#modifiedIndicator')).toBeVisible();
});

test('Enter divide el párrafo y edita títulos y listas', async ({ page }) => {
  await load(page, DOC);
  await page.locator('.md-blk p', { hasText: 'Primer' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nuevo');
  await expect.poll(() => src(page)).toContain('Primer párrafo.\n\nNuevo\n\n- uno');

  await page.locator('.md-blk h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect.poll(() => src(page)).toContain('# Título!\n');

  await page.locator('.md-blk li', { hasText: 'dos' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' y tres');
  await expect.poll(() => src(page)).toContain('- uno\n- dos y tres\n');
});

test('el código se edita como texto y Enter inserta salto de línea', async ({ page }) => {
  await load(page, DOC);
  await page.locator('.md-blk pre code').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('let b = 2');
  await expect.poll(() => src(page)).toContain('```js\nlet a = 1\nlet b = 2\n```');
});

test('la barra flotante aplica negrita y enlaces', async ({ page }) => {
  await load(page, DOC);
  await selectText(page, 'Primer');
  await expect(page.locator('#fmtBar')).toHaveClass(/show/);
  await page.locator('#fmtBar [data-fmt="bold"]').click();
  await expect.poll(() => src(page)).toContain('**Primer** párrafo.');

  await selectText(page, 'Último');
  await page.locator('#fmtBar [data-fmt="link"]').click();
  await page.locator('#fmtLink').fill('example.com');
  await page.locator('#fmtLink').press('Enter');
  await expect.poll(() => src(page)).toContain('[Último](https://example.com)');
});

test('atajos Markdown: "## " convierte el párrafo en título', async ({ page }) => {
  await load(page, 'Hola\n');
  await page.locator('.md-blk p').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('## ');
  await expect.poll(() => src(page)).toBe('## Hola\n');
});

test('Retroceso al inicio une con el párrafo anterior', async ({ page }) => {
  await load(page, 'Uno\n\nDos\n');
  await page.locator('.md-blk p', { hasText: 'Dos' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect.poll(() => src(page)).toBe('UnoDos\n');
  await page.keyboard.type('-');                       // el cursor queda en la unión
  await expect.poll(() => src(page)).toBe('Uno-Dos\n');
});

test('las casillas de tareas se pueden marcar', async ({ page }) => {
  await load(page, '- [ ] tarea\n- [x] hecha\n');
  await page.locator('input[type=checkbox]').first().click();
  await expect.poll(() => src(page)).toContain('[x] tarea');
});

test('bloques ilegibles (HTML en bruto, fórmulas, mermaid) quedan de solo lectura y no se tocan', async ({ page }) => {
  const doc = '<div class="x">html</div>\n\n$$a+b$$\n\n```mermaid\ngraph TD; A-->B;\n```\n\nTexto\n';
  await load(page, doc);
  await expect(page.locator('.md-blk[data-ro="1"]')).toHaveCount(3);
  await page.locator('.md-blk p', { hasText: 'Texto' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect.poll(() => src(page)).toBe(doc.replace('Texto', 'Texto!'));
});

test('guardar con Ctrl+S vuelca lo pendiente y al salir se repinta', async ({ page }) => {
  await load(page, DOC);
  await page.locator('.md-blk p', { hasText: 'Primer' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await page.evaluate(() => flushPreviewEdits());       // lo que hace saveFile antes de leer el texto
  expect(await src(page)).toContain('Primer párrafo.X');
  await page.locator('#home, body').first().click({ position: { x: 5, y: 5 } });
  await expect.poll(() => page.evaluate(() => S.previewEditing)).toBe(false);
});
