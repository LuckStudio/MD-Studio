// Genera las capturas del README en docs/screenshots/ (npm run screenshots). Necesita Edge/Chrome instalado.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const OUT = 'docs/screenshots';
const PORT = 8797;
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

\`\`\`mermaid
graph LR
  A[Escribir] --> B[Previsualizar] --> C[Exportar]
\`\`\`

Fórmula: $E = mc^2$

- [x] Revisar datos
- [ ] Enviar informe
`;

await mkdir(OUT, { recursive: true });
const server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__EXPOSE_APP__ = true; window.__NO_SPLASH__ = true; });
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const settle = () => page.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 700)); document.querySelectorAll('.toast').forEach(t => t.classList.remove('show')); });
  const shot = async n => { await settle(); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n); };

  await shot('home');
  await page.evaluate(d => { hideHome(); editor.value = d; editor.dispatchEvent(new Event('input')); updatePreview(); }, DOC);
  for (const t of ['dark', 'light']) { await page.evaluate(t => { setTheme(t); setView('split'); }, t); await shot(`split-${t}`); }
  await page.evaluate(() => { setTheme('dark'); setView('split'); openCmd(); }); await shot('palette');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { setTheme('light'); openExport(); }); await shot('export');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { setTheme('dark'); setView('preview'); toggleReader(); }); await shot('reader');

  // Capturas del manifest (diálogo de instalación PWA): app/screenshots/
  await mkdir('app/screenshots', { recursive: true });
  await page.evaluate(() => { toggleReader(); setTheme('dark'); setView('split'); });
  await settle(); await page.screenshot({ path: 'app/screenshots/wide.png' });
  await page.setViewportSize({ width: 540, height: 960 });
  await page.evaluate(() => { setView('preview'); }); await settle();
  await page.screenshot({ path: 'app/screenshots/narrow.png' });
} finally { await browser.close(); server.kill(); }
