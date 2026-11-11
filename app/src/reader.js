import { S, preview } from './state.js';
import { setView } from './view.js';
import { applyPreviewEditable, endPreviewEdit } from './preview-edit.js';
import { hideHome, isHomeOpen } from './home.js';

// ═══════════════════════════════════════════════════
// MODO LECTURA
// ═══════════════════════════════════════════════════
// Solo la vista previa, sin menús ni barras, con barra de progreso, índice lateral
// que sigue la posición, y tiempo de lectura estimado.
export let readerOn = false;
export let _readerPrevView = 'split';
export const readerScroll = () => document.querySelector('.preview-scroll');

export function toggleReader() {
  endPreviewEdit();
  readerOn = !readerOn;
  document.body.classList.toggle('reader', readerOn);
  if (readerOn) {
    _readerPrevView = S.currentView;
    hideHome();
    setView('preview');
    S.currentView = _readerPrevView;           // setView lo sobrescribe: se conserva la vista anterior
    buildReaderUI();
  } else {
    setView(_readerPrevView);
    document.getElementById('readerRail').innerHTML = '';
  }
  applyPreviewEditable();
}

export function buildReaderUI() {
  const words = (preview.textContent.match(/\S+/g) || []).length;
  const mins = Math.max(1, Math.round(words / 220));
  document.getElementById('readerTime').textContent = `${mins} min de lectura · ${words} palabras`;
  const rail = document.getElementById('readerRail');
  rail.innerHTML = '';
  preview.querySelectorAll('h1,h2,h3').forEach(h => {
    const a = document.createElement('a');
    a.className = 'rr-item lvl' + h.tagName[1];
    a.textContent = h.textContent;
    a.href = '#' + h.id;
    a.dataset.id = h.id;
    a.addEventListener('click', e => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    rail.appendChild(a);
  });
  onReaderScroll();
}

export function onReaderScroll() {
  if (!readerOn) return;
  const sc = readerScroll();
  if (!sc) return;
  const max = sc.scrollHeight - sc.clientHeight;
  document.getElementById('readerProgress').style.transform = `scaleX(${max > 0 ? sc.scrollTop / max : 0})`;
  // Encabezado activo: el último que ya pasó el borde superior
  let active = null;
  const top = sc.getBoundingClientRect().top + 80;
  preview.querySelectorAll('h1,h2,h3').forEach(h => { if (h.getBoundingClientRect().top <= top) active = h.id; });
  document.querySelectorAll('#readerRail .rr-item').forEach(a => a.classList.toggle('active', a.dataset.id === active));
}
document.querySelector('.preview-scroll').addEventListener('scroll', onReaderScroll, { passive: true });

// Si el contenido cambia (recarga desde disco, cambio de pestaña) se reconstruye el índice
new MutationObserver(() => { if (readerOn) buildReaderUI(); }).observe(preview, { childList: true });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && readerOn && !isHomeOpen()) { e.preventDefault(); toggleReader(); }
});
