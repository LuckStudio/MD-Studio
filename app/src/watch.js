import { S, editor } from './state.js';
import { getActiveTab, renderTabs } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { updatePreview } from './render.js';
import { updateModifiedIndicator } from './editor.js';
import { showToast } from './actions.js';
import { showDiff } from './diff.js';
import { snapshotVersion } from './versions.js';

// ═══════════════════════════════════════════════════
// CAMBIOS EXTERNOS (el archivo se modifica fuera de la app)
// ═══════════════════════════════════════════════════
// Sondeo ligero de la fecha de modificación de cada pestaña con archivo. No hay API
// de "observar archivos" estándar en el navegador, y el sondeo funciona en cualquier navegador.
//  · pestaña sin cambios propios → se recarga sola;
//  · pestaña con cambios propios → barra de conflicto (recargar / conservar / ver diferencias).
export const conflictBar = document.getElementById('conflictBar');
export const WATCH_MS = 2500;
export let _watching = false;

export async function checkExternalChanges() {
  if (_watching || document.visibilityState !== 'visible') return;
  _watching = true;
  try {
    for (const tab of S.tabs) {
      if (!tab.file || tab.conflict) continue;
      let st;
      try {
        if (!(await tab.file.permission('read', false))) continue;   // sin permiso: no se molesta
        st = await tab.file.stat();
      } catch (e) { continue; }                                      // borrado o inaccesible
      if (!tab.diskMtime) { tab.diskMtime = st.mtime; continue; }
      if (st.mtime === tab.diskMtime) continue;

      const dirty = tab.id === S.activeTabId ? editor.value !== tab.savedContent : tab.content !== tab.savedContent;
      if (!dirty) await reloadTabFromDisk(tab, true);
      else { tab.conflict = true; if (tab.id === S.activeTabId) showConflictBar(); }
    }
  } finally { _watching = false; }
}

export async function reloadTabFromDisk(tab, quiet) {
  const { text, mtime } = await tab.file.read();
  tab.diskMtime = mtime;
  tab.conflict = false;
  if (text === tab.savedContent && !quiet) return;
  tab.content = text;
  tab.savedContent = text;
  tab.modified = false;
  if (tab.id === S.activeTabId) {
    const sTop = document.querySelector('.preview-scroll')?.scrollTop || 0;
    const eTop = editor.scrollTop;
    const caret = Math.min(editor.selectionStart, text.length);
    editor.value = text;
    editor.setSelectionRange(caret, caret);
    updatePreview();
    editor.scrollTop = eTop;
    const ps = document.querySelector('.preview-scroll'); if (ps) ps.scrollTop = sTop;
    updateModifiedIndicator();
  }
  renderTabs();
  hideConflictBar();
  showToast('↻ ' + tab.file.name + ' actualizado desde el disco');
  debouncedSaveToLS();
}

export function showConflictBar() {
  const tab = getActiveTab();
  if (!tab || !tab.conflict) { hideConflictBar(); return; }
  document.getElementById('conflictName').textContent = tab.file ? tab.file.name : tab.name;
  conflictBar.hidden = false;
}
export function hideConflictBar() { conflictBar.hidden = true; }

export async function conflictReload() {
  const tab = getActiveTab();
  if (tab) await snapshotVersion(tab, 'antes de recargar');
  if (tab && tab.file) await reloadTabFromDisk(tab, true);
}
export function conflictKeep() {
  const tab = getActiveTab();
  if (!tab || !tab.file) return;
  // Se da por vista la versión del disco: el siguiente Guardar sobrescribe sin volver a preguntar
  tab.file.stat().then(st => { tab.diskMtime = st.mtime; tab.conflict = false; hideConflictBar(); showToast('Se conserva tu versión; se sobrescribirá al guardar'); });
}
export async function conflictDiff() {
  const tab = getActiveTab();
  if (!tab || !tab.file) return;
  const { text } = await tab.file.read();
  showDiff({ before: text, after: editor.value, labelBefore: 'En el disco', labelAfter: 'Tu versión', canSave: false });
}

setInterval(checkExternalChanges, WATCH_MS);
window.addEventListener('focus', checkExternalChanges);
document.addEventListener('visibilitychange', checkExternalChanges);
