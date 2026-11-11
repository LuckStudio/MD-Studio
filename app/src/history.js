import { routeToPreview, pvUndoRedo } from './preview-edit.js';
import { editor } from './state.js';
import { getActiveTab } from './tabs.js';
import { updatePreview } from './render.js';

// ═══════════════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════════════
export function saveToUndo() {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.undoStack[tab.undoStack.length-1] !== editor.value) {
    tab.undoStack.push(editor.value);
    if (tab.undoStack.length > 200) tab.undoStack.shift();
    tab.redoStack = [];
  }
}

// Snapshot de undo agrupado: agenda guardar el estado tras una pausa al teclear,
// evitando clonar el documento completo en cada pulsación.
export let _undoTimer = null;
export function scheduleUndo() {
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(saveToUndo, 350);
}

export function undo() {
  if (routeToPreview()) { pvUndoRedo(false); return; }
  undoCore();
}
export function redo() {
  if (routeToPreview()) { pvUndoRedo(true); return; }
  redoCore();
}
// Versiones sin enrutar (las usa pvUndoRedo para no entrar en bucle)
export function undoCore() {
  const tab = getActiveTab();
  if (!tab) return;
  // consolida cualquier cambio reciente aún sin snapshot
  clearTimeout(_undoTimer); saveToUndo();
  if (tab.undoStack.length <= 1) return;
  tab.redoStack.push(tab.undoStack.pop());
  editor.value = tab.undoStack[tab.undoStack.length-1];
  updatePreview();
}

export function redoCore() {
  const tab = getActiveTab();
  if (!tab || !tab.redoStack.length) return;
  const val = tab.redoStack.pop();
  tab.undoStack.push(val);
  editor.value = val;
  updatePreview();
}
