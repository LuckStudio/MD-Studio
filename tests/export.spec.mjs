import { test, expect } from './_setup.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DOC = `---
name: informe
---

# Título principal

Párrafo con **negrita**, *cursiva*, ~~tachado~~, \`código\` y un [enlace](https://example.com). Fórmula $x^2$.

> [!NOTE]
> Aviso con **texto**

1. Primero
2. Segundo
   - sub A
   - sub B
3. Tercero

- [ ] tarea
- [x] hecha

| A | B |
|:--|--:|
| 1 | 2 |

\`\`\`js
let a = 1;
\`\`\`

![pixel](data:image/png;base64,${PNG})

\`\`\`mermaid
graph LR; A-->B;
\`\`\`
`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
});

test('Word: el .docx es un zip válido con todas las partes bien formadas y el contenido', async ({ page }) => {
  const r = await page.evaluate(async doc => {
    editor.value = doc; editor.dispatchEvent(new Event('input')); updatePreview();
    await new Promise(r => setTimeout(r, 300));
    const bytes = await buildDocx(await renderExportRoot(), 'informe');
    const files = fflate.unzipSync(bytes);
    const out = { names: Object.keys(files).sort(), bad: [], text: {} };
    for (const [n, data] of Object.entries(files)) {
      if (!/\.(xml|rels)$/.test(n)) continue;
      const xml = new TextDecoder().decode(data);
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      if (d.querySelector('parsererror')) out.bad.push(n);
      out.text[n] = xml;
    }
    const d = out.text['word/document.xml'];
    out.has = {
      h1: /<w:pStyle w:val="Heading1"\/>/.test(d), bold: /<w:b\/>[\s\S]*?negrita/.test(d), italic: /<w:i\/>[\s\S]*?cursiva/.test(d),
      strike: /<w:strike\/>/.test(d), link: /<w:hyperlink r:id="rId\d+">/.test(d), table: /<w:tbl>/.test(d) && /<w:jc w:val="right"\/>/.test(d),
      code: /w:val="Code"/.test(d), quote: /w:val="Quote"/.test(d), nested: /<w:ilvl w:val="1"\/>/.test(d), checkbox: d.includes('☐') && d.includes('☑'),
      drawings: (d.match(/<w:drawing>/g) || []).length, math: d.includes('$x^2$'),
    };
    out.rels = out.text['word/_rels/document.xml.rels'];
    out.media = out.names.filter(n => n.startsWith('word/media/'));
    delete out.text;
    return out;
  }, DOC);
  expect(r.bad).toEqual([]);
  expect(r.names).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']));
  expect(r.has).toMatchObject({ h1: true, bold: true, italic: true, strike: true, link: true, table: true, code: true, quote: true, nested: true, checkbox: true, math: true });
  expect(r.has.drawings).toBe(2);                         // la imagen y el diagrama Mermaid rasterizado
  expect(r.media.length).toBe(2);
  expect(r.rels).toContain('https://example.com');
});

test('enlace para compartir: ida y vuelta con tildes y al abrirlo crea la pestaña', async ({ page }) => {
  const text = '# Árbol ñandú ✓\n\nTexto largo '.concat('lorem ipsum '.repeat(200));
  const link = await page.evaluate(async t => buildShareLink(t), text);
  expect(link).toContain('#share=');
  expect(link.length).toBeLessThan(text.length);          // va comprimido
  expect(await page.evaluate(async l => readShareHash(l.slice(l.indexOf('#'))), link)).toBe(text);
  await page.goto(link);
  await expect.poll(() => page.evaluate(() => getActiveTab().name)).toBe('compartido');
  expect(await page.evaluate(() => editor.value)).toBe(text);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await expect(page.locator('#home')).toBeHidden();
});

test('diálogo Exportar: formatos, opciones de página y persistencia', async ({ page }) => {
  await page.evaluate(() => openExport());
  await expect(page.locator('#exportOverlay')).toHaveClass(/open/);
  await expect(page.locator('.ex-format')).toHaveCount(6);
  await expect(page.locator('#exOptions')).toBeVisible();
  await page.getByRole('radio', { name: /Word/ }).click();
  await expect(page.locator('#exOptions')).toBeHidden();
  await expect(page.locator('#exDesc')).toContainText('estilos de Word');
  await page.getByRole('radio', { name: /PDF/ }).click();
  await page.locator('#exPaper').selectOption('Letter');
  await page.locator('#exMargin').selectOption('wide');
  await page.locator('#exNumbers').uncheck();
  await page.getByRole('radio', { name: /Enlace/ }).click();
  await expect(page.locator('#exRun')).toHaveText('Copiar enlace');
  await page.getByRole('radio', { name: /Markdown/ }).click();
  await page.evaluate(() => { saveExportOpts(readExportForm()); });
  const html = await page.evaluate(async () => { editor.value = '# Hola'; return buildExportHTML(); });
  expect(html).toContain('size:Letter');
  expect(html).toContain('margin:28mm');
  expect(html).not.toContain('counter(page)');
  await page.keyboard.press('Escape');
  await expect(page.locator('#exportOverlay')).not.toHaveClass(/open/);
});

test('el HTML exportado incluye los diagramas Mermaid ya dibujados y las fórmulas con KaTeX', async ({ page }) => {
  const html = await page.evaluate(async () => {
    editor.value = '```mermaid\ngraph LR; A-->B;\n```\n\nFórmula $x^2$\n';
    return buildExportHTML();
  });
  expect(html).toContain('<svg');
  expect(html).not.toContain('mermaid-src');
  expect(html).toContain('class="katex"');
});
