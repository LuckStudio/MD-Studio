import { test, expect } from './_setup.mjs';
import { readFileSync } from 'node:fs';

// 1×1 PNG rojo
const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text() + ' @' + (m.location().url || '') + ':' + m.location().lineNumber); });
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const n of root.keys()) await root.removeEntry(n, { recursive: true });
  });
  await page.reload();
  await page.evaluate(() => hideHome());
});
test.afterEach(() => { expect(errors, 'errores de consola').toEqual([]); });

const setMd = (page, md) => page.evaluate(async md => {
  editor.value = md; editor.dispatchEvent(new Event('input'));
  updatePreview();
  await new Promise(r => setTimeout(r, 150));
}, md);

test('la pantalla de inicio se muestra y se cierra con Esc', async ({ page }) => {
  await page.evaluate(() => showHome());
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home').getByText('Abrir carpeta')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#home')).toBeHidden();
});

test('el marcado no tiene manejadores inline (CSP estricta)', () => {
  const html = readFileSync('app/index.html', 'utf8');
  expect(html.match(/\son[a-z]+="/g)).toBeNull();
  expect(html).toContain("script-src 'self'");
});

test('sanitiza HTML peligroso del Markdown', async ({ page }) => {
  await setMd(page, [
    '# Hola', '<script>window.__pwned=1</script>', '<img src="x" onerror="window.__pwned=2">',
    '[malo](javascript:window.__pwned=3)', '<a href="#" data-action="saveFile">trampa</a>', '<iframe src="https://example.com"></iframe>',
  ].join('\n\n'));
  const r = await page.evaluate(() => ({
    pwned: window.__pwned, scripts: preview.querySelectorAll('script').length, iframes: preview.querySelectorAll('iframe').length,
    onerror: !!preview.querySelector('[onerror]'), js: [...preview.querySelectorAll('a')].some(a => /^javascript:/i.test(a.getAttribute('href') || '')),
    action: !!preview.querySelector('[data-action]'),
  }));
  expect(r).toEqual({ pwned: undefined, scripts: 0, iframes: 0, onerror: false, js: false, action: false });
  // Edge avisa en consola cuando el analizador (inerte) ve un onerror=; el aviso es solo ruido, el
  // manejador nunca se ejecuta (pwned sigue undefined) y además la CSP lo bloquearía.
  errors.splice(0, errors.length, ...errors.filter(e => !/inline event handler/.test(e)));
});

test('resalta código, añade botón de copiar y callouts', async ({ page }) => {
  await setMd(page, '```js\nconst x = 1; // hola\n```\n\n> [!WARNING]\n> Cuidado con esto\n\n- [ ] tarea');
  await expect(page.locator('#preview pre .hljs-keyword').first()).toBeVisible();
  await expect(page.locator('#preview pre .code-copy')).toHaveCount(1);
  await expect(page.locator('#preview blockquote.callout-warning .callout-title')).toContainText('Aviso');
  await expect(page.locator('#preview input[type=checkbox]')).toHaveCount(1);
});

test('muestra el front matter como ficha', async ({ page }) => {
  await setMd(page, '---\nname: mi-skill\ndescription: Hace cosas\ntags: [a, b]\n---\n\n# Título');
  await expect(page.locator('#preview .frontmatter')).toContainText('mi-skill');
  await expect(page.locator('#preview .frontmatter .fm-chip')).toHaveCount(2);
  await expect(page.locator('#preview h1')).toHaveText('Título');
});

test('renderiza fórmulas con KaTeX y diagramas con Mermaid', async ({ page }) => {
  await setMd(page, 'Euler: $e^{i\\pi}+1=0$ y cuesta $5 y $10.\n\n$$\\int_0^1 x\\,dx$$\n\n```mermaid\ngraph TD; A-->B;\n```');
  await expect(page.locator('#preview .katex').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#preview .math-block .katex')).toHaveCount(1);
  await expect(page.locator('#preview .mermaid-block svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#preview p').first()).toContainText('cuesta $5 y $10');
});

test('carpeta de trabajo: árbol, imágenes relativas y enlaces entre archivos', async ({ page }) => {
  await page.evaluate(async png => {
    const root = await navigator.storage.getDirectory();
    const docs = await root.getDirectoryHandle('docs', { create: true });
    const img = await docs.getDirectoryHandle('img', { create: true });
    const w = async (dir, name, data) => { const f = await dir.getFileHandle(name, { create: true }); const s = await f.createWritable(); await s.write(data); await s.close(); };
    await w(img, 'p.png', new Uint8Array(png));
    await w(docs, 'a.md', '# Archivo A\n\n![pixel](img/p.png)\n\n[ir a B](b.md#destino)\n');
    await w(docs, 'b.md', '# Archivo B\n\n## Destino\n\ntexto');
    await setWorkspace(new FsaDir(docs));
  }, PNG);

  await expect(page.locator('#filesPanel')).toHaveClass(/open/);
  await expect(page.locator('.ft-row.file')).toHaveCount(2);
  await page.locator('.ft-row.file', { hasText: 'a.md' }).click();
  await expect(page.locator('#preview h1')).toHaveText('Archivo A');

  const img = page.locator('#preview img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  expect(await img.evaluate(i => i.naturalWidth)).toBe(1);

  await page.locator('#preview a', { hasText: 'ir a B' }).click({ modifiers: ['Control'] });
  await expect(page.locator('#preview h1')).toHaveText('Archivo B');
  expect(await page.evaluate(() => S.tabs.map(t => t.name))).toEqual(['a', 'b']);

  // búsqueda en contenido
  await page.locator('#filesFilter').fill('destino');
  await page.locator('#filesFilter').press('Enter');
  await expect(page.locator('.ft-hit').first()).toContainText('b.md');
});

test('guardar escribe en el archivo y detecta cambios externos', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('nota.md', { create: true });
    const s = await fh.createWritable(); await s.write('uno'); await s.close();
    await openRefs([new FsaFile(fh)]);
  });
  // edición local + guardar
  await setMd(page, 'dos');
  await page.evaluate(() => saveFile());
  await expect.poll(() => page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('nota.md')).getFile()).text())).toBe('dos');
  await expect(page.locator('#modifiedIndicator')).toBeHidden();

  // cambio externo sin cambios locales → recarga sola
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('nota.md');
    const s = await fh.createWritable(); await s.write('# externo'); await s.close();
    await checkExternalChanges();
  });
  await expect(page.locator('#preview h1')).toHaveText('externo');

  // cambio externo CON cambios locales → barra de conflicto
  await setMd(page, '# mío');
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('nota.md');
    const s = await fh.createWritable(); await s.write('# otro cambio'); await s.close();
    await checkExternalChanges();
  });
  await expect(page.locator('#conflictBar')).toBeVisible();
  await page.getByRole('button', { name: 'Recargar del disco' }).click();
  await expect(page.locator('#preview h1')).toHaveText('otro cambio');
  await expect(page.locator('#conflictBar')).toBeHidden();
});

test('el archivo de cada pestaña sobrevive a una recarga', async ({ page }) => {
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('persiste.md', { create: true });
    const s = await fh.createWritable(); await s.write('# Persiste'); await s.close();
    await openRefs([new FsaFile(fh)]);
    await persistTabRefs();
    saveToLS();
  });
  await page.reload();
  await page.evaluate(() => hideHome());
  const r = await page.evaluate(() => ({ name: getActiveTab().name, file: getActiveTab().file?.name }));
  expect(r).toEqual({ name: 'persiste', file: 'persiste.md' });
});

test('vista de diferencias', async ({ page }) => {
  await page.evaluate(() => { const t = getActiveTab(); t.savedContent = 'a\nb\nc'; });
  await setMd(page, 'a\nB\nc\nd');
  await page.evaluate(() => showDiff());
  await expect(page.locator('#diffSummary .df-add')).toHaveText('+2');
  await expect(page.locator('#diffSummary .df-del')).toHaveText('−1');
  await expect(page.locator('.df-line.add')).toHaveCount(2);
});

test('valida archivos de Claude', async ({ page }) => {
  await page.evaluate(() => { const t = getActiveTab(); t.name = 'SKILL'; });
  await setMd(page, '---\nname: Mala_Skill\n---\n\n# x');
  await expect(page.locator('#claudeStatus')).toContainText('error');
  await page.locator('#claudeStatus').click();
  await expect(page.locator('#claudeBody')).toContainText('"name" debe ir en minúsculas');
  await expect(page.locator('#claudeBody')).toContainText('Falta el campo "description"');
  await page.keyboard.press('Escape');
  await setMd(page, '---\nname: buena-skill\ndescription: Úsala cuando el usuario pida crear informes mensuales en PDF.\n---\n\n# x');
  await expect(page.locator('#claudeStatus')).toContainText('válido');
});

test('plantillas de Claude y modo lectura', async ({ page }) => {
  await page.evaluate(() => newFromTemplate('agent'));
  await expect(page.locator('#preview .frontmatter')).toContainText('revisor-de-codigo');
  await page.evaluate(() => toggleReader());
  await expect(page.locator('body')).toHaveClass(/reader/);
  await expect(page.locator('#readerTime')).toContainText('min');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/reader/);
});

test('exportar HTML incrusta estilos y resaltado', async ({ page }) => {
  await setMd(page, '# T\n\n```js\nlet a = 1\n```');
  const html = await page.evaluate(() => buildExportHTML());
  expect(html).toContain('<style>');
  expect(html).toContain('hljs-keyword');
  expect(html).not.toContain('code-copy');
});
