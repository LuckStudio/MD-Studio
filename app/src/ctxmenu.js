// ═══════════════════════════════════════════════════
// MENÚ CONTEXTUAL (componente): paneles propios para el clic derecho
// ═══════════════════════════════════════════════════
// showContextMenu(x, y, items, { restoreFocus }) pinta un panel con submenús, iconos, atajos,
// casillas y elementos deshabilitados o «peligrosos». No roba el foco (la selección del texto
// sigue viva): el teclado se atiende desde el documento mientras está abierto.
//
// Elemento: { label, icon, kbd, action, disabled, danger, checked, items: [...] (submenú) } o 'sep'.
import { icon } from './icons.js';
import { escHtml, escAttr } from './tabs.js';
import { reducedMotion } from './motion.js';

let root = null;            // panel principal
let panels = [];            // pila de paneles (principal + submenús)
let active = null;          // { panelIndex, index }
let prevFocus = null;

export function isContextMenuOpen() { return panels.length > 0; }

export function closeContextMenu(restore = true) {
  if (!panels.length) return;
  panels.forEach(p => p.el.remove());
  panels = []; active = null;
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('blur', onBlurClose);
  window.removeEventListener('resize', onBlurClose);
  document.removeEventListener('scroll', onScrollClose, true);
  if (restore && prevFocus && prevFocus.isConnected && prevFocus !== document.body) prevFocus.focus({ preventScroll: true });
  prevFocus = null;
}
const onBlurClose = () => closeContextMenu(false);
const onScrollClose = e => { if (!e.target.closest || !e.target.closest('.ctx-menu')) closeContextMenu(false); };
function onOutside(e) { if (!e.target.closest || !e.target.closest('.ctx-menu')) closeContextMenu(false); }

export function showContextMenu(x, y, items, opts = {}) {
  closeContextMenu(false);
  const list = items.filter(Boolean);
  if (!list.length) return;
  prevFocus = document.activeElement;
  openPanel(list, x, y, 0, opts.fromKeyboard);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('blur', onBlurClose);
  window.addEventListener('resize', onBlurClose);
  document.addEventListener('scroll', onScrollClose, true);
  if (opts.fromKeyboard) setActive(0, firstEnabled(list));
}

function firstEnabled(list, from = -1, dir = 1) {
  const n = list.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + dir * k + n * 2) % n;
    if (list[i] !== 'sep' && !list[i].disabled) return i;
  }
  return -1;
}

function openPanel(list, x, y, level, focusFirst) {
  while (panels.length > level) panels.pop().el.remove();
  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', 'Menú contextual');
  el.tabIndex = -1;
  el.innerHTML = list.map((it, i) => {
    if (it === 'sep') return '<div class="ctx-sep" role="separator"></div>';
    const role = it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem';
    return `<button type="button" class="ctx-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}" role="${role}" data-i="${i}" tabindex="-1"` +
      `${it.disabled ? ' aria-disabled="true"' : ''}${it.checked !== undefined ? ` aria-checked="${!!it.checked}"` : ''}${it.items ? ' aria-haspopup="menu"' : ''}>` +
      `<span class="ctx-ic">${it.checked ? icon('check') : it.icon ? icon(it.icon) : ''}</span><span class="ctx-label">${escHtml(it.label)}</span>` +
      `${it.kbd ? `<kbd>${escHtml(it.kbd)}</kbd>` : ''}${it.items ? `<span class="ctx-more">${icon('chevron-right')}</span>` : ''}</button>`;
  }).join('');
  document.body.appendChild(el);
  place(el, x, y, level);
  el.addEventListener('mousedown', e => e.preventDefault());              // no quita el foco ni la selección
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.querySelectorAll('.ctx-item').forEach(b => {
    const i = +b.dataset.i;
    b.addEventListener('mouseenter', () => { setActive(level, i); const it = list[i]; if (it.items && !it.disabled) openSub(level, i, false); else while (panels.length > level + 1) panels.pop().el.remove(); });
    b.addEventListener('click', () => choose(level, i));
  });
  panels.push({ el, list, level });
  if (level === 0) root = el;
  if (!reducedMotion()) el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 110, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// Coloca el panel dentro del viewport; los submenús se abren a la derecha (o a la izquierda si no cabe)
function place(el, x, y, level) {
  const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = x, top = y;
  if (level > 0) { const par = panels[level - 1].el.getBoundingClientRect(); left = par.right - 4; if (left + w > vw - pad) left = par.left - w + 4; }
  else if (left + w > vw - pad) left = Math.max(pad, x - w);
  if (top + h > vh - pad) top = Math.max(pad, vh - h - pad);
  el.style.left = Math.max(pad, left) + 'px';
  el.style.top = Math.max(pad, top) + 'px';
  if (h > vh - pad * 2) { el.style.maxHeight = vh - pad * 2 + 'px'; el.style.overflowY = 'auto'; }
}

function setActive(level, index) {
  active = { level, index };
  panels.forEach((p, l) => p.el.querySelectorAll('.ctx-item').forEach(b => b.classList.toggle('sel', l === level && +b.dataset.i === index)));
  const b = panels[level] && panels[level].el.querySelector(`.ctx-item[data-i="${index}"]`);
  if (b) b.scrollIntoView({ block: 'nearest' });
}

function openSub(level, index, keyboard) {
  const it = panels[level].list[index];
  const b = panels[level].el.querySelector(`.ctx-item[data-i="${index}"]`);
  const r = b.getBoundingClientRect();
  openPanel(it.items, r.right, r.top - 5, level + 1);
  if (keyboard) setActive(level + 1, firstEnabled(it.items));
}

function choose(level, index) {
  const it = panels[level].list[index];
  if (!it || it === 'sep' || it.disabled) return;
  if (it.items) { openSub(level, index, true); return; }
  const restore = prevFocus;
  closeContextMenu(false);
  if (restore && restore.isConnected && restore !== document.body) restore.focus({ preventScroll: true });
  if (it.action) setTimeout(() => it.action(), 0);
}

function onKey(e) {
  if (!panels.length) return;
  const lv = active ? active.level : 0;
  const panel = panels[lv] || panels[0];
  const list = panel.list;
  const cur = active ? active.index : -1;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { stop(); if (panels.length > 1 && lv > 0) { panels.pop().el.remove(); setActive(lv - 1, active ? active.index : 0); } else closeContextMenu(true); }
  else if (e.key === 'ArrowDown') { stop(); const i = firstEnabled(list, cur, 1); if (i >= 0) setActive(lv, i); }
  else if (e.key === 'ArrowUp') { stop(); const i = firstEnabled(list, cur < 0 ? 0 : cur, -1); if (i >= 0) setActive(lv, i); }
  else if (e.key === 'Home') { stop(); const i = firstEnabled(list, -1, 1); if (i >= 0) setActive(lv, i); }
  else if (e.key === 'End') { stop(); const i = firstEnabled(list, 0, -1); if (i >= 0) setActive(lv, i); }
  else if (e.key === 'ArrowRight') { stop(); const it = list[cur]; if (it && it.items && !it.disabled) openSub(lv, cur, true); }
  else if (e.key === 'ArrowLeft') { stop(); if (lv > 0) { panels.pop().el.remove(); setActive(lv - 1, active.index); } }
  else if (e.key === 'Enter' || e.key === ' ') { stop(); if (cur >= 0) choose(lv, cur); }
  else if (e.key === 'Tab') { stop(); closeContextMenu(true); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {   // escribir una letra salta al elemento que empieza por ella
    const q = e.key.toLowerCase();
    const i = list.findIndex((it, k) => it !== 'sep' && !it.disabled && k > cur && it.label.toLowerCase().startsWith(q));
    const j = i >= 0 ? i : list.findIndex(it => it !== 'sep' && !it.disabled && it.label.toLowerCase().startsWith(q));
    if (j >= 0) { stop(); setActive(lv, j); }
  }
}
