import { routeToPreview, pvWrap, pvInsertBlock, pvHeading } from './preview-edit.js';
import { editor } from './state.js';
import { getActiveTab, renderTabs } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { updatePreview } from './render.js';
import { saveToUndo } from './history.js';
import { markTabModified, updateModifiedIndicator } from './editor.js';
import { initialMD } from './example.js';
import { flushPreviewEdits } from './preview-edit.js';

// ═══════════════════════════════════════════════════
// WRAP & INSERT
// ═══════════════════════════════════════════════════
export function wrap(before, after) {
  if (routeToPreview()) { pvWrap(before); return; }
  const s = editor.selectionStart, e = editor.selectionEnd;
  const sel = editor.value.substring(s, e) || 'texto';
  const repl = before + sel + after;
  editor.value = editor.value.substring(0,s) + repl + editor.value.substring(e);
  editor.selectionStart = s + before.length;
  editor.selectionEnd   = s + before.length + sel.length;
  editor.focus();
  saveToUndo(); updatePreview(); markTabModified(); debouncedSaveToLS();
}

export const blocks = {
  link:       () => '[Texto del enlace](https://url.com)',
  image:      () => '![Descripción](https://url-imagen.com)',
  ul:         () => '- Elemento uno\n- Elemento dos\n- Elemento tres',
  ol:         () => '1. Primero\n2. Segundo\n3. Tercero',
  task:       () => '- [ ] Tarea pendiente\n- [x] Tarea completada',
  blockquote: () => '> "Una cita memorable."',
  code:       () => '```js\n// Tu código aquí\nconsole.log("Hola Claude");\n```',
  table:      () => '| Columna A | Columna B | Columna C |\n|-----------|-----------|----------|\n| Dato 1    | Dato 2    | Dato 3   |\n| Dato 4    | Dato 5    | Dato 6   |',
  hr:         () => '\n---\n',
};

export function insertBlock(type) {
  if (routeToPreview()) { pvInsertBlock(type, blocks[type]); return; }
  const snip = blocks[type]();
  const s = editor.selectionStart;
  const before = editor.value.substring(0, s);
  const after  = editor.value.substring(s);
  const prefix = (before.length && !before.endsWith('\n')) ? '\n\n' : '';
  const suffix = (!after.startsWith('\n')) ? '\n\n' : '\n';
  editor.value = before + prefix + snip + suffix + after;
  editor.selectionStart = editor.selectionEnd = s + prefix.length + snip.length + suffix.length;
  editor.focus();
  saveToUndo(); updatePreview(); markTabModified(); debouncedSaveToLS();
}

export function insertHeading(level) {
  if (!level) return;
  if (routeToPreview()) { pvHeading(level); return; }
  const s = editor.selectionStart;
  const line_start = editor.value.lastIndexOf('\n', s - 1) + 1;
  const prefix = '#'.repeat(+level) + ' ';
  editor.value = editor.value.substring(0, line_start) + prefix + editor.value.substring(line_start);
  editor.focus();
  saveToUndo(); updatePreview(); markTabModified(); debouncedSaveToLS();
}

// ═══════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════
export function copyMD() {
  flushPreviewEdits();
  navigator.clipboard.writeText(editor.value).then(() => showToast('✓ Copiado al portapapeles'));
}

export function clearEditor() {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.content.trim() && !confirm('¿Borrar todo el contenido y limpiar el almacenamiento local? Esta acción no se puede deshacer.')) return;
  tab.content = ''; tab.savedContent = ''; tab.modified = false;
  editor.value = '';
  updatePreview();
  renderTabs();
  updateModifiedIndicator();
  try { localStorage.removeItem('claudemd_v3'); } catch(e) {}
  showToast('✓ Limpiado y almacenamiento borrado');
}

export function showExample() {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.content.trim() && !confirm('¿Reemplazar el contenido actual con el ejemplo?')) return;
  saveToUndo();
  editor.value = initialMD;
  updatePreview();
  markTabModified();
  debouncedSaveToLS();
  showToast('✓ Ejemplo cargado');
}

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}
