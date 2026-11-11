import { test, expect } from './_setup.mjs';

// Capturas de referencia de las pantallas clave. Si un cambio de diseño es intencionado:
//   npx playwright test tests/visual.spec.mjs --update-snapshots
const DOC = `---
name: informe-mensual
description: Genera el informe mensual
---

# Informe mensual

Un párrafo con **negrita**, *cursiva*, \`código\` y un [enlace](https://example.com).

> [!TIP]
> Los avisos usan iconos y colores propios.

\`\`\`js
const total = items.reduce((a, b) => a + b, 0);
\`\`\`

| Mes | Total |
|:--|--:|
| Enero | 120 |
| Febrero | 98 |

- [x] Revisar datos
- [ ] Enviar informe
`;

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.evaluate(async d => {
    hideHome();
    editor.value = d; editor.dispatchEvent(new Event('input')); updatePreview();
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 500));
    document.querySelectorAll('.toast').forEach(t => t.classList.remove('show'));
  }, DOC);
});

const shot = (page, name, opts = {}) => expect(page).toHaveScreenshot(name + '.png', { animations: 'disabled', maxDiffPixelRatio: 0.015, ...opts });
const settle = page => page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });

for (const theme of ['dark', 'light']) {
  test(`vista dividida (${theme})`, async ({ page }) => {
    await page.evaluate(t => { setTheme(t); setView('split'); }, theme); await settle(page);
    await shot(page, `split-${theme}`);
  });
  test(`solo vista previa (${theme})`, async ({ page }) => {
    await page.evaluate(t => { setTheme(t); setView('preview'); }, theme); await settle(page);
    await shot(page, `preview-${theme}`);
  });
}

test('inicio', async ({ page }) => {
  await page.evaluate(() => showHome()); await settle(page);
  await shot(page, 'home');
});
test('paleta de comandos', async ({ page }) => {
  await page.evaluate(() => { setView('split'); openCmd(); }); await settle(page);
  await shot(page, 'palette');
});
test('exportar', async ({ page }) => {
  await page.evaluate(() => openExport()); await settle(page);
  await shot(page, 'export');
});
test('modo lectura', async ({ page }) => {
  await page.evaluate(() => toggleReader()); await settle(page);
  await shot(page, 'reader');
});
