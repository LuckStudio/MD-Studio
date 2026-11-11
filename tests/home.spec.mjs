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
});

test('los recientes se muestran como tarjetas con título y extracto', async ({ page }) => {
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('plan.md', { create: true });
    const w = await fh.createWritable();
    await w.write('---\ntitle: x\n---\n\n# Plan de lanzamiento\n\nPrimero **definimos** el alcance y después [medimos](http://x.com) los resultados.\n');
    await w.close();
    await openRefs([new FsaFile(fh)]);
    await new Promise(r => setTimeout(r, 300));
    showHome();
  });
  const card = page.locator('.home-rcard.file');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.rc-title')).toHaveText('Plan de lanzamiento');
  await expect(card.locator('.rc-excerpt')).toContainText('Primero definimos el alcance y después medimos');
  await expect(card.locator('.rc-foot')).toHaveText('plan.md');
  // Quitar de recientes
  await page.locator('.home-rcard-wrap .rc-del').first().click();
  await expect(page.locator('.home-rcard')).toHaveCount(0);
  await expect(page.locator('#homeRecentsEmpty')).toBeVisible();
});

test('recorrido guiado: 4 pasos, teclado y se marca como visto', async ({ page }) => {
  await expect(page.locator('#homeTour')).toBeVisible();
  await page.locator('#homeTour').getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.tour-pop')).toBeVisible();
  await expect(page.locator('.tour-pop h3')).toHaveText('Tres formas de ver el documento');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour-pop h3')).toHaveText('Haz clic y escribe');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.locator('.tour-pop .tour-step')).toHaveText('Paso 4 de 4');
  await page.getByRole('button', { name: 'Terminar' }).click();
  await expect(page.locator('.tour-pop')).toHaveCount(0);
  await page.evaluate(() => showHome());
  await expect(page.locator('#homeTour')).toBeHidden();
});

test('Esc cierra el recorrido en cualquier paso', async ({ page }) => {
  await page.evaluate(() => startTour());
  await expect(page.locator('.tour-pop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour-pop')).toHaveCount(0);
  await expect(page.locator('.tour-spot')).toHaveCount(0);
});
