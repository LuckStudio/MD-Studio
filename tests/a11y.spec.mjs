import { test, expect } from './_setup.mjs';
import AxeBuilder from '@axe-core/playwright';

// Accesibilidad (WCAG 2.1 A/AA) en las pantallas principales, en tema oscuro y claro
const DOC = '---\nname: demo\ndescription: Documento de prueba\n---\n\n# Título\n\nUn párrafo con [un enlace](https://example.com) y `código`.\n\n> [!NOTE]\n> Aviso\n\n```js\nlet a = 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] tarea\n';

async function audit(page, name) {
  await page.waitForTimeout(450);   // deja terminar las animaciones de entrada
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const msg = r.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  expect(msg, `Violaciones en «${name}»`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => hideHome());
  await page.evaluate(async d => { editor.value = d; editor.dispatchEvent(new Event('input')); updatePreview(); await new Promise(r => setTimeout(r, 400)); }, DOC);
});

for (const theme of ['dark', 'light']) {
  test.describe(`tema ${theme}`, () => {
    test.beforeEach(async ({ page }) => { await page.evaluate(t => setTheme(t), theme); });

    test('inicio', async ({ page }) => { await page.evaluate(() => showHome()); await audit(page, 'inicio'); });
    test('vista dividida', async ({ page }) => { await page.evaluate(() => setView('split')); await audit(page, 'dividida'); });
    test('solo vista previa (edición)', async ({ page }) => { await page.evaluate(() => setView('preview')); await audit(page, 'preview'); });
    test('menú abierto', async ({ page }) => { await page.evaluate(() => toggleMenu('archivo')); await audit(page, 'menú'); });
    test('apariencia', async ({ page }) => { await page.evaluate(() => openSettings()); await audit(page, 'apariencia'); });
    test('paleta de comandos', async ({ page }) => { await page.evaluate(() => openCmd()); await audit(page, 'paleta'); });
    test('historial', async ({ page }) => { await page.evaluate(async () => { const t = getActiveTab(); await snapshotVersion(t, 'prueba'); editor.value += 'x'; await openHistory(); }); await audit(page, 'historial'); });
    test('exportar', async ({ page }) => { await page.evaluate(() => openExport()); await audit(page, 'exportar'); });
    test('enlaces entrantes', async ({ page }) => { await page.evaluate(() => { document.getElementById('backOverlay').classList.add('open'); showBacklinks(); }); await audit(page, 'retroenlaces'); });
    test('editor de código de bloque', async ({ page }) => { await page.evaluate(() => { setView('preview'); }); await page.waitForTimeout(300); await page.evaluate(() => { const b = document.querySelector('.md-blk'); openSourceEditor(b); }); await audit(page, 'código'); });
    test('menú / y barras flotantes', async ({ page }) => {
      await page.evaluate(() => setView('preview'));
      await page.waitForTimeout(300);
      await page.locator('.md-blk p').first().click();
      await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('/');
      await expect(page.locator('#slashMenu')).toHaveClass(/show/);
      await audit(page, 'menú /');
      await page.keyboard.press('Escape');
      await page.locator('#preview td').first().click();
      await expect(page.locator('#tblBar')).toHaveClass(/show/);
      await audit(page, 'barra de tabla');
    });
    test('cambios', async ({ page }) => { await page.evaluate(() => { getActiveTab().savedContent = 'otro'; showDiff(); }); await audit(page, 'cambios'); });
  });
}

test('teclado: menú con flechas, Esc cierra diálogo y devuelve el foco', async ({ page }) => {
  await page.getByRole('button', { name: 'Archivo', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Archivo', exact: true })).toBeFocused();

  const trigger = page.getByRole('button', { name: 'Apariencia', exact: true }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settingsDrawer')).toHaveClass(/open/);
  await expect(page.locator('#settingsDrawer :focus')).toHaveCount(1);       // el foco entra en el diálogo
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsDrawer')).not.toHaveClass(/open/);
  await expect(trigger).toBeFocused();
});
