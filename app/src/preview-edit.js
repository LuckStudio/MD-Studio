import { undoCore, redoCore } from './history.js';
import { insertBlockAfter } from './blocks.js';
import { insertImageFromPicker } from './images.js';
import { blocks } from './actions.js';
import { reducedMotion } from './motion.js';
import { on } from './events.ts';
import { getTurndown, renderMdFragment } from './markdown.js';
import { S, editor, preview } from './state.js';
import { debouncedSaveToLS } from './storage.js';
import { refreshHighlight, renderLight, updatePreview } from './render.js';
import { redo, saveToUndo, undo } from './history.js';
import { clearSyncMarks, markTabModified } from './editor.js';
import { showToast } from './actions.js';
import { renderTOC, tocOpen } from './view.js';
import { saveSettings, settings } from './settings.js';
import { ensureSourceButtons } from './blocks.js';
import { updateClaudeStatus } from './claude.js';
import { isHomeOpen } from './home.js';

// ═══════════════════════════════════════════════════
// EDICIÓN DIRECTA EN LA VISTA PREVIA
// ═══════════════════════════════════════════════════
// En la vista "Solo previsualización" cada bloque (párrafo, título, lista, tabla, cita, código…)
// se puede escribir como en un procesador de texto. Cómo se mantiene fiel el Markdown:
//
//  · parseMarkdown() envuelve cada bloque en <div class="md-blk" data-s data-e> con su posición
//    en el texto fuente;
//  · al editar un bloque SOLO se convierte ese bloque de HTML a Markdown (turndown) y se
//    sustituye su trozo [s,e) del texto: el resto del documento no se toca ni un carácter;
//  · los bloques que no se pueden reconstruir con garantías (HTML en bruto, fórmulas en bloque,
//    diagramas) quedan de solo lectura: se editan en el editor.
//
// Mientras se escribe no se vuelve a pintar la vista (el cursor no se mueve); al salir del
// documento se repinta una vez para normalizar (colores del código, ids, etc.).

export const pvDirty = new Set();          // bloques con cambios sin pasar al Markdown
// Un bloque tocado ya no equivale a su HTML original: no debe reutilizarse al repintar (ver patchPreview)
export function pvTouch(blk) { blk._html = undefined; pvDirty.add(blk); }
export let _pvTimer = null;
export const PV_COMMIT_MS = 350;
export const fmtBar = document.getElementById('fmtBar');
export const fmtLink = document.getElementById('fmtLink');
export let _fmtRange = null;

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignorar */ }

export function previewEditEnabled() {
  return settings.previewEdit !== false && S.currentView !== 'editor' &&
         !document.body.classList.contains('reader') && !isHomeOpen();
}

// Activa/desactiva contenteditable según la vista. Se llama tras cada pintado y al cambiar de vista.
export function applyPreviewEditable() {
  clearSyncMarks();
  const on = previewEditEnabled();
  document.body.classList.toggle('pv-edit', on);
  const toggle = document.getElementById('pvEditToggle');
  if (toggle) {
    toggle.hidden = S.currentView === 'editor';   // en «Solo editor» la vista previa no se ve
    toggle.removeAttribute('aria-label');
    toggle.classList.toggle('on', settings.previewEdit !== false);
    toggle.textContent = settings.previewEdit !== false ? '✎ Edición directa: sí' : '✎ Edición directa: no';
  }
  preview.querySelectorAll('.md-blk').forEach(b => {
    const editable = on && !b.dataset.ro;
    if (editable) {
      b.setAttribute('contenteditable', 'true');
      b.spellcheck = true;
      b._raw = editor.value.slice(+b.dataset.s, +b.dataset.e);
      // Los elementos generados por la vista (no son contenido) no se pueden editar
      b.querySelectorAll('.callout-title, .code-copy, .math-inline').forEach(x => x.setAttribute('contenteditable', 'false'));
      b.querySelectorAll('input[type=checkbox]').forEach(c => { c.disabled = false; });
    } else {
      b.removeAttribute('contenteditable');
      b.querySelectorAll('input[type=checkbox]').forEach(c => { c.disabled = true; });
    }
  });
  if (!on) hideFmtBar();
  ensureSourceButtons();
}

export function togglePreviewEdit() {
  endPreviewEdit();
  settings.previewEdit = settings.previewEdit === false;
  saveSettings();
  applyPreviewEditable();
  const sw = document.getElementById('peSwitch');
  if (sw) sw.classList.toggle('on', settings.previewEdit !== false);
  showToast(settings.previewEdit !== false ? '✎ Edición directa activada' : '🔒 Vista previa de solo lectura');
}

// ── Bloque → Markdown ──
export function blockToMarkdown(blk) {
  const clone = blk.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('.code-copy, .callout-title').forEach(x => x.remove());
  // En el código, el navegador inserta <br> al pulsar Enter: se vuelven saltos de línea reales
  clone.querySelectorAll('pre br').forEach(br => br.replaceWith('\n'));
  // En las celdas de una tabla un salto de línea rompería la fila: los <br> de relleno se quitan
  clone.querySelectorAll('td br, th br').forEach(br => br.remove());
  // Las fórmulas en línea se guardan como $…$ (el HTML de KaTeX no sirve); se protegen de turndown
  const maths = [];
  clone.querySelectorAll('.math-inline').forEach(el => {
    maths.push(el.dataset.tex || '');
    el.replaceWith(document.createTextNode('\u0001M' + (maths.length - 1) + '\u0002'));
  });
  let md = getTurndown().turndown(clone.innerHTML);
  md = md.replace(/\u0001M(\d+)\u0002/g, (m, i) => '$' + maths[+i] + '$');
  return md.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

// ── Pasar los cambios de un bloque al texto fuente ──
export function commitBlock(blk) {
  if (!pvDirty.has(blk)) return true;
  pvDirty.delete(blk);
  if (!blk.isConnected) return true;
  const s = +blk.dataset.s, e = +blk.dataset.e;
  const cur = editor.value;
  if (cur.slice(s, e) !== blk._raw) return false;      // el texto cambió por otro lado: se repinta
  const md = blockToMarkdown(blk);
  const tail = blk._raw ? (blk._raw.match(/\s*$/)[0]) : '\n\n';
  const newRaw = md ? md + tail : '';
  if (newRaw === blk._raw) return true;

  saveToUndo();
  editor.value = cur.slice(0, s) + newRaw + cur.slice(e);
  const delta = newRaw.length - (e - s);
  blk.dataset.e = String(s + newRaw.length);
  blk._raw = newRaw;
  if (delta) {
    preview.querySelectorAll('.md-blk').forEach(o => {
      if (o !== blk && +o.dataset.s >= e) { o.dataset.s = String(+o.dataset.s + delta); o.dataset.e = String(+o.dataset.e + delta); }
    });
  }
  // Lo mismo que hace el editor al teclear, salvo repintar la vista previa
  markTabModified();
  renderLight();
  refreshHighlight();
  updateClaudeStatus();
  if (tocOpen) renderTOC();
  debouncedSaveToLS();
  return true;
}

// Pasa a Markdown todo lo pendiente (guardar, exportar, cambiar de pestaña…)
export function flushPreviewEdits() {
  clearTimeout(_pvTimer);
  if (!pvDirty.size) return;
  let ok = true;
  [...preview.querySelectorAll('.md-blk')].filter(b => pvDirty.has(b)).forEach(b => { if (!commitBlock(b)) ok = false; });
  pvDirty.clear();
  if (!ok) { S.previewEditing = false; updatePreview(); }
}

// Cierra la sesión de edición: vuelca lo pendiente y permite repintar
export function endPreviewEdit() {
  flushPreviewEdits();
  if (S.previewEditing) { S.previewEditing = false; updatePreview(); }
}

// ── Eventos ──
export const pvBlock = node => {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const b = el && el.closest && el.closest('.md-blk[contenteditable="true"]');
  return b && preview.contains(b) ? b : null;
};

preview.addEventListener('input', e => {
  const blk = pvBlock(e.target);
  if (!blk) return;
  S.previewEditing = true;
  if (e.inputType === 'insertText' && e.data === ' ') tryMarkdownShortcut(blk);
  pvTouch(blk);
  clearTimeout(_pvTimer);
  _pvTimer = setTimeout(flushPreviewEdits, PV_COMMIT_MS);
});

preview.addEventListener('change', e => {            // casillas de tareas
  if (e.target.matches && e.target.matches('input[type=checkbox]')) {
    const blk = pvBlock(e.target);
    if (!blk) return;
    // turndown lee la propiedad; el atributo hace que el estado sobreviva a clonar
    e.target.toggleAttribute('checked', e.target.checked);
    S.previewEditing = true; pvTouch(blk);
    clearTimeout(_pvTimer); _pvTimer = setTimeout(flushPreviewEdits, PV_COMMIT_MS);
  }
});

preview.addEventListener('focusout', e => {
  const to = e.relatedTarget;
  if (to && (preview.contains(to) || (fmtBar && fmtBar.contains(to)))) { flushPreviewEdits(); return; }
  // El foco sale del documento: se cierra la sesión (la selección de la barra no cuenta)
  setTimeout(() => {
    if (!preview.contains(document.activeElement) && !(fmtBar && fmtBar.contains(document.activeElement))) endPreviewEdit();
  }, 0);
});

// Pegar: el texto se interpreta como Markdown (negritas, listas…) en lugar de pegar HTML ajeno
preview.addEventListener('paste', e => {
  if (!pvBlock(e.target)) return;
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (!text) return;
  e.preventDefault();
  let html = renderMdFragment(text).trim();
  const single = html.match(/^<p>([\s\S]*)<\/p>$/);
  if (single && !/<p>/.test(single[1])) html = single[1];      // una línea: se inserta en línea
  document.execCommand('insertHTML', false, html);
});

// Atajos de teclado dentro de la edición
preview.addEventListener('keydown', e => {
  const blk = pvBlock(e.target);
  if (!blk) return;
  const mod = e.ctrlKey || e.metaKey;
  // Deshacer/rehacer del documento (no el del navegador, que no sabe de bloques ni de Markdown)
  if (mod && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    e.preventDefault();
    pvUndoRedo(e.key.toLowerCase() === 'y' || e.shiftKey);
    return;
  }
  if (mod && e.key.toLowerCase() === 'k' && !window.getSelection().isCollapsed) { e.preventDefault(); openFmtLink(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); document.execCommand('strikeThrough'); return; }
  if (mod || e.altKey) return;

  const inCode = !!(window.getSelection().anchorNode && pvClosest('pre'));
  if (inCode && e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); return; }
  if (inCode && e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }

  const sel = window.getSelection();
  if (!sel.isCollapsed || !sel.rangeCount) return;
  if (e.key === 'Backspace' && caretAtEdge(blk, 'start')) { if (mergeAdjacent(blk, -1)) e.preventDefault(); }
  else if (e.key === 'Delete' && caretAtEdge(blk, 'end')) { if (mergeAdjacent(blk, +1)) e.preventDefault(); }
});

export function pvClosest(sel) {
  const n = window.getSelection().anchorNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return el && el.closest(sel);
}

export function caretAtEdge(blk, edge) {
  const r = window.getSelection().getRangeAt(0);
  const probe = document.createRange();
  probe.selectNodeContents(blk);
  if (edge === 'start') probe.setEnd(r.startContainer, r.startOffset); else probe.setStart(r.endContainer, r.endOffset);
  return probe.toString() === '' && !probe.cloneContents().querySelector('img');
}

// ── Unir con el bloque anterior/siguiente (Retroceso al inicio / Supr al final) ──
export const SIMPLE_TAG = /^(P|H[1-6])$/;
export const isSimpleBlock = b => b && b.children.length === 1 && SIMPLE_TAG.test(b.firstElementChild.tagName);

export function mergeAdjacent(blk, dir) {
  const other = dir < 0 ? blk.previousElementSibling : blk.nextElementSibling;
  // Si no hay con qué unir (o el vecino es de solo lectura) se bloquea el gesto: el navegador
  // fusionaría fuera de los límites de bloque y descuadraría el documento.
  if (!other || !other.classList.contains('md-blk')) return isSimpleBlock(blk);
  if (!isSimpleBlock(blk)) return false;                 // listas, código… se gestionan dentro de su bloque
  if (!other.hasAttribute('contenteditable') || !isSimpleBlock(other)) return true;

  flushPreviewEdits();
  const [first, second] = dir < 0 ? [other, blk] : [blk, other];
  if (first._raw !== editor.value.slice(+first.dataset.s, +first.dataset.e)) return true;
  const a = blockToMarkdown(first), b = blockToMarkdown(second).replace(/^#{1,6}\s+/, '');
  const index = [...preview.querySelectorAll('.md-blk')].indexOf(first);
  const caret = first.firstElementChild.textContent.length;
  const tail = second._raw.match(/\s*$/)[0];
  saveToUndo();
  const v = editor.value;
  editor.value = v.slice(0, +first.dataset.s) + a + b + tail + v.slice(+second.dataset.e);
  markTabModified(); renderLight(); refreshHighlight(); debouncedSaveToLS();
  S.previewEditing = false;
  updatePreview();                                       // repinta con la numeración de bloques nueva
  placeCaret(index, caret);
  return true;
}

export function placeCaret(blockIndex, charOffset) {
  const b = preview.querySelectorAll('.md-blk')[blockIndex];
  if (!b || !b.hasAttribute('contenteditable')) return;
  b.focus({ preventScroll: true });
  const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  let left = charOffset, n;
  const r = document.createRange();
  while ((n = walker.nextNode())) {
    if (left <= n.nodeValue.length) { r.setStart(n, left); r.collapse(true); break; }
    left -= n.nodeValue.length;
  }
  if (!n) { r.selectNodeContents(b); r.collapse(false); }
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

// ── Atajos Markdown al escribir: "# ", "## ", "- ", "1. ", "> " ──
export function tryMarkdownShortcut(blk) {
  const sel = window.getSelection();
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3 || !sel.isCollapsed) return;
  const p = node.parentElement.closest('p');
  if (!p || !blk.contains(p) || p.firstChild !== node || p.closest('li, blockquote')) return;
  const m = node.nodeValue.match(/^(#{1,3}|[-*+]|1\.|>) ?\s?/);
  if (!m || sel.anchorOffset !== m[0].length || !/[\s ]$/.test(m[0])) return;
  const marker = m[1];
  node.nodeValue = node.nodeValue.slice(m[0].length);
  if (!node.nodeValue) { p.innerHTML = '<br>'; }
  const r = document.createRange();
  r.setStart(p.firstChild.nodeType === 3 ? p.firstChild : p, 0); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  if (marker[0] === '#') document.execCommand('formatBlock', false, 'h' + marker.length);
  else if (marker === '>') document.execCommand('formatBlock', false, 'blockquote');
  else if (marker === '1.') document.execCommand('insertOrderedList');
  else document.execCommand('insertUnorderedList');
}

// ── Barra flotante de formato (aparece al seleccionar texto) ──
export function hideFmtBar() { if (fmtBar) { fmtBar.classList.remove('show', 'linking'); } }

export function updateFmtBar() {
  if (!fmtBar || fmtBar.classList.contains('linking')) return;
  const sel = window.getSelection();
  if (!previewEditEnabled() || !sel.rangeCount || sel.isCollapsed || !pvBlock(sel.anchorNode) || !pvBlock(sel.focusNode)) { hideFmtBar(); return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) { hideFmtBar(); return; }
  fmtBar.classList.add('show');
  const w = fmtBar.offsetWidth, h = fmtBar.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2));
  const top = rect.top - h - 10 < 8 ? rect.bottom + 10 : rect.top - h - 10;
  fmtBar.style.left = left + 'px';
  fmtBar.style.top = top + 'px';
}
document.addEventListener('selectionchange', updateFmtBar);
window.addEventListener('resize', hideFmtBar);

export function fmtCommand(cmd, arg) {
  const blk = pvBlock(window.getSelection().anchorNode);
  if (!blk) return;
  switch (cmd) {
    case 'bold': document.execCommand('bold'); break;
    case 'italic': document.execCommand('italic'); break;
    case 'strike': document.execCommand('strikeThrough'); break;
    case 'code': wrapSelectionIn('code'); break;
    case 'link': openFmtLink(); return;
    case 'block': document.execCommand('formatBlock', false, arg); break;
    case 'ul': document.execCommand('insertUnorderedList'); break;
    case 'ol': document.execCommand('insertOrderedList'); break;
  }
  updateFmtBar();
}

// <code> inline: execCommand no lo ofrece. Alterna: si ya está dentro de <code>, lo quita.
export function wrapSelectionIn(tag) {
  const sel = window.getSelection();
  const r = sel.getRangeAt(0);
  const existing = pvClosest(tag);
  if (existing) {
    const text = document.createTextNode(existing.textContent);
    existing.replaceWith(text);
  } else {
    const el = document.createElement(tag);
    try { r.surroundContents(el); } catch (e) { el.textContent = r.toString(); r.deleteContents(); r.insertNode(el); }
  }
  const blk = pvBlock(sel.anchorNode) || pvBlock(r.startContainer);
  if (blk) blk.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

export function openFmtLink() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !pvBlock(sel.anchorNode)) return;
  if (sel.isCollapsed) { showToast('Selecciona el texto al que quieres poner el enlace'); return; }
  _fmtRange = sel.getRangeAt(0).cloneRange();
  const a = pvClosest('a');
  fmtLink.value = a ? a.getAttribute('href') : '';
  fmtBar.classList.add('show', 'linking');
  updateFmtBarPosition();
  fmtLink.focus();
  fmtLink.select();
}
export function updateFmtBarPosition() {
  if (!_fmtRange) return;
  const rect = _fmtRange.getBoundingClientRect();
  const w = fmtBar.offsetWidth, h = fmtBar.offsetHeight;
  fmtBar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
  fmtBar.style.top = (rect.top - h - 10 < 8 ? rect.bottom + 10 : rect.top - h - 10) + 'px';
}
export function closeFmtLink(apply) {
  const url = fmtLink.value.trim();
  fmtBar.classList.remove('linking');
  const range = _fmtRange; _fmtRange = null;
  if (range) {
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    const blk = pvBlock(range.startContainer);
    if (blk) blk.focus({ preventScroll: true });
    sel.removeAllRanges(); sel.addRange(range);
    if (apply) {
      if (url) document.execCommand('createLink', false, /^[a-z][a-z0-9+.-]*:|^[#/.]/i.test(url) ? url : 'https://' + url);
      else document.execCommand('unlink');
    }
  }
  updateFmtBar();
}
if (fmtLink) {
  fmtLink.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); closeFmtLink(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFmtLink(false); }
  });
}
if (fmtBar) {
  // Los botones no roban el foco: la selección del texto debe seguir viva
  fmtBar.addEventListener('mousedown', e => { if (e.target !== fmtLink) e.preventDefault(); });
  fmtBar.addEventListener('click', e => {
    const b = e.target.closest('[data-fmt]');
    if (b) fmtCommand(b.dataset.fmt, b.dataset.arg);
  });
}

// ── Deshacer / rehacer en la vista previa ──
export function pvCaretInfo() {
  const sel = window.getSelection();
  const blk = sel.rangeCount && pvBlock(sel.anchorNode);
  if (!blk) return null;
  const r = document.createRange();
  r.selectNodeContents(blk); r.setEnd(sel.anchorNode, sel.anchorOffset);
  return { idx: [...preview.querySelectorAll('.md-blk')].indexOf(blk), off: r.toString().length };
}
export function pvUndoRedo(isRedo) {
  const info = pvCaretInfo();
  flushPreviewEdits();
  S.previewEditing = false;
  if (isRedo) redoCore(); else undoCore();
  markTabModified(); renderLight(); refreshHighlight(); updateClaudeStatus(); debouncedSaveToLS();
  if (info) placeCaret(Math.max(0, Math.min(info.idx, preview.querySelectorAll('.md-blk').length - 1)), info.off);
}

on('view:changed', applyPreviewEditable);
// ── Vista dividida con la vista previa editable: sincronía por bloques (sin tocar el DOM editable) ──
// Editor → vista previa: se lleva al bloque que contiene el cursor y se resalta un instante
export function syncEditorToBlock(pos) {
  const blocks = [...preview.querySelectorAll('.md-blk')];
  const blk = blocks.filter(b => +b.dataset.s <= pos).pop() || blocks[0];
  if (!blk) return;
  blk.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  blk.classList.remove('blk-flash'); void blk.offsetWidth; blk.classList.add('blk-flash');
  setTimeout(() => blk.classList.remove('blk-flash'), 1200);
}
// Vista previa → editor: el editor se desplaza (sin quitarle el foco a la vista previa) al texto del bloque
export function syncBlockToEditor(target) {
  const blk = pvBlock(target);
  if (!blk) return;
  const pos = +blk.dataset.s;
  const lineH = parseFloat(getComputedStyle(editor).lineHeight) || 24;
  const line = editor.value.slice(0, pos).split('\n').length - 1;
  editor.scrollTo({ top: Math.max(0, line * lineH - editor.clientHeight / 3), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// ═══════════════════════════════════════════════════
// BARRA LATERAL Y ATAJOS: trabajan sobre la superficie que se está usando
// ═══════════════════════════════════════════════════
// La barra lateral (títulos, formato, listas, insertar, plantillas, deshacer) y la paleta actúan
// sobre la vista previa si el cursor estaba allí (o si solo se ve la vista previa) y sobre el
// editor de texto en el resto de casos.
let lastSurface = 'editor';
editor.addEventListener('focusin', () => { lastSurface = 'editor'; });
preview.addEventListener('focusin', () => { lastSurface = 'preview'; });
// Los botones de la barra no deben quitarle el foco/selección a la superficie activa
document.getElementById('leftSidebar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });

export function routeToPreview() {
  return previewEditEnabled() && (S.currentView === 'preview' || lastSurface === 'preview');
}

function targetBlock() {
  const sel = window.getSelection();
  const b = sel.rangeCount && pvBlock(sel.anchorNode);
  if (b) return b;
  const all = [...preview.querySelectorAll('.md-blk[contenteditable="true"]')];
  return all[all.length - 1] || null;
}

// Documento vacío o sin bloques editables: el trozo se añade al final del texto y se repinta
function pvAppend(md) {
  const v = editor.value.replace(/\s+$/, '');
  saveToUndo();
  editor.value = (v ? v + '\n\n' : '') + md + '\n';
  markTabModified(); renderLight(); refreshHighlight(); updateClaudeStatus(); debouncedSaveToLS();
  S.previewEditing = false;
  updatePreview();
}

export function pvWrap(before) {
  const cmd = { '**': 'bold', '*': 'italic', '~~': 'strike', '`': 'code' }[before];
  if (!cmd) return;
  const blk = targetBlock();
  if (blk && !window.getSelection().rangeCount) blk.focus();
  fmtCommand(cmd);
}
export function pvHeading(level) {
  const blk = targetBlock();
  if (!blk) { pvAppend('#'.repeat(+level) + ' Título'); return; }
  if (!pvBlock(window.getSelection().anchorNode)) placeCaret([...preview.querySelectorAll('.md-blk')].indexOf(blk), 0);
  document.execCommand('formatBlock', false, 'h' + level);
}
export function pvInsertBlock(type, mdOf) {
  const blk = targetBlock();
  if (type === 'link' && blk && !window.getSelection().isCollapsed) { openFmtLink(); return; }
  if (type === 'image' && blk) { insertImageFromPicker(blk); return; }
  const md = type === 'hr' ? '---' : mdOf();
  if (!blk) pvAppend(md); else insertBlockAfter(blk, md, { select: type !== 'table' });
}
export function pvInsertSnippet(text) {
  const blk = targetBlock();
  if (!blk) pvAppend(text); else insertBlockAfter(blk, text, { select: false });
}
