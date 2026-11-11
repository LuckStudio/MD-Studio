import { test, expect } from './_setup.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Abierto con doble clic (file://) los módulos ES se bloquean: debe verse un aviso claro, no botones muertos
test('app/index.html abierto como archivo muestra el aviso con instrucciones', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('app/index.html')).href);
  const warn = page.locator('.boot-warning');
  await expect(warn).toBeVisible({ timeout: 6000 });
  await expect(warn).toContainText('claude-md-editor.html');
  await expect(warn).toContainText('Iniciar.cmd');
});

test('con servidor el aviso no aparece', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2200);
  await expect(page.locator('.boot-warning')).toHaveCount(0);
});
