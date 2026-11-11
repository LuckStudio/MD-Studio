import { test, expect } from './_setup.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const n of root.keys()) await root.removeEntry(n, { recursive: true });
    indexedDB.deleteDatabase('claudemd');
  });
  await page.reload();
  await page.evaluate(() => hideHome());
});

const setText = (page, t) => page.evaluate(t => { editor.value = t; editor.dispatchEvent(new Event('input')); }, t);

test('cada guardado crea una versión; se comparan y se restauran', async ({ page }) => {
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('doc.md', { create: true });
    await openRefs([new FsaFile(fh)]);
  });
  for (const t of ['# Uno\n', '# Uno\n\nDos\n', '# Uno\n\nDos\n\nTres\n']) {
    await setText(page, t);
    await page.evaluate(() => saveFile());
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => saveFile());                        // sin cambios: no duplica
  await page.waitForTimeout(150);
  await setText(page, '# Uno\n\nDos\n\nTres\n\nCuatro\n');       // texto actual, sin guardar

  await page.getByRole('menuitem', { name: /Historial/ }).count();   // (el menú existe)
  await page.evaluate(() => openHistory());
  await expect(page.locator('#histOverlay')).toHaveClass(/open/);
  await expect(page.locator('.hist-item')).toHaveCount(3);
  await expect(page.locator('.hist-item').first()).toContainText('guardado');
  // la más antigua frente al texto actual: +6 líneas… se comprueba que hay diff y se restaura
  await page.locator('.hist-item').last().click();
  await expect(page.locator('#histSummary .df-add')).not.toHaveText('+0');
  await expect(page.locator('#histDiff .df-line.add').first()).toBeVisible();
  await page.locator('#histRestore').click();
  await expect(page.locator('#histOverlay')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => editor.value)).toBe('# Uno\n');
  // restaurar también guardó el texto que había (antes de restaurar) y se puede deshacer
  const reasons = await page.evaluate(async () => (await listVersions(docKey(getActiveTab()))).map(v => v.reason));
  expect(reasons).toContain('antes de restaurar');
  await page.evaluate(() => undo());
  expect(await page.evaluate(() => editor.value)).toBe('# Uno\n\nDos\n\nTres\n\nCuatro\n');
});

test('sin versiones muestra un mensaje; Esc cierra y el límite se respeta', async ({ page }) => {
  await page.evaluate(() => openHistory());
  await expect(page.locator('#histDiff')).toContainText('Aún no hay versiones');
  await page.keyboard.press('Escape');
  await expect(page.locator('#histOverlay')).not.toHaveClass(/open/);
  await page.evaluate(async () => {
    const tab = getActiveTab();
    for (let i = 0; i < VERSIONS_MAX + 5; i++) { editor.value = 'v' + i; await snapshotVersion(tab, 'prueba'); }
  });
  expect(await page.evaluate(async () => (await listVersions(docKey(getActiveTab()))).length)).toBe(60);
});
