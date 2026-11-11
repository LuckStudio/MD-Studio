import { test, expect } from './_setup.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
});

const longDoc = n => {
  let md = '';
  for (let i = 0; i < n; i++) md += `## Sección ${i}\n\nPárrafo de **prueba** ${i} con \`código\` y un [enlace](https://example.com/${i}).\n\n- uno\n- dos\n\n\`\`\`js\nconst x${i} = ${i};\n\`\`\`\n\n`;
  return md;
};

test('documento largo (4000 bloques): primer pintado y repintado al teclear dentro de presupuesto', async ({ page }) => {
  const r = await page.evaluate(async md => {
    editor.value = md;
    let t = performance.now(); updatePreview(); const first = performance.now() - t;
    await new Promise(r => setTimeout(r, 200));
    const times = [];
    for (let k = 0; k < 4; k++) { editor.value = 'x' + editor.value.slice(1); t = performance.now(); renderHeavy(); times.push(performance.now() - t); await new Promise(r => setTimeout(r, 30)); }
    return { first, rerender: Math.max(...times), blocks: document.querySelectorAll('.md-blk').length };
  }, longDoc(1000));
  expect(r.blocks).toBe(4000);
  expect(r.first).toBeLessThan(3500);        // medido ≈ 650 ms en esta máquina
  expect(r.rerender).toBeLessThan(500);      // medido ≈ 80 ms: antes del pintado incremental, ≈ 420 ms
});

test('el repintado reutiliza los bloques que no cambian (conservan diagramas y fórmulas dibujados)', async ({ page }) => {
  await page.evaluate(async () => {
    editor.value = 'Uno\n\n```mermaid\ngraph LR; A-->B;\n```\n\nFórmula $x^2$\n\nFin\n';
    updatePreview();
    await new Promise(r => setTimeout(r, 600));
  });
  await expect(page.locator('#preview .mermaid-block svg')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { window.__svg = document.querySelector('#preview .mermaid-block svg'); window.__katex = document.querySelector('#preview .katex'); });
  await page.evaluate(async () => { editor.value = editor.value.replace('Uno', 'Uno editado'); S.previewEditing = false; renderHeavy(); await new Promise(r => setTimeout(r, 200)); });
  const same = await page.evaluate(() => ({
    svg: document.querySelector('#preview .mermaid-block svg') === window.__svg,
    katex: document.querySelector('#preview .katex') === window.__katex,
    text: document.querySelector('#preview p').textContent,
  }));
  expect(same).toEqual({ svg: true, katex: true, text: 'Uno editado' });
});

test('deshacer una edición de la vista previa no reutiliza el DOM editado', async ({ page }) => {
  await page.evaluate(async () => { editor.value = 'Uno\n'; setView('preview'); updatePreview(); await new Promise(r => setTimeout(r, 250)); });
  await page.locator('.md-blk p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dos');
  await expect.poll(() => page.evaluate(() => editor.value)).toBe('Uno dos\n');
  await page.waitForTimeout(450);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => editor.value)).toBe('Uno\n');
  await expect(page.locator('#preview p')).toHaveText('Uno');
});

test('arranque sin saltos de maquetación (CLS < 0.02)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.02);
});
