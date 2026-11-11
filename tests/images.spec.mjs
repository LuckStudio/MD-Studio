import { test, expect } from './_setup.mjs';

const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];

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

const paste = (page, selector, name) => page.evaluate(([png, selector, name]) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(png)], name, { type: 'image/png' }));
  document.querySelector(selector).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, [PNG, selector, name]);

async function openDoc(page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle('docs', { create: true });
    const f = await d.getFileHandle('nota.md', { create: true });
    const w = await f.createWritable(); await w.write('Hola\n'); await w.close();
    await setWorkspace(new FsaDir(d));
    await openWorkspaceFile(['nota.md']);
    setView('preview');
    await new Promise(r => setTimeout(r, 300));
  });
}
const assets = page => page.evaluate(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('docs');
  try { const a = await d.getDirectoryHandle('assets'); const out = []; for await (const k of a.keys()) out.push(k); return out.sort(); } catch (e) { return null; }
});

test('pegar una imagen en la vista previa la guarda en assets/ y enlaza la ruta relativa', async ({ page }) => {
  await openDoc(page);
  await page.locator('.md-blk p').first().click();
  await paste(page, '.md-blk p', 'diagrama.png');
  await expect.poll(() => assets(page)).toEqual(['diagrama.png']);
  await expect.poll(() => page.evaluate(() => editor.value)).toBe('Hola\n\n![diagrama](assets/diagrama.png)\n');
  const img = page.locator('#preview img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  expect(await img.evaluate(i => i.complete && i.naturalWidth)).toBe(1);
  // segunda con el mismo nombre: no se pisa
  await page.locator('.md-blk p').first().click();
  await paste(page, '.md-blk p', 'diagrama.png');
  await expect.poll(() => assets(page)).toEqual(['diagrama-1.png', 'diagrama.png']);
});

test('pegar en el editor de texto inserta el Markdown en el cursor', async ({ page }) => {
  await openDoc(page);
  await page.evaluate(() => setView('editor'));
  await page.locator('#editor').focus();
  await paste(page, '#editor', 'foto.png');
  await expect.poll(() => page.evaluate(() => editor.value)).toContain('![foto](assets/foto.png)');
  await expect.poll(() => assets(page)).toEqual(['foto.png']);
});

test('sin carpeta, una imagen pequeña se incrusta como data: URI', async ({ page }) => {
  await page.evaluate(async () => { editor.value = 'Hola\n'; editor.dispatchEvent(new Event('input')); setView('preview'); updatePreview(); await new Promise(r => setTimeout(r, 250)); });
  await page.locator('.md-blk p').first().click();
  await paste(page, '.md-blk p', 'x.png');
  await expect.poll(() => page.evaluate(() => editor.value)).toMatch(/!\[x\]\(data:image\/png;base64,/);
  await expect(page.locator('#preview img')).toHaveCount(1);
});
