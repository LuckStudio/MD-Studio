import { emit } from './events.ts';
import { editor } from './state.js';
import { canOpenFiles, pickFiles, pickFolder, pickSaveFile, stripMdExt } from './fs.js';
import { getActiveTab, renderTabs } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { updateModifiedIndicator } from './editor.js';
import { showToast } from './actions.js';
import { triggerImport } from './import.js';
import { addRecent, docMeta } from './recents.js';
import { setWorkspace } from './workspace.js';
import { flushPreviewEdits } from './preview-edit.js';
import { snapshotVersion } from './versions.js';
import { isHomeOpen, openRefs } from './home.js';

// ═══════════════════════════════════════════════════
// ABRIR / GUARDAR (sobre fs.js)
// ═══════════════════════════════════════════════════
export async function openFile() {
  if (!canOpenFiles) { triggerImport(); return; }
  // Desde la pantalla de inicio se abre en modo lectura; desde el editor se respeta la vista
  const fromHome = isHomeOpen();
  try {
    const refs = await pickFiles();
    await openRefs(refs, { view: fromHome ? 'preview' : undefined });
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Error al abrir: ' + e.message);
  }
}

export async function saveFile() {
  flushPreviewEdits();
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = editor.value;
  if (!tab.file) { await saveFileAs(); return; }

  try {
    if (!(await tab.file.permission('readwrite', true))) { showToast('⚠ Permiso de escritura denegado'); return; }
    // ¿Cambió el archivo en disco desde que lo leímos?
    const st = await tab.file.stat().catch(() => null);
    if (st && tab.diskMtime && st.mtime !== tab.diskMtime &&
        !confirm(`"${tab.file.name}" ha cambiado en el disco desde que lo abriste.\n¿Sobrescribirlo con tu versión?`)) return;
    tab.diskMtime = await tab.file.write(tab.content);
    markTabSaved(tab);
    showToast('✓ Guardado: ' + tab.file.name);
  } catch (e) {
    showToast('Error al guardar: ' + e.message);
  }
}

export async function saveFileAs() {
  flushPreviewEdits();
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = editor.value;

  if (!canOpenFiles) { downloadMD(); return; }
  try {
    const ref = await pickSaveFile(tab.name + '.md');
    if (!ref) return;
    tab.diskMtime = await ref.write(tab.content);
    tab.file = ref;
    tab.relPath = null;
    tab.name = stripMdExt(ref.name);
    addRecent(ref, docMeta(tab.content));
    markTabSaved(tab);
    showToast('✓ Guardado como: ' + ref.name);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Error al guardar: ' + e.message);
  }
}

export function markTabSaved(tab) {
  tab.savedContent = tab.content;
  tab.modified = false;
  renderTabs();
  updateModifiedIndicator();
  debouncedSaveToLS();
  emit('doc:saved', { tabId: tab.id });   // historial, destello de guardado e índice de la carpeta reaccionan
}

export function downloadMD() {
  flushPreviewEdits();
  const tab = getActiveTab();
  const name = (tab?.name || 'documento') + '.md';
  const content = editor.value;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Descargado como ' + name);
}

// ── Carpeta de trabajo ──
export async function openFolder() {
  if (!canOpenFiles) { showToast('Tu navegador no permite abrir carpetas (usa Chrome, Edge o la app de escritorio)'); return; }
  try {
    const dir = await pickFolder();
    if (dir) await setWorkspace(dir);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Error al abrir la carpeta: ' + e.message);
  }
}
