import { S, editor } from './state.js';
import { closeStats } from './stats.js';
import { openFind } from './find.js';
import { toggleZen, zenMode } from './view.js';
import { closeCmd, cmdOverlay, openCmd } from './commands.js';
import { closeSettings } from './settings.js';

// ═══════════════════════════════════════════════════
// MENU SYSTEM
// ═══════════════════════════════════════════════════
export function toggleMenu(id) {
  if (S.openMenuId === id) { closeMenu(); return; }
  closeMenu();
  const dd = document.getElementById('dd-' + id);
  const btn = document.querySelector(`#mg-${id} .menu-btn`);
  if (dd) { dd.classList.add('open'); }
  if (btn) btn.classList.add('open');
  S.openMenuId = id;
}
export function closeMenu() {
  if (S.openMenuId) {
    document.getElementById('dd-' + S.openMenuId)?.classList.remove('open');
    document.querySelector(`#mg-${S.openMenuId} .menu-btn`)?.classList.remove('open');
    S.openMenuId = null;
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.menu-group')) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMenu();
    if (document.getElementById('settingsDrawer').classList.contains('open')) closeSettings();
    else if (document.getElementById('statsOverlay').classList.contains('open')) closeStats();
    else if (zenMode) toggleZen();
  }
});

// Atajos globales de búsqueda (funcionan aunque el foco no esté en el editor)
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'k') {
    if (e.defaultPrevented) return;      // Ctrl+K con texto seleccionado en la vista previa = enlace
    e.preventDefault();
    if (cmdOverlay.classList.contains('open')) closeCmd(); else openCmd();
    return;
  }
  if (ctrl && e.key === 'f' && document.activeElement !== editor) {
    if (S.currentView === 'preview') return;
    e.preventDefault(); openFind(false);
  }
  if (ctrl && e.key === 'h' && document.activeElement !== editor) {
    if (S.currentView === 'preview') return;
    e.preventDefault(); openFind(true);
  }
});

// ═══════════════════════════════════════════════════
// SIDEBAR TOOLTIPS
// ═══════════════════════════════════════════════════
export const sbTooltip = document.getElementById('sb-tooltip');
document.querySelectorAll('.sb-btn[data-tip]').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    const rect = btn.getBoundingClientRect();
    sbTooltip.textContent = btn.getAttribute('data-tip');
    sbTooltip.style.left = (rect.right + 10) + 'px';
    sbTooltip.style.top = (rect.top + rect.height/2 - 11) + 'px';
    sbTooltip.style.opacity = '1';
  });
  btn.addEventListener('mouseleave', () => { sbTooltip.style.opacity = '0'; });
});

// Cierra el flyout del grupo tras pulsar una opción (aunque el ratón siga encima)
document.querySelectorAll('.sb-fly-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const fly = btn.closest('.sb-flyout');
    if (fly) {
      fly.style.visibility = 'hidden';
      fly.style.opacity = '0';
      setTimeout(() => { fly.style.visibility = ''; fly.style.opacity = ''; }, 250);
    }
  });
});
