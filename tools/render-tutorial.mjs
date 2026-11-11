// Graba el tutorial animado a un MP4 (vídeo 1920×1080 + música y efectos) para compartirlo.
// Uso: npm run video   →   video/MD-Studio-tutorial.mp4
// Cómo: abre la app con el tutorial en «modo grabación» (diseño 16:9 sin controles), captura los fotogramas
// de la pantalla (screencast de Chromium) y graba a la vez el audio que genera Web Audio (se engancha a la
// salida con un MediaStreamDestination). Después ffmpeg une vídeo y audio. Necesita Edge/Chrome y ffmpeg.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'video');
const WORK = join(OUT_DIR, '_frames');
const OUT = join(OUT_DIR, 'MD-Studio-tutorial.mp4');
const PORT = process.env.PORT || '8793';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const W = 1920, H = 1080, FPS = 30;

if (spawnSync(FFMPEG, ['-version']).status !== 0) { console.error('No encuentro ffmpeg. Instálalo o indica su ruta con FFMPEG=ruta.'); process.exit(1); }
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });

// Servidor de desarrollo (app/ sin empaquetar)
const server = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT }, stdio: 'ignore' });
const url = `http://localhost:${PORT}/`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(url)).ok) break; } catch (e) { /* aún no */ } await new Promise(r => setTimeout(r, 200)); }

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__EXPOSE_APP__ = true; window.__NO_SPLASH__ = true;
    // Todo lo que llegue a la salida de audio se copia a un grabador (se empieza a grabar al crear el contexto)
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      constructor(...a) {
        super(...a);
        this.__tap = this.createMediaStreamDestination();
        window.__chunks = [];
        window.__rec = new MediaRecorder(this.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
        window.__rec.ondataavailable = e => window.__chunks.push(e.data);
        window.__rec.start(200);
        window.__audioT0 = Date.now();
      }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...r) {
      const res = connect.call(this, dest, ...r);
      if (dest instanceof AudioDestinationNode && this.context.__tap) connect.call(this, this.context.__tap);
      return res;
    };
  });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => hideHome());
  await page.waitForTimeout(600);

  // ── Captura de fotogramas ──
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(WORK, String(frames.length + 1).padStart(6, '0') + '.jpg');
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ t: metadata.timestamp, file });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await page.evaluate(() => startTutorial({ render: true }));
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  console.log('Grabando el tutorial en tiempo real (≈ 1 min 25 s)…');
  await page.waitForFunction(() => window.__tutorialDone === true, null, { timeout: 5 * 60_000, polling: 500 });
  await page.waitForTimeout(2800);                                  // cola de la música y última imagen
  await cdp.send('Page.stopScreencast');

  // ── Audio ──
  const audio = await page.evaluate(async () => {
    await new Promise(r => { window.__rec.onstop = r; window.__rec.stop(); });
    const buf = new Uint8Array(await new Blob(window.__chunks).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { b64: btoa(bin), t0: window.__audioT0 };
  });
  writeFileSync(join(WORK, 'audio.webm'), Buffer.from(audio.b64, 'base64'));
  if (frames.length < 50) throw new Error('Se capturaron muy pocos fotogramas: ' + frames.length);

  // ── Lista de fotogramas con su duración (la captura es de frecuencia variable) ──
  const t0 = frames[0].t, end = frames[frames.length - 1].t + 0.2;
  const lines = [];
  frames.forEach((f, i) => {
    const next = i < frames.length - 1 ? frames[i + 1].t : end;
    lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  writeFileSync(join(WORK, 'list.txt'), lines.join('\n'));
  const total = end - t0;
  const off = audio.t0 / 1000 - t0;                                  // desfase entre el inicio del audio y del primer fotograma
  console.log(`Fotogramas: ${frames.length} · duración ${total.toFixed(1)} s · desfase de audio ${(off * 1000).toFixed(0)} ms`);

  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', join(WORK, 'list.txt'),
    ...(off >= 0 ? ['-itsoffset', off.toFixed(3)] : ['-ss', (-off).toFixed(3)]), '-i', join(WORK, 'audio.webm'),
    '-filter_complex',
    `[0:v]fps=${FPS},scale=${W}:${H},format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.9).toFixed(2)}:d=0.9[v];` +
    `[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad,afade=t=in:d=0.4,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.6[a]`,
    '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT];
  const r = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(String(r.stderr).split('\n').slice(-15).join('\n')); throw new Error('ffmpeg falló'); }
  console.log(`Listo: ${OUT} (${(statSync(OUT).size / 1048576).toFixed(1)} MB)`);
  if (!process.env.KEEP_FRAMES) rmSync(WORK, { recursive: true, force: true });
} finally {
  await browser.close();
  server.kill();
}
