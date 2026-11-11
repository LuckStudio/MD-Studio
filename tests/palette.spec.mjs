import { test, expect } from './_setup.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const n of root.keys()) await root.removeEntry(n, { recursive: true });
  });
  await page.reload();
  await page.evaluate(async () => {
    hideHome();
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle('notas', { create: true });
    const w = async (n, t) => { const f = await d.getFileHandle(n, { create: true }); const s = await f.createWritable(); await s.write(t); await s.close(); };
    await w('alicia.md', '# Alicia\n\nVer [[Bruno]] y [rutas](carlos.md).\n');
    await w('bruno.md', '# Bruno el grande\n\nTexto.\n');
    await w('carlos.md', '# Carlos\n\nNada.\n');
    await setWorkspace(new FsaDir(d));
    await S.wsIndex.ready;
    editor.value = '# Uno\n\ntexto\n\n## Dos\n\nmás\n\n## Tres\n'; editor.dispatchEvent(new Event('input')); updatePreview();
  });
});

const open = async page => { await page.keyboard.press('Control+k'); await expect(page.locator('#cmdOverlay')).toHaveClass(/open/); };

test('el índice de la carpeta conoce títulos y enlaces', async ({ page }) => {
  const r = await page.evaluate(() => ({
    files: wsFileList().map(f => f.path).sort(),
    titles: wsFileList().find(f => f.name === 'bruno').title,
    wiki: findWikiTarget('BRUNO').path,
    backlinks: backlinksFor(['bruno.md']).map(f => f.path).concat(backlinksFor(['carlos.md']).map(f => f.path)),
  }));
  expect(r).toEqual({ files: ['alicia.md', 'bruno.md', 'carlos.md'], titles: 'Bruno el grande', wiki: 'bruno.md', backlinks: ['alicia.md', 'alicia.md'] });
});

test('@ busca archivos (difuso) y Enter los abre', async ({ page }) => {
  await open(page);
  await page.locator('#cmdInput').fill('@brg');                       // b-r-g de "bruno el grande"? coincide con bruno.md por b,r,… g no: usa el título
  await page.locator('#cmdInput').fill('@bru');
  await expect(page.locator('.cmd-item').first()).toContainText('bruno.md');
  await page.keyboard.press('Enter');
  await expect(page.locator('#preview h1')).toHaveText('Bruno el grande');
});

test('# lista los títulos del documento y salta a ellos', async ({ page }) => {
  await open(page);
  await page.locator('#cmdInput').fill('#');
  await expect(page.locator('.cmd-item')).toHaveCount(3);
  await page.locator('#cmdInput').fill('#tres');
  await expect(page.locator('.cmd-item')).toHaveCount(1);
  await expect(page.locator('.cmd-item mark').first()).toBeVisible();
});

test('búsqueda difusa de comandos y modo línea', async ({ page }) => {
  await open(page);
  await page.locator('#cmdInput').fill('gdr');
  await expect(page.locator('.cmd-item').first()).toContainText(/Guardar/);
  await page.locator('#cmdInput').fill(':5');
  await expect(page.locator('.cmd-item')).toContainText('Línea 5');
  await page.keyboard.press('Escape');
  await expect(page.locator('#cmdOverlay')).not.toHaveClass(/open/);
});

test('sin texto muestra pestañas, recientes y comandos agrupados', async ({ page }) => {
  await page.evaluate(() => newTab());
  await open(page);
  await expect(page.locator('.cmd-group-label').first()).toBeVisible();
  const input = page.locator('#cmdInput');
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-activedescendant', /cmd-opt-0/);
});
