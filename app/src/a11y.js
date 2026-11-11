import { closeTab } from './tabs.js';
import { closeStats } from './stats.js';
import { closeMenu } from './menu.js';
import { closeCmd } from './commands.js';
import { closeSettings } from './settings.js';
import { closeBacklinks } from './wikilinks.js';
import { closeSrcDialog } from './blocks.js';
import { closeDiff } from './diff.js';
import { closeExport } from './exportdlg.js';
import { closeHistory } from './versions.js';
import { closeClaudeCheck } from './claude.js';

// ═══════════════════════════════════════════════════
// ACCESIBILIDAD: foco en diálogos, menús con teclado, nombres de botones, pestañas
// ═══════════════════════════════════════════════════
// Se hace de forma transversal (observando el DOM) para no tocar cada función de abrir/cerrar.

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
export const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

// ── 1. Botones solo con icono: su nombre sale de title / data-tip ──
export function labelIconButtons(root = document) {
  root.querySelectorAll('button:not([aria-label]):not([hidden])').forEach(b => {
    if (b.textContent.trim().length > 1) return;                 // ya tiene texto ("×" cuenta como sin nombre)
    const name = b.getAttribute('title') || b.getAttribute('data-tip');
    if (name) b.setAttribute('aria-label', name.replace(/\s*\(.*\)\s*$/, ''));
  });
}
labelIconButtons();
new MutationObserver(muts => {
  for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) labelIconButtons(n.matches('button') ? n.parentNode : n); });
}).observe(document.body, { childList: true, subtree: true });

// ── 2. Diálogos: foco al abrir, trampa de Tab, devolver el foco, Esc para cerrar ──
export const DIALOGS = [
  { el: '#settingsDrawer', close: () => closeSettings() },
  { el: '#statsOverlay', close: () => closeStats() },
  { el: '#diffOverlay', close: () => closeDiff() },
  { el: '#claudeOverlay', close: () => closeClaudeCheck() },
  { el: '#cmdOverlay', close: () => closeCmd() },
  { el: '#srcOverlay', close: () => closeSrcDialog() },
  { el: '#histOverlay', close: () => closeHistory() },
  { el: '#backOverlay', close: () => closeBacklinks() },
  { el: '#exportOverlay', close: () => closeExport() },
];
export const dlgState = new Map();   // elemento → foco anterior
export const inertBg = new Map();    // elemento → fondo que se volvió inerte

DIALOGS.forEach(d => {
  const el = document.querySelector(d.el);
  if (!el) return;
  new MutationObserver(() => {
    const open = el.classList.contains('open');
    if (open && !dlgState.has(el)) {
      dlgState.set(el, document.activeElement);
      // El resto de la página queda inerte mientras hay un diálogo modal abierto
      const bg = [...document.body.children].filter(c => c !== el && !c.contains(el) && !c.matches('script, svg, #toast, .settings-overlay, .skip-link'));
      bg.forEach(c => { c.inert = true; });
      inertBg.set(el, bg);
      requestAnimationFrame(() => {
        const target = el.querySelector('[autofocus]') || [...el.querySelectorAll(FOCUSABLE)].find(visible);
        if (target && !el.contains(document.activeElement)) target.focus({ preventScroll: true });
      });
    } else if (!open && dlgState.has(el)) {
      (inertBg.get(el) || []).forEach(c => { c.inert = false; });
      inertBg.delete(el);
      const prev = dlgState.get(el);
      dlgState.delete(el);
      if (prev && prev.isConnected && prev !== document.body && !document.activeElement?.closest('[role="dialog"]')?.classList.contains('open')) {
        prev.focus({ preventScroll: true });
      }
    }
  }).observe(el, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('keydown', e => {
  const open = DIALOGS.map(d => ({ d, el: document.querySelector(d.el) })).filter(x => x.el && x.el.classList.contains('open'));
  if (!open.length) return;
  const top = open[open.length - 1];
  if (e.key === 'Escape') { e.preventDefault(); top.d.close(); return; }
  if (e.key !== 'Tab') return;
  const items = [...top.el.querySelectorAll(FOCUSABLE)].filter(visible);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ── 3. Menús desplegables con teclado (flechas, Inicio/Fin, Esc, izquierda/derecha) ──
export const menuButtons = () => [...document.querySelectorAll('.menu-group > .menu-btn')];
document.querySelectorAll('.menu-dd').forEach(dd => {
  const btn = document.querySelector(`#mg-${dd.id.replace('dd-', '')} .menu-btn`);
  new MutationObserver(() => {
    const isOpen = dd.classList.contains('open');
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && document.activeElement === btn) requestAnimationFrame(() => dd.querySelector('[role="menuitem"]')?.focus());
  }).observe(dd, { attributes: true, attributeFilter: ['class'] });

  dd.addEventListener('keydown', e => {
    const items = [...dd.querySelectorAll('[role="menuitem"]')].filter(visible);
    const i = items.indexOf(document.activeElement);
    const go = n => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); btn.focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const bs = menuButtons(), k = bs.indexOf(btn);
      const next = bs[(k + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length];
      e.preventDefault(); closeMenu(); next.focus(); next.click();
    } else if (e.key === 'Tab') closeMenu();
  });
});
// Flecha abajo sobre un botón de menú lo abre
menuButtons().forEach(b => b.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && b.getAttribute('aria-expanded') !== 'true') { e.preventDefault(); b.click(); }
}));

// ── 4. Pestañas: roles, selección y navegación con flechas ──
export function a11yTabs() {
  const list = document.getElementById('tabsList');
  list.querySelectorAll('.tab-item').forEach(t => {
    const active = t.classList.contains('active');
    const main = t.querySelector('.tab-main');
    if (main) { main.toggleAttribute('aria-current', active); if (active) main.setAttribute('aria-current', 'true'); main.tabIndex = active ? 0 : -1; }
    const close = t.querySelector('.tab-close');
    if (close) close.setAttribute('aria-label', 'Cerrar ' + (t.querySelector('.tab-label')?.textContent || 'pestaña'));
  });
}
document.getElementById('tabsList').addEventListener('keydown', e => {
  const items = [...e.currentTarget.querySelectorAll('.tab-main')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  let n = null;
  if (e.key === 'ArrowRight') n = (i + 1) % items.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = items.length - 1;
  else if (e.key === 'Delete') { closeTab(+items[i].closest('.tab-item').dataset.id); return; }
  if (n !== null) { e.preventDefault(); items[n].focus(); }
});
new MutationObserver(a11yTabs).observe(document.getElementById('tabsList'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
a11yTabs();

// ── 5. Interruptores (div.switch) como role="switch" con teclado ──
document.querySelectorAll('.switch').forEach(sw => {
  const sync = () => sw.setAttribute('aria-checked', String(sw.classList.contains('on')));
  new MutationObserver(sync).observe(sw, { attributes: true, attributeFilter: ['class'] });
  sync();
  sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sw.click(); } });
});
