import { previewEditEnabled, syncBlockToEditor } from './preview-edit.js';
import { S, cc, editor, preview, tk, wc } from './state.js';
import { saveFile } from './files.js';
import { estimateTokens } from './stats.js';
import { scrollEditorToPos } from './view.js';

// ═══════════════════════════════════════════════════
// VISTA PREVIA (solo lectura)
// ═══════════════════════════════════════════════════
// La edición directa en la vista previa se eliminó: la conversión HTML→Markdown
// podía descuadrar el documento. La preview es ahora solo para visualizar.

// Al hacer clic/seleccionar en la preview, salta a esa parte en el editor
preview.addEventListener('click', (e) => {
  if (!S.syncScrollEnabled) return;
  if (previewEditEnabled()) { syncBlockToEditor(e.target); return; }   // al editar, el clic solo coloca el cursor
  syncPreviewToEditor();
});

// Toma la selección (o palabra bajo el cursor) en la preview y salta a ella en el editor
export function syncPreviewToEditor() {
  if (S.currentView !== 'split') return;
  const sel = window.getSelection();
  let term = sel && sel.toString().trim();
  // Si no hay selección, usa la palabra donde se hizo clic
  if (!term && sel && sel.anchorNode) {
    term = wordAtOffset(sel.anchorNode.textContent || '', sel.anchorOffset);
  }
  if (!term || term.length < 2) return;
  const idx = findTermInEditor(term, sel);
  if (idx < 0) return;
  scrollEditorToPos(idx, term.length);
  flashPreviewSelection();
}

// Extrae la palabra que rodea un offset dentro de un texto
export function wordAtOffset(text, offset) {
  if (!text) return '';
  const left = text.slice(0, offset).match(/[\wÀ-ÿ]+$/);
  const right = text.slice(offset).match(/^[\wÀ-ÿ]+/);
  return ((left ? left[0] : '') + (right ? right[0] : '')).trim();
}

// Busca un término en el editor. Usa el contexto de la preview para elegir
// la ocurrencia correcta cuando hay varias iguales.
export function findTermInEditor(term, sel) {
  const text = editor.value;
  // Cuántas veces aparece el término antes del punto de clic en la preview
  let occurrence = 0;
  if (sel && sel.anchorNode) {
    const previewText = preview.textContent;
    const clickedText = getPreviewOffset(sel);
    if (clickedText >= 0) {
      const haystack = previewText.slice(0, clickedText).toLowerCase();
      const t = term.toLowerCase();
      let p = haystack.indexOf(t);
      while (p !== -1) { occurrence++; p = haystack.indexOf(t, p + 1); }
    }
  }
  // Encuentra esa misma ocurrencia (o la primera) en el editor
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let pos = lower.indexOf(t), count = 0;
  let firstPos = pos;
  while (pos !== -1) {
    if (count === occurrence) return pos;
    count++;
    pos = lower.indexOf(t, pos + 1);
  }
  return firstPos; // si no cuadra la ocurrencia, salta a la primera
}

// Calcula el offset de texto plano del punto de selección dentro de la preview
export function getPreviewOffset(sel) {
  try {
    const range = document.createRange();
    range.setStart(preview, 0);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
  } catch(e) { return -1; }
}

// Destello sobre el texto seleccionado en la preview
export function flashPreviewSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) {
    // sin selección: destella el bloque contenedor
    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const block = el && el.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th');
    if (block) flashElement(block);
    return;
  }
  // hay selección: la propia selección del navegador ya la marca visualmente
}

export function flashElement(el) {
  if (!el) return;
  el.classList.remove('flash-target');
  void el.offsetWidth;
  el.classList.add('flash-target');
  setTimeout(() => el.classList.remove('flash-target'), 2000);
}

// Prevent preview contenteditable from getting focus when in editor-only mode
preview.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
});

export function updateStats() {
  const val = editor.value;
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  wc.textContent = words;
  cc.textContent = val.length;
  tk.textContent = estimateTokens(val);
}
