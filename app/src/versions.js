import { on } from './events.ts';
import { S, editor } from './state.js';
import { escHtml, getActiveTab } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { refreshHighlight, renderLight, updatePreview } from './render.js';
import { saveToUndo } from './history.js';
import { markTabModified } from './editor.js';
import { showToast } from './actions.js';
import { idb } from './recents.js';
import { wsFolder } from './workspace.js';
import { flushPreviewEdits } from './preview-edit.js';
import { diffBodyHTML, diffText } from './diff.js';
import { updateClaudeStatus } from './claude.js';

// ═══════════════════════════════════════════════════
// HISTORIAL DE VERSIONES (por archivo, en IndexedDB)
// ═══════════════════════════════════════════════════
// Se guarda una copia al guardar, cada pocos minutos si hay cambios y antes de acciones que
// podrían perder texto (restaurar, recargar del disco). Se comparan con el texto actual y se
// pueden restaurar. Máximo 60 versiones por archivo.
export const VERSIONS_MAX = 60;
export const VERSION_AUTO_MS = 3 * 60 * 1000;
export const VERSION_MAX_BYTES = 1_500_000;

// Clave estable del documento: ruta dentro de la carpeta, o nombre de archivo, o nombre de la pestaña
export function docKey(tab) {
  if (tab.relPath && wsFolder) return 'ws:' + wsFolder.name + '/' + tab.relPath.join('/');
  if (tab.file) return 'file:' + tab.file.name;
  return 'tab:' + tab.name;
}

export async function listVersions(key) {
  if (!('indexedDB' in window)) return [];
  try {
    const all = (await idb('versions', 'readonly', s => s.index('key').getAll(key))) || [];
    return all.sort((a, b) => b.t - a.t);
  } catch (e) { return []; }
}

export async function snapshotVersion(tab, reason) {
  if (!tab || !('indexedDB' in window)) return;
  const content = tab.id === S.activeTabId ? editor.value : tab.content;
  if (!content.trim() || content.length > VERSION_MAX_BYTES) return;
  const key = docKey(tab);
  try {
    const list = await listVersions(key);
    if (list[0] && list[0].content === content) return;           // sin cambios desde la última copia
    await idb('versions', 'readwrite', s => s.add({ key, t: Date.now(), reason, content, words: (content.match(/\S+/g) || []).length }));
    for (const v of list.slice(VERSIONS_MAX - 1)) await idb('versions', 'readwrite', s => s.delete(v.id));
  } catch (e) { console.warn('Historial no disponible:', e); }
}

// Copia automática periódica de la pestaña activa si tiene cambios sin guardar
setInterval(() => {
  const tab = getActiveTab();
  if (tab && tab.modified && document.visibilityState === 'visible') snapshotVersion(tab, 'automática');
}, VERSION_AUTO_MS);

// ── Interfaz ──
export const histOverlay = document.getElementById('histOverlay');
export const histList = document.getElementById('histList');
export const histDiff = document.getElementById('histDiff');
export let _histVersions = [], _histSel = null;

export async function openHistory() {
  flushPreviewEdits();
  const tab = getActiveTab();
  if (!tab) return;
  document.getElementById('histDoc').textContent = tab.name + '.md';
  _histVersions = await listVersions(docKey(tab));
  _histSel = null;
  histOverlay.classList.add('open');
  renderHistList();
  if (_histVersions.length) selectVersion(_histVersions[0].id);
  else histDiff.innerHTML = '<p class="cl-none">Aún no hay versiones de este documento.<br>Se guardan al pulsar Guardar y cada pocos minutos mientras editas.</p>';
}
export function closeHistory() { histOverlay.classList.remove('open'); }

export function renderHistList() {
  histList.innerHTML = '';
  _histVersions.forEach(v => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'hist-item' + (v.id === _histSel ? ' sel' : '');
    b.dataset.id = v.id;
    b.innerHTML = `<span class="hi-time">${escHtml(new Date(v.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>` +
                  `<span class="hi-meta">${escHtml(v.reason)} · ${v.words} palabras</span>`;
    b.addEventListener('click', () => selectVersion(v.id));
    li.appendChild(b); histList.appendChild(li);
  });
}

export function selectVersion(id) {
  _histSel = id;
  const v = _histVersions.find(x => x.id === id);
  if (!v) return;
  histList.querySelectorAll('.hist-item').forEach(b => b.classList.toggle('sel', +b.dataset.id === id));
  const r = diffText(v.content, editor.value);
  document.getElementById('histSummary').innerHTML =
    `<span class="df-add">+${r.added}</span> <span class="df-del">−${r.removed}</span> · esta versión → actual`;
  histDiff.innerHTML = diffBodyHTML(r);
  document.getElementById('histRestore').disabled = false;
}

export async function restoreSelectedVersion() {
  const v = _histVersions.find(x => x.id === _histSel);
  const tab = getActiveTab();
  if (!v || !tab) return;
  await snapshotVersion(tab, 'antes de restaurar');
  saveToUndo();
  editor.value = v.content;
  S.previewEditing = false;
  updatePreview(); renderLight(); refreshHighlight(); markTabModified(); updateClaudeStatus(); debouncedSaveToLS();
  closeHistory();
  showToast('✓ Versión restaurada (Ctrl+Z para deshacer)');
}

on('doc:saved', ({ tabId }) => { const t = S.tabs.find(x => x.id === tabId); if (t) snapshotVersion(t, 'guardado'); });