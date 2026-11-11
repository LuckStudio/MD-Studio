import { on } from './events.ts';
// ═══════════════════════════════════════════════════
// MOVIMIENTO (JS): transiciones que el CSS no puede expresar
// ═══════════════════════════════════════════════════
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Fundido rápido de un elemento (cambio de pestaña, recarga desde disco…)
export function fadeSwap(el, from = 0.35) {
  if (!el || reducedMotion() || !el.animate) return;
  el.animate([{ opacity: from, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// Desvanecimiento de salida de algo que ya se ha ocultado: se deja una copia inerte que se funde y desaparece.
// (El estado real cambia al instante; solo la imagen se desvanece, así nada espera a la animación.)
export function ghostFade(el, ms = 220) {
  if (!el || reducedMotion() || !el.animate || !el.isConnected) return;
  const g = el.cloneNode(true);
  g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); g.removeAttribute('id');
  g.querySelectorAll('[data-action]').forEach(n => n.removeAttribute('data-action'));
  g.hidden = false; g.setAttribute('aria-hidden', 'true'); g.setAttribute('inert', ''); g.classList.add('ghost');
  g.style.pointerEvents = 'none';
  el.after(g);
  const a = g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.012)' }], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  a.onfinish = a.oncancel = () => g.remove();
  setTimeout(() => g.remove(), ms + 200);
}

// Al abrir o cambiar de documento, los primeros bloques entran en cascada (CSS: .doc-enter)
let enterTimer = 0;
export function playDocEnter() {
  const pv = document.getElementById('preview');
  if (!pv || reducedMotion()) return;
  pv.classList.remove('doc-enter'); void pv.offsetWidth; pv.classList.add('doc-enter');
  clearTimeout(enterTimer); enterTimer = setTimeout(() => pv.classList.remove('doc-enter'), 700);
}

// Selector de vista: una píldora desliza entre «Dividida / Editor / Vista previa» (CSS: .view-toggle.has-ind)
export function moveViewIndicator() {
  const box = document.querySelector('.view-toggle');
  const btn = box && box.querySelector('.toggle-btn.active');
  if (!btn || !btn.offsetWidth) return;
  const first = !box.classList.contains('has-ind');
  box.style.setProperty('--ix', btn.offsetLeft + 'px');
  box.style.setProperty('--iw', btn.offsetWidth + 'px');
  if (first) { box.classList.add('no-anim', 'has-ind'); void box.offsetWidth; box.classList.remove('no-anim'); }
}
window.addEventListener('resize', () => moveViewIndicator());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveViewIndicator());

// Foco de luz que sigue al puntero sobre las tarjetas del inicio
document.addEventListener('pointermove', e => {
  const c = e.target.closest && e.target.closest('.home-card, .home-rcard');
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });

// Confirmación de guardado: aro en el punto de la pestaña activa y destello en la barra de estado
export function pulseSaved() {
  if (reducedMotion()) return;
  const t = document.querySelector('.tab-item.active');
  if (t) { t.classList.remove('just-saved'); void t.offsetWidth; t.classList.add('just-saved'); setTimeout(() => t.classList.remove('just-saved'), 400); }
  const ls = document.getElementById('lsStatus');
  if (ls && ls.animate) ls.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
}

on('doc:saved', () => setTimeout(pulseSaved, 0));   // tras renderTabs()