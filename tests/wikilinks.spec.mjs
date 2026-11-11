import { test, expect } from './_setup.mjs';

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
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
    await w('alicia.md', '# Alicia\n\nVer [[Bruno]], [[bruno|su ficha]] y [[Falta]].\n');
    await w('bruno.md', '# Bruno\n\nTexto.\n');
    await setWorkspace(new FsaDir(d));
    await S.wsIndex.ready;
    await openWorkspaceFile(['alicia.md']);
    setView('split');
    await new Promise(r => setTimeout(r, 300));
  });
});

test('los [[enlaces]] se pintan y los que no existen se marcan', async ({ page }) => {
  const links = page.locator('#preview a.wikilink');
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveText('Bruno');
  await expect(links.nth(1)).toHaveText('su ficha');
  await expect(links.nth(2)).toHaveClass(/wikilink-missing/);
  await expect(links.nth(0)).not.toHaveClass(/wikilink-missing/);
});

test('clic abre el archivo destino; uno que falta se crea tras confirmar', async ({ page }) => {
  await page.locator('#preview a.wikilink').first().click({ modifiers: ['Control'] });
  await expect(page.locator('#preview h1')).toHaveText('Bruno');
  await page.locator('.tab-main', { hasText: 'alicia' }).click();
  await page.locator('#preview a.wikilink').nth(2).click({ modifiers: ['Control'] });
  await expect.poll(() => page.evaluate(() => getActiveTab().name)).toBe('Falta');
  await expect(page.locator('.ft-row.file', { hasText: 'Falta.md' })).toHaveCount(1);
  expect(await page.evaluate(() => editor.value)).toBe('# Falta\n');
});

test('retroenlaces: la barra de estado cuenta y el diálogo abre el origen', async ({ page }) => {
  await page.locator('#preview a.wikilink').first().click({ modifiers: ['Control'] });          // ir a bruno
  await expect(page.locator('#backStatus')).toBeVisible();
  await expect(page.locator('#backStatus')).toContainText('1 enlace entrante');
  await page.locator('#backStatus').click();
  await expect(page.locator('#backOverlay')).toHaveClass(/open/);
  await page.locator('#backList .hist-item').click();
  await expect(page.locator('#preview h1')).toHaveText('Alicia');
});

test('en edición, un clic coloca el cursor y Ctrl+clic sigue el enlace; el Markdown se conserva', async ({ page }) => {
  await page.evaluate(() => setView('preview'));
  await page.waitForTimeout(250);
  await page.locator('#preview a.wikilink').first().click();
  expect(await page.evaluate(() => getActiveTab().name)).toBe('alicia');
  await page.locator('.md-blk p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Fin');
  await expect.poll(() => page.evaluate(() => editor.value)).toBe('# Alicia\n\nVer [[Bruno]], [[bruno|su ficha]] y [[Falta]]. Fin\n');
  await page.locator('#preview a.wikilink').first().click({ modifiers: ['Control'] });
  await expect.poll(() => page.evaluate(() => getActiveTab().name)).toBe('bruno');
});
