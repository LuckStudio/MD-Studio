import { previewEditEnabled, syncEditorToBlock } from './preview-edit.js';
import { S, cursorPos, editor, preview } from './state.js';
import { closeActiveTab, getActiveTab, newTab, renderTabs } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { openFile, saveFile, saveFileAs } from './files.js';
import { refreshHighlight, renderLight, scheduleHeavy, updatePreview } from './render.js';
import { flashElement } from './preview-sync.js';
import { redo, saveToUndo, scheduleUndo, undo } from './history.js';
import { openFind } from './find.js';
import { showToast, wrap } from './actions.js';
import { flashEditorRange, getCaretCoords, getHeadings, scrollEditorToPos } from './view.js';
import { openCmd } from './commands.js';

// ═══════════════════════════════════════════════════
// EDITOR EVENTS
// ═══════════════════════════════════════════════════
editor.addEventListener('input', () => {
  scheduleUndo();     // snapshot agrupado, no clona en cada tecla
  renderLight();      // contadores al instante
  refreshHighlight(); // resaltado al instante: es lo que hace VISIBLE el texto
  scheduleHeavy();    // solo el parseo de la PREVIEW va agrupado (~130ms)
  markTabModified();
  debouncedSaveToLS();
});

editor.addEventListener('keyup', updateCursor);
editor.addEventListener('click', () => {
  updateCursor();
  if (S.syncScrollEnabled) syncEditorClickToPreview();
});

// Al hacer clic/seleccionar en el editor, busca esa palabra/frase en la preview
export function syncEditorClickToPreview() {
  if (S.currentView !== 'split') return;
  // Con la vista previa editable no se insertan marcas en ella: se desplaza al bloque y se resalta
  if (previewEditEnabled()) { syncEditorToBlock(editor.selectionStart); return; }
  const start = editor.selectionStart, end = editor.selectionEnd;
  let term, termStart;
  if (end > start) {
    // Hay selección explícita
    term = editor.value.substring(start, end).trim();
    termStart = start;
  } else {
    // Sin selección: palabra bajo el cursor + su posición de inicio
    const w = wordRangeAt(editor.value, start);
    term = w.word;
    termStart = w.start;
  }
  if (!term || term.length < 2) {
    syncEditorHeadingToPreview(start);
    return;
  }
  // Cuenta cuántas veces aparece el término ANTES de su propio inicio
  const lower = editor.value.toLowerCase();
  const t = term.toLowerCase();
  let occurrence = 0, p = lower.indexOf(t);
  while (p !== -1 && p < termStart) { occurrence++; p = lower.indexOf(t, p + 1); }
  // Localiza esa misma ocurrencia en la preview
  const found = highlightTermInPreview(term, occurrence);
  if (!found) {
    // reintenta con la primera ocurrencia antes de caer al encabezado
    if (occurrence > 0 && highlightTermInPreview(term, 0)) { flashEditorRange(termStart, termStart + term.length); return; }
    syncEditorHeadingToPreview(start);
    return;
  }
  // Resalta también en el propio editor para verlo en ambos paneles a la vez
  flashEditorRange(termStart, termStart + term.length);
}

// Devuelve {word, start} de la palabra que rodea un offset
export function wordRangeAt(text, offset) {
  if (!text) return { word:'', start:offset };
  const left = text.slice(0, offset).match(/[\wÀ-ÿ]+$/);
  const right = text.slice(offset).match(/^[\wÀ-ÿ]+/);
  const word = ((left ? left[0] : '') + (right ? right[0] : ''));
  const start = left ? offset - left[0].length : offset;
  return { word, start };
}

// Resalta la ocurrencia N de un término dentro de la preview (mark temporal + scroll)
export function highlightTermInPreview(term, occurrence) {
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, null);
  let node, count = 0;
  const t = term.toLowerCase();
  while ((node = walker.nextNode())) {
    // no resaltar dentro de un mark previo
    if (node.parentElement && node.parentElement.classList && node.parentElement.classList.contains('sync-mark')) continue;
    const txt = node.textContent.toLowerCase();
    let idx = txt.indexOf(t);
    while (idx !== -1) {
      if (count === occurrence) {
        try {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + term.length);
          // envuelve la coincidencia en un <mark> temporal
          const mark = document.createElement('mark');
          mark.className = 'sync-mark';
          range.surroundContents(mark);
          mark.scrollIntoView({ behavior:'smooth', block:'center' });
          setTimeout(() => unwrapSyncMark(mark), 2000);
        } catch(e) {
          // surroundContents falla si el rango cruza nodos: cae al flash del bloque
          const block = node.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th') || node.parentElement;
          if (block) { block.scrollIntoView({ behavior:'smooth', block:'center' }); flashElement(block); }
        }
        return true;
      }
      count++;
      idx = txt.indexOf(t, idx + 1);
    }
  }
  return false;
}

// Quita el <mark> temporal y reunifica el texto (evita corromper el markdown)
export function unwrapSyncMark(mark) {
  if (!mark || !mark.parentNode) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize(); // fusiona nodos de texto adyacentes
}

// Limpia cualquier mark de sincronización que quede (p.ej. antes de editar)
export function clearSyncMarks() {
  preview.querySelectorAll('mark.sync-mark').forEach(unwrapSyncMark);
}
export function syncEditorHeadingToPreview(pos) {
  const headings = getHeadings();
  if (!headings.length) return;
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos <= pos) idx = i; else break;
  }
  if (idx < 0) return;
  const hs = preview.querySelectorAll('h1,h2,h3,h4,h5,h6');
  const target = hs[idx];
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  flashElement(target);
}

editor.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.substring(0,s) + '  ' + editor.value.substring(en);
    editor.selectionStart = editor.selectionEnd = s + 2;
    saveToUndo(); updatePreview();
  }
  if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
  if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
  if (ctrl && e.key === 's' && !e.shiftKey) { e.preventDefault(); saveFile(); }
  if (ctrl && e.key === 's' && e.shiftKey) { e.preventDefault(); saveFileAs(); }
  if (ctrl && e.key === 'b') { e.preventDefault(); wrap('**','**'); }
  if (ctrl && e.key === 'i') { e.preventDefault(); wrap('*','*'); }
  if (ctrl && e.key === 'n') { e.preventDefault(); newTab(); }
  if (ctrl && e.key === 'o') { e.preventDefault(); openFile(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); closeActiveTab(); }
  if (ctrl && e.key === 'f') { e.preventDefault(); openFind(false); }
  if (ctrl && (e.key === 'h' || (e.key === 'f' && e.altKey))) { e.preventDefault(); openFind(true); }
  if (ctrl && e.key === 'k') { e.preventDefault(); openCmd(); }
  if (ctrl && e.key === 'g') { e.preventDefault(); goToLine(); }
});

export function updateCursor() {
  const val = editor.value.substring(0, editor.selectionStart);
  const lines = val.split('\n');
  cursorPos.textContent = `Ln ${lines.length}, Col ${lines[lines.length-1].length + 1}`;
  updateCurrentLineHighlight();
}

// Mueve la banda de resaltado a la línea visual del cursor
export function updateCurrentLineHighlight() {
  const el = document.getElementById('currentLineHighlight');
  if (!el) return;
  const coords = getCaretCoords(editor.selectionStart);
  if (!coords) return;
  const lh = coords.height || (parseFloat(getComputedStyle(editor).lineHeight) || 25);
  el.style.top = (coords.top - editor.scrollTop) + 'px';
  el.style.height = lh + 'px';
}

// Ir a una línea concreta (Ctrl+G)
export function goToLine() {
  const total = editor.value.split('\n').length;
  const input = prompt(`Ir a línea (1–${total}):`);
  if (input == null) return;
  const n = parseInt(input, 10);
  if (isNaN(n) || n < 1) { showToast('Número de línea no válido'); return; }
  const target = Math.min(n, total);
  const lines = editor.value.split('\n');
  let pos = 0;
  for (let i = 0; i < target - 1; i++) pos += lines[i].length + 1;
  scrollEditorToPos(pos, lines[target-1] ? lines[target-1].length : 0);
  showToast(`→ Línea ${target}`);
}

export function markTabModified() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = editor.value;
  const wasModified = tab.modified;
  tab.modified = tab.content !== tab.savedContent;
  if (wasModified !== tab.modified) {
    renderTabs();
    updateModifiedIndicator();
  }
}

export function updateModifiedIndicator() {
  const tab = getActiveTab();
  const el = document.getElementById('modifiedIndicator');
  if (tab?.modified) {
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}
