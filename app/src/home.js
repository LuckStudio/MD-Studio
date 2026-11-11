import { icon } from './icons.js';
import { S, editor } from './state.js';
import { stripMdExt, wrapHandle } from './fs.js';
import { createTab, escAttr, escHtml, getActiveTab, newTab, renderTabs, switchTab } from './tabs.js';
import { openFile } from './files.js';
import { showToast } from './actions.js';
import { setView } from './view.js';
import { closeMenu } from './menu.js';
import { initialMD } from './example.js';
import { addRecent, docMeta, listRecents, persistTabRefs, recentsSupported, removeRecent } from './recents.js';
import { setWorkspace } from './workspace.js';
import { applyPreviewEditable, endPreviewEdit } from './preview-edit.js';
import { tourSeen } from './tour.js';
import { ghostFade } from './motion.js';

// ═══════════════════════════════════════════════════
// PANTALLA DE INICIO
// ═══════════════════════════════════════════════════
export const homeEl = document.getElementById('home');

export function isHomeOpen() { return !homeEl.hidden; }

export function showHome() {
  endPreviewEdit();
  closeMenu();
  const resume = document.getElementById('homeResume');
  const info = document.getElementById('homeResumeInfo');
  const cur = getActiveTab();
  if (cur) cur.content = editor.value;
  const withContent = S.tabs.filter(t => t.content.trim() && !isPristineTab(t));
  resume.hidden = withContent.length === 0;
  if (withContent.length) {
    const names = withContent.slice(0, 2).map(t => t.name).join(', ');
    info.textContent = withContent.length > 2 ? `${names} y ${withContent.length - 2} más` : names;
  }
  updateHomeTip();
  renderRecents();
  homeEl.hidden = false;
  document.body.classList.add('home-open');
  applyPreviewEditable();
  const first = homeEl.querySelector('.home-card.primary');
  if (first) first.focus({ preventScroll: true });
}

export function hideHome() {
  if (homeEl.hidden) return;
  ghostFade(homeEl);
  homeEl.hidden = true;
  document.body.classList.remove('home-open');
  applyPreviewEditable();
  if (S.currentView !== 'preview') editor.focus();
}

// Una pestaña "virgen" (vacía o con el texto de bienvenida, sin archivo ni cambios)
// se descarta al abrir un documento, para no acumular pestañas inútiles.
export function isPristineTab(t) {
  return !t.file && !t.modified && (!t.content.trim() || t.content === initialMD);
}

// Abre uno o varios FileRef como pestañas.
// Usado por Abrir archivo, Recientes, carpeta de trabajo y apertura desde el sistema operativo.
export async function openRefs(refs, { view, relPath } = {}) {
  let opened = 0, lastName = '';
  for (const ref of refs) {
    try {
      const { text, mtime } = await ref.read();
      const name = stripMdExt(ref.name);

      // ¿Ya está abierto? (mismo archivo en disco, o mismo nombre sin archivo y mismo texto)
      let existing = null;
      for (const t of S.tabs) if (t.file && await t.file.isSame(ref)) { existing = t; break; }
      if (!existing) existing = S.tabs.find(t => !t.file && t.name === name && t.content === text) || null;

      if (existing) {
        existing.file = ref;
        if (relPath) existing.relPath = relPath;
        existing.diskMtime = existing.diskMtime || mtime;
        switchTab(existing.id);
      } else {
        const tab = createTab(name, text);
        tab.file = ref;
        tab.relPath = relPath || null;
        tab.diskMtime = mtime;
        tab.savedContent = text;
        tab.modified = false;
        renderTabs();
        switchTab(tab.id);
      }
      addRecent(ref, docMeta(text));
      lastName = ref.name;
      opened++;
    } catch (e) {
      if (e.name === 'NotFoundError') showToast(`✕ "${ref.name}" ya no existe`);
      else showToast('Error al abrir: ' + e.message);
    }
  }
  if (opened && view) setView(view);
  if (opened > 1) showToast(`✓ ${opened} archivos abiertos`);
  else if (opened === 1) showToast('✓ Abierto: ' + lastName);
  persistTabRefs();
  return opened;
}

// ── Recientes ──
export function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export async function renderRecents() {
  const section = document.getElementById('homeRecentsSection');
  if (!recentsSupported) { section.hidden = true; return; }
  section.hidden = false;
  const list = document.getElementById('homeRecents');
  const recents = await listRecents();
  document.getElementById('homeRecentsEmpty').hidden = recents.length > 0;
  document.getElementById('homeRecentsClear').hidden = recents.length === 0;
  list.innerHTML = '';
  for (const r of recents) {
    const li = document.createElement('li');
    li.className = 'home-rcard-wrap';
    const m = r.meta || {};
    const title = r.kind === 'dir' ? r.name : (m.title || stripMdExt(r.name));
    li.innerHTML = `
      <button class="home-rcard ${r.kind}" title="${escAttr((r.kind === 'dir' ? 'Abrir carpeta ' : 'Abrir ') + r.name + (r.ref.path ? ' · ' + r.ref.path : ''))}">
        <span class="rc-top"><span class="rc-ic">${r.kind === 'dir' ? icon('folder') : icon('file-text')}</span><span class="rc-time">${relTime(r.openedAt)}</span></span>
        <span class="rc-title">${escHtml(title)}</span>
        <span class="rc-excerpt">${escHtml(r.kind === 'dir' ? 'Carpeta de trabajo' : (m.excerpt || 'Sin vista previa'))}</span>
        <span class="rc-foot">${escHtml(r.name)}</span>
      </button>
      <button class="rc-del" title="Quitar de recientes" aria-label="Quitar ${escAttr(r.name)} de recientes">${icon('x')}</button>`;
    li.querySelector('.home-rcard').addEventListener('click', () => openRecent(r));
    li.querySelector('.rc-del').addEventListener('click', () => removeRecent(r.id));
    list.appendChild(li);
  }
  // Tarjeta de recorrido: solo hasta que se haya visto o descartado
  const tour = document.getElementById('homeTour');
  if (tour) tour.hidden = tourSeen();
}

export async function openRecent(record) {
  try {
    if (!(await record.ref.permission('read', true))) { showToast('Permiso denegado'); return; }
  } catch (e) {
    showToast('No se pudo acceder a ' + record.name); return;
  }
  if (record.kind === 'dir') { await setWorkspace(record.ref); return; }
  const n = await openRefs([record.ref], { view: 'preview' });
  if (!n && confirm(`No se pudo abrir "${record.name}". ¿Quitarlo de recientes?`)) removeRecent(record.id);
}

// ── Otras acciones de inicio ──
export async function pasteAsNewTab() {
  let text = '';
  try { text = await navigator.clipboard.readText(); }
  catch (e) { showToast('El navegador no permite leer el portapapeles'); return; }
  if (!text.trim()) { showToast('El portapapeles está vacío'); return; }
  const tab = createTab('pegado', text);
  tab.modified = true;
  renderTabs();
  switchTab(tab.id);
  showToast('✓ Markdown pegado en una pestaña nueva');
}

export function openExampleTab() {
  const tab = createTab('ejemplo', initialMD);
  tab.savedContent = initialMD;
  renderTabs();
  switchTab(tab.id);
}

export function updateHomeTip() {
  const tip = document.getElementById('homeTip');
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (standalone && 'launchQueue' in window) {
    tip.textContent = 'Para abrir .md con doble clic: clic derecho en un archivo .md → Abrir con → MD Studio → Usar siempre esta aplicación.';
  } else if (!standalone && location.protocol === 'file:') {
    tip.textContent = 'Abierto como archivo local. Sírvelo por HTTPS (o localhost) para poder instalarlo como aplicación.';
  } else if (!standalone) {
    tip.textContent = 'Instálala como aplicación para abrir los .md directamente desde el explorador de archivos.';
  } else {
    tip.textContent = '';
  }
}

// Atajos mientras el inicio está visible (el editor no tiene el foco)
document.addEventListener('keydown', e => {
  if (!isHomeOpen()) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); }
  else if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); newTab(); }
  else if (e.key === 'Escape' && !document.getElementById('settingsDrawer').classList.contains('open')) {
    e.preventDefault(); hideHome();
  }
});

// ── Apertura desde el sistema operativo ("Abrir con → MD Studio") ──
// PWA instalada (Chrome/Edge): los archivos llegan por launchQueue.
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async params => {
    if (!params.files || !params.files.length) return;
    await openRefs(params.files.map(wrapHandle), { view: 'preview' });
  });
}
