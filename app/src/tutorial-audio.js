// ═══════════════════════════════════════════════════
// SONIDO DEL TUTORIAL: música y efectos generados en el momento (Web Audio, sin archivos)
// ═══════════════════════════════════════════════════
// Todo se sintetiza con osciladores y ruido, así que no hay audio que descargar, licenciar ni cachear.
//  · Música: bucle de 4 compases (Fmaj7 · G · Em7 · Am7) a 108 BPM con pad, arpegio con eco, bajo,
//    bombo, charles y palmada. Las capas entran por «intensidad», que sube a medida que avanzan las escenas.
//  · Efectos: clic, clic derecho, tecleo, menú que aparece, barrido entre escenas, tecla, campanilla de éxito…
// El audio se pausa con el tutorial, la música sigue la velocidad y todo se silencia con un botón
// (la preferencia se recuerda). Si el navegador no admite Web Audio, el objeto devuelto no hace nada.

const SOUND_KEY = 'claudemd_tut_sound';
export const soundPreference = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } };
export const setSoundPreference = on => { try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch (e) { /* ignorar */ } };

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BASE_BPM = 108;
// Acordes del pad (graves), notas del arpegio (una octava arriba) y fundamental del bajo
const PROG = [
  { pad: [53, 57, 60, 64], arp: [65, 69, 72, 76], root: 41 },   // Fmaj7
  { pad: [55, 59, 62, 67], arp: [67, 71, 74, 79], root: 43 },   // G
  { pad: [52, 55, 59, 62], arp: [64, 67, 71, 74], root: 40 },   // Em7
  { pad: [57, 60, 64, 67], arp: [69, 72, 76, 79], root: 45 },   // Am7
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
const BASS_STEPS = [0, 3, 6, 10, 12];
const LEVELS = {          // capa → ganancia por nivel de intensidad (0..3)
  pad:  [0.9, 0.8, 0.7, 0.7],
  arp:  [0.55, 0.7, 0.85, 1],
  kick: [0, 0.8, 0.9, 1],
  bass: [0, 0.8, 0.9, 0.9],
  hat:  [0, 0, 0.8, 1],
  clap: [0, 0, 0, 0.9],
};

const NOOP = {
  stats: { state: 'unsupported', steps: 0, sfx: 0, last: '', muted: true, level: 0 },
  sfx() {}, setIntensity() {}, setMuted() {}, setSpeed() {}, pause() {}, resume() {}, fadeOut() {}, close() {}, get muted() { return true; },
};

export function createTutorialAudio({ muted = false } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return NOOP;
  let ctx;
  try { ctx = new AC(); } catch (e) { return NOOP; }

  const stats = { state: ctx.state, steps: 0, sfx: 0, last: '', muted, level: 0 };
  let isMuted = muted, speed = 1, level = 0, step = 0, nextTime = 0, timer = 0, closed = false;

  // Cadena: capas → bus de música ─┐
  //                                ├→ maestro → compresor → salida
  //        efectos → bus de efectos┘
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  const master = ctx.createGain(); master.gain.value = 0;
  const musicBus = ctx.createGain(); musicBus.gain.value = 0.42;
  const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  musicBus.connect(master); sfxBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
  const target = () => (isMuted ? 0 : 0.85);
  master.gain.setTargetAtTime(target(), ctx.currentTime, 0.25);

  // Eco con repetición punteada para el arpegio
  const delay = ctx.createDelay(1); const fb = ctx.createGain(); const wet = ctx.createGain();
  fb.gain.value = 0.34; wet.gain.value = 0.32;
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicBus);

  const layers = {};
  for (const k of Object.keys(LEVELS)) { const g = ctx.createGain(); g.gain.value = LEVELS[k][0]; g.connect(musicBus); layers[k] = g; }
  const applyLevel = () => { for (const k of Object.keys(LEVELS)) layers[k].gain.setTargetAtTime(LEVELS[k][level], ctx.currentTime, 0.6); };

  // Ruido blanco reutilizable
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const noise = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random()); s.stop(t + dur); return s; };
  const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o; };
  const amp = (dest, t, peak, a, dur) => {   // envolvente: ataque lineal y caída exponencial
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g;
  };

  // ── Instrumentos de la música ─────────────────────
  const kick = t => {
    const o = osc('sine', 150, t, 0.3); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(amp(layers.kick, t, 0.95, 0.002, 0.28));
  };
  const hat = (t, open) => {
    const n = noise(t, 0.2), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    n.connect(f); f.connect(amp(layers.hat, t, open ? 0.16 : 0.1, 0.001, open ? 0.14 : 0.04));
  };
  const clap = t => {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012, n = noise(tt, 0.12), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
      n.connect(f); f.connect(amp(layers.clap, tt, 0.22, 0.001, i === 2 ? 0.12 : 0.02));
    }
  };
  const bass = (t, m, len) => {
    const o = osc('sawtooth', mtof(m), t, len + 0.05), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(180, t + len);
    o.connect(f); f.connect(amp(layers.bass, t, 0.5, 0.005, len));
  };
  const pad = (t, notes, len) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + len * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.25);
    f.connect(g); g.connect(layers.pad);
    for (const m of notes) for (const d of [-7, 7]) { const o = osc('sawtooth', mtof(m), t, len + 0.3); o.detune.value = d; const og = ctx.createGain(); og.gain.value = 0.35; o.connect(og); og.connect(f); }
  };
  const pluck = (t, m) => {
    const o = osc('triangle', mtof(m), t, 0.35), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = amp(layers.arp, t, 0.22, 0.003, 0.3); o.connect(f); f.connect(g);
    const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send); send.connect(delay);
  };

  const stepDur = () => 60 / (BASE_BPM * speed) / 4;
  function scheduleStep(s, t) {
    const i = s % 16, bar = Math.floor(s / 16) % 4, c = PROG[bar];
    if (i === 0) pad(t, c.pad, stepDur() * 16);
    if (i % 2 === 0 || i === 3 || i === 11) pluck(t, c.arp[ARP[i]] + (i >= 8 ? 12 * (i % 4 === 2 ? 1 : 0) : 0));
    if (i === 0 || i === 8 || (i === 10 && bar % 2)) kick(t);
    if (i % 4 === 2) hat(t, i === 14);
    if (i === 4 || i === 12) clap(t);
    if (BASS_STEPS.includes(i)) bass(t, c.root, stepDur() * 1.6);
    stats.steps++;
  }
  function pump() {
    stats.state = ctx.state;
    if (closed || ctx.state !== 'running' || isMuted) { if (ctx.state === 'running') nextTime = Math.max(nextTime, ctx.currentTime); return; }
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.14) { scheduleStep(step++, nextTime); nextTime += stepDur(); }
    stats.state = ctx.state;
  }
  nextTime = ctx.currentTime + 0.08;
  timer = setInterval(pump, 30);
  applyLevel();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  // ── Efectos de sonido ─────────────────────────────
  const FX = {
    click(t) { const o = osc('sine', 1400, t, 0.06); o.frequency.exponentialRampToValueAtTime(520, t + 0.05); o.connect(amp(sfxBus, t, 0.5, 0.001, 0.055)); const n = noise(t, 0.03), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; n.connect(f); f.connect(amp(sfxBus, t, 0.12, 0.001, 0.02)); },
    rclick(t) { const o = osc('triangle', 700, t, 0.08); o.frequency.exponentialRampToValueAtTime(260, t + 0.07); o.connect(amp(sfxBus, t, 0.5, 0.001, 0.08)); },
    type(t) { const o = osc('square', 1700 + Math.random() * 900, t, 0.03); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; o.connect(f); f.connect(amp(sfxBus, t, 0.09, 0.001, 0.025)); },
    pop(t) { const o = osc('sine', 420, t, 0.12); o.frequency.exponentialRampToValueAtTime(880, t + 0.09); o.connect(amp(sfxBus, t, 0.32, 0.004, 0.11)); },
    whoosh(t) { const n = noise(t, 0.6), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.45); n.connect(f); f.connect(amp(sfxBus, t, 0.5, 0.18, 0.5)); },
    swish(t) { const n = noise(t, 0.3), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.2); n.connect(f); f.connect(amp(sfxBus, t, 0.22, 0.05, 0.22)); },
    key(t) { for (const [d, f] of [[0, 900], [0.07, 1200]]) { const o = osc('square', f, t + d, 0.04); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; o.connect(lp); lp.connect(amp(sfxBus, t + d, 0.15, 0.001, 0.035)); } },
    thock(t) { const o = osc('sine', 220, t, 0.1); o.frequency.exponentialRampToValueAtTime(110, t + 0.08); o.connect(amp(sfxBus, t, 0.6, 0.002, 0.09)); },
    success(t) { [72, 76, 79, 84].forEach((m, i) => { const tt = t + i * 0.075; const o = osc('sine', mtof(m), tt, 0.5); o.connect(amp(sfxBus, tt, 0.3, 0.004, 0.45)); const o2 = osc('triangle', mtof(m + 12), tt, 0.3); o2.connect(amp(sfxBus, tt, 0.07, 0.004, 0.25)); }); },
    chapter(t) { const o = osc('sine', mtof(76), t, 0.4); o.connect(amp(sfxBus, t, 0.28, 0.005, 0.38)); const o2 = osc('sine', mtof(83), t + 0.06, 0.4); o2.connect(amp(sfxBus, t + 0.06, 0.18, 0.005, 0.34)); },
    toggle(t) { const o = osc('sine', 600, t, 0.05); o.connect(amp(sfxBus, t, 0.3, 0.002, 0.045)); },
  };

  return {
    stats,
    get muted() { return isMuted; },
    sfx(name) {
      const f = FX[name]; if (!f) return;
      stats.sfx++; stats.last = name;
      if (isMuted || closed || ctx.state !== 'running') return;
      try { f(ctx.currentTime + 0.005); } catch (e) { /* ignorar */ }
    },
    setIntensity(n) { level = Math.max(0, Math.min(3, n)); stats.level = level; applyLevel(); },
    setMuted(m) {
      isMuted = !!m; stats.muted = isMuted;
      master.gain.setTargetAtTime(target(), ctx.currentTime, 0.12);
      if (!isMuted && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setSpeed(v) { speed = Math.max(0.5, Math.min(2.2, v)); },
    pause() { if (!closed) ctx.suspend().then(() => { stats.state = ctx.state; }).catch(() => {}); },
    resume() { if (!closed) ctx.resume().then(() => { stats.state = ctx.state; }).catch(() => {}); },
    fadeOut(sec = 1.2) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, sec / 3); },
    close() {
      if (closed) return; closed = true; clearInterval(timer);
      try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); } catch (e) { /* ignorar */ }
      setTimeout(() => { try { ctx.close(); } catch (e) { /* ignorar */ } }, 350);
    },
  };
}
