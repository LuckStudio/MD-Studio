import { S } from './state.js';
import { MD_EXT, refsFromDrop } from './fs.js';
import { createTab, renderTabs, switchTab } from './tabs.js';
import { alignHighlightWidth, syncHighlightScroll, syntaxHighlightEnabled } from './render.js';
import { showToast } from './actions.js';
import { setWorkspace } from './workspace.js';
import { isHomeOpen, openRefs } from './home.js';

// ═══════════════════════════════════════════════════
// DRAG DIVIDER
// ═══════════════════════════════════════════════════
export const divider = document.getElementById('divider');
export const workspace = document.getElementById('workspace');
export let dragging = false;

divider.addEventListener('mousedown', e => { dragging = true; divider.classList.add('dragging'); e.preventDefault(); });
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const rect = workspace.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width * 100;
  const clamped = Math.max(20, Math.min(80, pct));
  document.getElementById('editorPanel').style.flex = `0 0 ${clamped}%`;
  document.getElementById('previewPanel').style.flex = `0 0 ${100-clamped-0.3}%`;
  if (syntaxHighlightEnabled) { alignHighlightWidth(); syncHighlightScroll(); }
});
document.addEventListener('mouseup', () => { dragging = false; divider.classList.remove('dragging'); });

// ═══════════════════════════════════════════════════
// IMPORT FILE
// ═══════════════════════════════════════════════════
export function triggerImport() { document.getElementById('fileImport').click(); }

export function handleFileImport(event) {
  const files = Array.from(event.target.files);
  files.forEach(loadFileAsTab);
  event.target.value = '';
}

export function loadFileAsTab(file) {
  if (!file) return;
  const allowed = ['.md','.markdown','.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) { showToast('⚠ Solo .md, .markdown o .txt'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const content = e.target.result;
    const name = file.name.replace(/\.(md|markdown|txt)$/i, '');
    const existing = S.tabs.find(t => t.name === name);
    if (existing) {
      if (!confirm(`La pestaña "${name}" ya existe. ¿Reemplazar su contenido?`)) return;
      existing.content = content;
      switchTab(existing.id);
      return;
    }
    const tab = createTab(name, content);
    tab.savedContent = content;
    tab.modified = false;
    renderTabs();
    switchTab(tab.id);
    showToast('✓ Importado: ' + file.name);
  };
  reader.onerror = () => showToast('✕ Error al leer el archivo');
  reader.readAsText(file, 'UTF-8');
}

// ═══════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════
export const dropOverlay = document.getElementById('dropOverlay');
S.dragCounter = 0;
document.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { S.dragCounter++; dropOverlay.classList.add('active'); } });
document.addEventListener('dragleave', e => { S.dragCounter--; if (S.dragCounter <= 0) { S.dragCounter=0; dropOverlay.classList.remove('active'); } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  S.dragCounter = 0;
  dropOverlay.classList.remove('active');
  const fromHome = isHomeOpen();
  // Con FileRef (Chrome/Edge) se puede guardar encima y entra en recientes.
  // Una carpeta soltada se abre como carpeta de trabajo.
  const dropped = Array.from(e.dataTransfer.files);   // el DataTransfer deja de ser válido tras el evento
  refsFromDrop(e.dataTransfer).then(async refs => {
    if (!refs.length) { dropped.forEach(loadFileAsTab); return; }
    const dirs = refs.filter(r => r.kind === 'dir');
    const files = refs.filter(r => r.kind === 'file' && MD_EXT.test(r.name));
    if (dirs.length) await setWorkspace(dirs[0]);
    if (files.length) await openRefs(files, { view: fromHome ? 'preview' : undefined });
    else if (!dirs.length) showToast('⚠ Solo .md, .markdown o .txt');
  });
});
