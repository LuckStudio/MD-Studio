import { test, expect } from './_setup.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Recorre todos los elementos y devuelve las transiciones/animaciones más largas de lo permitido
const slowMotion = page => page.evaluate(() => {
  const toMs = s => s.split(',').map(x => (x.includes('ms') ? parseFloat(x) : parseFloat(x) * 1000));
  const EXEMPT = /^(flashFade|flashFadeStrong|markFade|pulse-border)$/;   // destellos de sincronización y arrastrar-soltar
  const bad = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const t = toMs(cs.transitionDuration).concat(toMs(cs.transitionDelay));
    const names = cs.animationName.split(',').map(s => s.trim());
    const ad = toMs(cs.animationDuration);
    const slow = t.some(v => v > 300) || ad.some((v, i) => v > 300 && !EXEMPT.test(names[i] || ''));
    if (slow) bad.push((el.id ? '#' + el.id : el.className || el.tagName) + ` t=${cs.transitionDuration} a=${cs.animationName}:${cs.animationDuration}`);
  }
  return bad;
});

test('todo el movimiento de la interfaz dura ≤ 300 ms', async ({ page }) => {
  expect(await slowMotion(page)).toEqual([]);                                   // inicio
  await page.evaluate(() => { hideHome(); setView('split'); toggleMenu('archivo'); });
  expect(await slowMotion(page)).toEqual([]);
  await page.evaluate(() => { closeMenu(); openSettings(); });
  expect(await slowMotion(page)).toEqual([]);
});

test('con prefers-reduced-motion no hay animaciones perceptibles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const d = await page.evaluate(() => {
    const el = document.querySelector('.home-card');
    const cs = getComputedStyle(el);
    return { anim: parseFloat(cs.animationDuration) * (cs.animationDuration.includes('ms') ? 1 : 1000), trans: parseFloat(cs.transitionDuration) * (cs.transitionDuration.includes('ms') ? 1 : 1000) };
  });
  expect(d.anim).toBeLessThan(5);
  expect(d.trans).toBeLessThan(5);
  expect(await page.evaluate(() => reducedMotion())).toBe(true);
});

test('guardar confirma con un destello en la pestaña', async ({ page }) => {
  await page.evaluate(() => hideHome());
  await page.evaluate(async () => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('m.md', { create: true });
    await openRefs([new FsaFile(fh)]);
    editor.value = 'x'; editor.dispatchEvent(new Event('input'));
    await saveFile();
  });
  await expect(page.locator('.tab-item.active.just-saved')).toHaveCount(1);
});

test('selector de vista: la píldora se mueve a la opción activa', async ({ page }) => {
  await page.evaluate(() => { hideHome(); setView('split'); });
  const pos = () => page.evaluate(() => { const b = document.querySelector('.view-toggle'); return { ix: b.style.getPropertyValue('--ix'), iw: b.style.getPropertyValue('--iw'), ind: b.classList.contains('has-ind'), btn: document.querySelector('.toggle-btn.active').offsetLeft + 'px' }; });
  const a = await pos();
  expect(a.ind).toBe(true);
  expect(a.ix).toBe(a.btn);
  await page.evaluate(() => setView('preview'));
  const b = await pos();
  expect(b.ix).toBe(b.btn);
  expect(b.ix).not.toBe(a.ix);
});

test('pestaña nueva entra animada y los bloques entran en cascada al cambiar de documento', async ({ page }) => {
  await page.evaluate(() => { hideHome(); editor.value = '# Uno\n\nA\n\nB\n'; editor.dispatchEvent(new Event('input')); setView('preview'); updatePreview(); });
  await page.evaluate(() => newTab());
  await expect(page.locator('.tab-item.tab-new')).toHaveCount(1);
  await page.evaluate(() => renderTabs());
  await expect(page.locator('.tab-item.tab-new')).toHaveCount(0);   // solo en el primer pintado
  await page.evaluate(() => { switchTab(S.tabs[0].id); });
  await expect(page.locator('#preview.doc-enter')).toHaveCount(1);
  await expect(page.locator('#preview.doc-enter')).toHaveCount(0, { timeout: 2000 });
});

test('el menú contextual y sus elementos animan en ≤ 300 ms', async ({ page }) => {
  await page.evaluate(() => { hideHome(); editor.value = 'Hola\n'; editor.dispatchEvent(new Event('input')); setView('preview'); updatePreview(); });
  await page.locator('.md-blk p').click({ button: 'right' });
  await expect(page.locator('.ctx-menu')).toBeVisible();
  expect(await slowMotion(page)).toEqual([]);
});

test('fundidos entre pantallas: el inicio se desvanece al ocultarse y los diálogos se funden al cerrar', async ({ page }) => {
  await page.evaluate(() => hideHome());
  expect(await page.locator('#home').isHidden()).toBe(true);               // el estado cambia al instante
  await expect(page.locator('.home.ghost')).toHaveCount(1);                // …y queda una copia inerte que se funde
  expect(await page.locator('.home.ghost').getAttribute('inert')).not.toBeNull();
  await expect(page.locator('.home.ghost')).toHaveCount(0, { timeout: 2000 });
  // Paleta: al cerrar hay una transición de opacidad en marcha y después queda oculta
  await page.evaluate(() => openCmd());
  await expect(page.locator('.cmd-overlay')).toBeVisible();
  await page.waitForTimeout(350);
  const running = await page.evaluate(() => { closeCmd(); return document.querySelector('.cmd-overlay').getAnimations().some(a => a.transitionProperty === 'opacity'); });
  expect(running).toBe(true);
  await expect(page.locator('.cmd-overlay')).toBeHidden();
});

test('cambiar de vista funde los paneles', async ({ page }) => {
  await page.evaluate(() => { hideHome(); setView('split'); });
  const anim = await page.evaluate(() => { setView('editor'); return document.getElementById('editorPanel').getAnimations().length > 0; });
  expect(anim).toBe(true);
});
