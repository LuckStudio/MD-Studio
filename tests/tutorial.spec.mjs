import { test, expect } from './_setup.mjs';
import AxeBuilder from '@axe-core/playwright';

// Tutorial animado: reproductor con escenas, pausa, saltos, teclado, accesibilidad y reducción de movimiento.
const warnings = [];
test.beforeEach(async ({ page }) => {
  warnings.length = 0;
  page.on('console', m => { if (/Tutorial:/.test(m.text())) warnings.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
});
const seek = (page, ms) => page.evaluate(ms => { const r = document.getElementById('tutSeek'); r.value = ms; r.dispatchEvent(new Event('input', { bubbles: true })); }, ms);

test('se abre desde la tarjeta del inicio, es un diálogo modal y avanza solo', async ({ page }) => {
  await page.locator('#homeTour').getByRole('button', { name: 'Ver tutorial' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tutorial animado de MD Studio' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#tutTitle')).toHaveText('Bienvenido a MD Studio');
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.locator('#tutSeek').inputValue().then(Number), { timeout: 4000 }).toBeGreaterThan(800);
  await expect(page.locator('#tutText')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tutorial')).toHaveCount(0);
  await page.evaluate(() => showHome());
  await expect(page.locator('#homeTour')).toBeHidden();   // ya visto: la tarjeta desaparece
});

test('pausa, reanuda, cambia la velocidad y salta de escena y por capítulos', async ({ page }) => {
  await page.evaluate(() => startTutorial());
  await page.locator('#tutPlay').click();
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'paused');
  const t0 = await page.locator('#tutSeek').inputValue();
  await page.waitForTimeout(500);
  expect(await page.locator('#tutSeek').inputValue()).toBe(t0);           // en pausa no avanza
  await page.locator('#tutSpeed').click();
  await expect(page.locator('#tutSpeed')).toHaveText('1.5×');
  await page.locator('[data-tut=next]').click();
  await expect(page.locator('#tutTitle')).toHaveText('Abre un archivo, una carpeta o empieza de cero');
  await page.locator('.tut-chap', { hasText: 'Clic derecho' }).click();
  await expect(page.locator('#tutTitle')).toHaveText('Panel propio con clic derecho');
  await expect(page.locator('.tut-chap[aria-current=step]')).toContainText('Clic derecho');
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'playing');   // elegir capítulo reanuda
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutTitle')).toHaveText('La barra lateral, también en la vista previa');
});

test('cada escena llega a su estado final sin pasos fallidos', async ({ page }) => {
  await page.evaluate(() => startTutorial());
  await page.locator('#tutPlay').click();   // pausa
  expect(await page.locator('.tut-chap').count()).toBe(11);
  expect(await page.evaluate(() => +document.getElementById('tutSeek').max)).toBeGreaterThan(60000);
  expect(await page.evaluate(() => +document.getElementById('tutSeek').max)).toBeLessThan(85000);   // más ágil que el guion original (≈ 1:40)
  const q = sel => page.locator('#tvScene ' + sel);
  const tl = await page.evaluate(() => tutorialTimeline());
  const at = i => tl.starts[i] + tl.durs[i] - 100;
  await seek(page, at(1)); await expect(q('.tv-win[data-view=preview]')).toHaveCount(1);
  await seek(page, at(2)); await expect(q('.tv-win')).toHaveAttribute('data-view', 'preview'); await expect(q('#badge.on')).toHaveCount(1);
  await seek(page, at(3)); await expect(q('#w1.bold')).toHaveCount(1); await expect(q('#ln table')).toHaveCount(1);
  await seek(page, at(4)); await expect(q('#b1 h2')).toHaveCount(1); await expect(q('#b2 .tv-tasks')).toHaveCount(1);
  await seek(page, at(5)); await expect(q('.tv-tasks')).toHaveCount(2);
  await seek(page, at(6)); await expect(q('#tbl.ar')).toHaveCount(1); await expect(q('#newrow')).not.toHaveClass(/hid/);
  await seek(page, at(7)); await expect(q('.tv-tab')).toHaveCount(3); await expect(q('.tv-win')).toHaveAttribute('data-files', '1');
  await seek(page, at(8)); await expect(q('#saved.ok')).toHaveCount(1); await expect(q('#hist.on')).toHaveCount(1);
  await seek(page, at(9)); await expect(q('#toast.on')).toHaveCount(1);
  await seek(page, at(10)); await expect(q('.tv-keys .tv-key2.on')).toHaveCount(6);
  await expect(page.locator('#tutTitle')).toHaveText('Ya conoces el flujo');
  expect(warnings).toEqual([]);
});

test('al terminar ofrece «Verlo de nuevo» y «Empezar a escribir»', async ({ page }) => {
  await page.evaluate(() => startTutorial());
  await page.locator('.tut-chap', { hasText: 'Listo' }).click();
  await page.locator('#tutSpeed').click(); await page.locator('#tutSpeed').click();   // 1.5× → 2×
  await expect(page.locator('#tutEnd')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'ended');
  await page.locator('#tutEnd').getByRole('button', { name: /de nuevo/ }).click();
  await expect(page.locator('#tutTitle')).toHaveText('Bienvenido a MD Studio');
  await expect(page.locator('#tutEnd')).toBeHidden();
  await page.locator('.tut-chap', { hasText: 'Listo' }).click();
  await page.locator('[data-tut=next]').click();
  await expect(page.locator('#tutEnd')).toBeVisible();
  await page.getByRole('button', { name: 'Empezar a escribir' }).click();
  await expect(page.locator('#tutorial')).toHaveCount(0);
  await expect(page.locator('#home')).toBeHidden();
});

test('el foco se queda dentro del diálogo y vuelve al cerrar', async ({ page }) => {
  await page.evaluate(() => { hideHome(); });
  await page.locator('.menu-logo').focus();
  await page.evaluate(() => startTutorial());
  await expect(page.locator('#tutPlay')).toBeFocused();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#tutorial'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#tutorial')).toHaveCount(0);
  await expect(page.locator('.menu-logo')).toBeFocused();
});

test('Ctrl+K no actúa sobre la aplicación mientras el tutorial está abierto; Espacio pausa', async ({ page }) => {
  await page.evaluate(() => { hideHome(); startTutorial(); });
  await page.locator('#tutText').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'paused');
  await page.keyboard.press('Control+k');
  await expect(page.locator('.cmd-overlay.open')).toHaveCount(0);
});

test('reducir movimiento: no se reproduce solo y muestra el final de cada escena', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => startTutorial());
  await expect(page.locator('#tutPlay')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#tvScene .tv-chip.on')).toHaveCount(4);
  await page.locator('[data-tut=next]').click();
  await expect(page.locator('#tutTitle')).toHaveText('Abre un archivo, una carpeta o empieza de cero');
  await expect(page.locator('#tvScene .tv-win')).toHaveCount(1);   // fotograma final: ya se abrió el documento
});

test('accesibilidad del tutorial abierto (oscuro y claro)', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => { document.body.classList.toggle('light-theme', t === 'light'); startTutorial(); }, theme);
    await page.locator('#tutPlay').click();
    await page.locator('.tut-chap', { hasText: 'Clic derecho' }).click();
    await page.locator('#tutPlay').click();
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).include('#tutorial').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(theme + ': ' + r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0] && n.any[0].message)).join(' | '))).toBe(theme + ': ');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorial')).toHaveCount(0);
  }
});

test('música y efectos: el audio arranca con un clic, se pausa, se silencia y se recuerda', async ({ page }) => {
  await page.locator('#homeTour').getByRole('button', { name: 'Ver tutorial' }).click();   // clic real: el navegador permite el audio
  await expect.poll(() => page.evaluate(() => tutorialAudioStats().state), { timeout: 5000 }).toBe('running');
  await expect.poll(() => page.evaluate(() => tutorialAudioStats().steps), { timeout: 5000 }).toBeGreaterThan(4);   // la música se programa por notas
  await page.locator('.tut-chap', { hasText: 'Escribir' }).click();
  await expect.poll(() => page.evaluate(() => tutorialAudioStats().sfx), { timeout: 10000 }).toBeGreaterThan(3);    // clic, tecleo, menú…
  expect(await page.evaluate(() => tutorialAudioStats().last)).toMatch(/^(click|type|pop|swish|whoosh|thock|key|toggle|success|rclick|chapter)$/);
  expect(await page.evaluate(() => tutorialAudioStats().level)).toBe(2);                                              // intensidad de la escena
  await page.locator('#tutSound').click();
  await expect(page.locator('#tutSound')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => tutorialAudioStats().muted)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('claudemd_tut_sound'))).toBe('0');
  await page.keyboard.press('m');                                                                                      // atajo M
  await expect(page.locator('#tutSound')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('claudemd_tut_sound'))).toBe('1');
  await page.locator('#tutPlay').click();                                                                              // pausa → el audio se suspende
  await expect.poll(() => page.evaluate(() => tutorialAudioStats().state), { timeout: 3000 }).toBe('suspended');
  await page.locator('#tutPlay').click();
  await expect.poll(() => page.evaluate(() => tutorialAudioStats().state), { timeout: 3000 }).toBe('running');
});

test('el sonido silenciado se recuerda al volver a abrir el tutorial', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('claudemd_tut_sound', '0'); startTutorial(); });
  await expect(page.locator('#tutSound')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => tutorialAudioStats().muted)).toBe(true);
});

test('cámara que se acerca a la acción y tarjeta de capítulo entre escenas', async ({ page }) => {
  await page.evaluate(() => startTutorial());
  await page.locator('#tutPlay').click();                                    // pausa para controlar el instante
  const tl = await page.evaluate(() => tutorialTimeline());
  await seek(page, tl.starts[3] + Math.round(tl.durs[3] * 0.3));
  await expect.poll(() => page.locator('#tvCam').evaluate(e => e.style.transform)).toContain('scale(');
  await seek(page, tl.starts[3] + tl.durs[3] - 100);                         // al final de la escena vuelve al plano general
  await expect.poll(() => page.locator('#tvCam').evaluate(e => e.style.transform)).toBe('');
  // Paso natural entre escenas: aparece el capítulo y el borde de transición
  await seek(page, tl.starts[1] - 300);
  await page.locator('#tutPlay').click();
  await expect(page.locator('.tv-chapter')).toHaveText(/2s*Abrir/, { timeout: 4000 });
  await expect(page.locator('.tv-chapter')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('#tutText .w').first()).toBeVisible();           // subtítulos palabra a palabra
});

test('la música y los efectos generan señal de audio real (no silencio)', async ({ page }) => {
  await page.mouse.click(200, 300);   // activación del usuario para que el navegador permita el audio
  const rms = await page.evaluate(async () => {
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...r) {   // se escucha lo que llega a la salida con un analizador
      const res = orig.call(this, dest, ...r);
      if (dest instanceof AudioDestinationNode && !window.__an) { const an = this.context.createAnalyser(); an.fftSize = 2048; orig.call(this, an); window.__an = an; }
      return res;
    };
    const a = createTutorialAudio({ muted: false });
    a.setIntensity(3);
    const buf = new Float32Array(2048); let peak = 0, sfxPeak = 0;
    const sample = () => { window.__an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
    for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 80)); peak = Math.max(peak, sample()); }
    a.sfx('success');
    for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 40)); sfxPeak = Math.max(sfxPeak, sample()); }
    a.close();
    return { peak, sfxPeak, steps: a.stats.steps, state: a.stats.state };
  });
  expect(rms.state).toBe('running');
  expect(rms.steps).toBeGreaterThan(8);
  expect(rms.peak).toBeGreaterThan(0.005);        // la música suena
  expect(rms.peak).toBeLessThan(0.7);             // y no satura
  expect(rms.sfxPeak).toBeGreaterThan(0.005);
});
