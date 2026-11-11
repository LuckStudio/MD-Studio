import { icon } from './icons.js';
import { parseMarkdown } from './markdown.js';
import { S, editor, emptyState, preview } from './state.js';
import { escHtml, getActiveTab } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { refreshHighlight, renderLight, updatePreview } from './render.js';
import { saveToUndo } from './history.js';
import { markTabModified } from './editor.js';
import { showToast } from './actions.js';
import { enhancePreview } from './enhance.js';
import { flushPreviewEdits, pvTouch } from './preview-edit.js';
import { insertImageFromPicker } from './images.js';
import { updateClaudeStatus } from './claude.js';

// ═══════════════════════════════════════════════════
// INSERTAR BLOQUES (menú "/") Y EDITOR DE CÓDIGO FUENTE
// ═══════════════════════════════════════════════════
// · "/" al inicio de un párrafo vacío de la vista previa abre el menú de bloques.
// · Los bloques de solo lectura (HTML, fórmulas, Mermaid) se editan con su código fuente en un
//   diálogo con vista previa en directo (doble clic o botón «Editar código»).
// Las dos cosas trabajan sobre el texto fuente: se inserta/sustituye el trozo y se repinta.

export const SLASH_ITEMS = [
  { id: 'h1', icon: 'heading-1', name: 'Título 1', kw: 'titulo heading h1', md: '# Título', select: true },
  { id: 'h2', icon: 'heading-2', name: 'Título 2', kw: 'titulo heading h2 seccion', md: '## Título', select: true },
  { id: 'h3', icon: 'heading-3', name: 'Título 3', kw: 'titulo heading h3', md: '### Título', select: true },
  { id: 'ul', icon: 'list', name: 'Lista con viñetas', kw: 'lista bullets ul', md: '- Elemento', select: true },
  { id: 'ol', icon: 'list-ordered', name: 'Lista numerada', kw: 'lista numerada ol', md: '1. Elemento', select: true },
  { id: 'task', icon: 'list-checks', name: 'Lista de tareas', kw: 'tareas checklist todo', md: '- [ ] Tarea', select: true },
  { id: 'quote', icon: 'quote', name: 'Cita', kw: 'cita blockquote', md: '> Cita', select: true },
  { id: 'code', icon: 'code', name: 'Bloque de código', kw: 'codigo code fence', md: '```js\ncódigo\n```', select: true },
  { id: 'table', icon: 'table', name: 'Tabla', kw: 'tabla table', md: '| Columna 1 | Columna 2 |\n| --- | --- |\n| Dato | Dato |', select: false },
  { id: 'callout', icon: 'info', name: 'Aviso (nota, consejo…)', kw: 'aviso nota tip warning callout', md: '> [!NOTE]\n> Texto del aviso', select: false },
  { id: 'hr', icon: 'minus', name: 'Separador', kw: 'separador linea hr', md: '---', select: false },
  { id: 'image', icon: 'image', name: 'Imagen…', kw: 'imagen foto picture', special: 'image' },
  { id: 'mermaid', icon: 'workflow', name: 'Diagrama (Mermaid)', kw: 'diagrama mermaid flujo', md: '```mermaid\ngraph TD\n  A[Inicio] --> B[Fin]\n```', source: true },
  { id: 'math', icon: 'sigma', name: 'Fórmula', kw: 'formula matematicas latex katex', md: '$$\nE = mc^2\n$$', source: true },
];

export const slashMenu = document.getElementById('slashMenu');
export let _slash = null;     // { blk, p, items, index }

export function slashClose() {
  if (!_slash) return;
  slashMenu.classList.remove('show');
  _slash = null;
}

export function slashOpen(blk, p) {
  _slash = { blk, p, items: SLASH_ITEMS, index: 0 };
  slashRender('');
  slashMenu.classList.add('show');
  slashPosition();
}

export function slashPosition() {
  const sel = window.getSelection();
  if (!sel.rangeCount && !_slash.p) return;
  const rect = _slash.p ? ((sel.rangeCount && sel.getRangeAt(0).getClientRects()[0]) || _slash.p.getBoundingClientRect()) : _slash.anchor;
  const h = slashMenu.offsetHeight, w = slashMenu.offsetWidth;
  const below = rect.bottom + 8 + h < window.innerHeight;
  slashMenu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left)) + 'px';
  slashMenu.style.top = (below ? rect.bottom + 8 : Math.max(8, rect.top - 8 - h)) + 'px';
}

export function slashRender(filter) {
  const q = filter.toLowerCase().trim();
  // Coincidencia por inicio de palabra (el difuso del menú sería demasiado permisivo con 14 elementos)
  _slash.items = q ? SLASH_ITEMS.filter(i => (i.name + ' ' + i.kw).toLowerCase().split(/[\s()…]+/).some(w => w.startsWith(q))) : SLASH_ITEMS;
  if (_slash.index >= _slash.items.length) _slash.index = 0;
  if (!_slash.items.length) { slashMenu.innerHTML = '<div class="slash-empty">Sin coincidencias</div>'; return; }
  slashMenu.innerHTML = _slash.items.map((it, i) =>
    `<div class="slash-item${i === _slash.index ? ' sel' : ''}" role="option" id="slash-${i}" aria-selected="${i === _slash.index}" data-i="${i}">${icon(it.icon)}<span>${escHtml(it.name)}</span></div>`).join('');
  slashMenu.querySelectorAll('.slash-item').forEach(el => {
    el.addEventListener('mousedown', e => { e.preventDefault(); slashChoose(+el.dataset.i); });
    el.addEventListener('mouseenter', () => { _slash.index = +el.dataset.i; slashSelUpdate(); });
  });
}
export function slashSelUpdate() {
  slashMenu.querySelectorAll('.slash-item').forEach((el, i) => { el.classList.toggle('sel', i === _slash.index); el.setAttribute('aria-selected', String(i === _slash.index)); });
  slashMenu.querySelector('.slash-item.sel')?.scrollIntoView({ block: 'nearest' });
}

// Detecta "/" al inicio de un párrafo vacío y mantiene el filtro mientras se escribe
preview.addEventListener('input', () => {
  const sel = window.getSelection();
  const n = sel.anchorNode;
  const p = n && (n.nodeType === 1 ? n : n.parentElement)?.closest('.md-blk[contenteditable="true"] > p, .md-blk[contenteditable="true"] > div');
  const text = p ? p.textContent : '';
  if (_slash) {
    if (!p || p !== _slash.p || !text.startsWith('/') || /\s$/.test(text)) { slashClose(); return; }
    slashRender(text.slice(1)); slashPosition();
  } else if (p && text === '/') {
    const blk = p.closest('.md-blk');
    if (blk && !p.closest('li, blockquote, pre')) slashOpen(blk, p);
  }
});
preview.addEventListener('keydown', e => {
  if (!_slash) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _slash.index = (_slash.index + 1) % Math.max(1, _slash.items.length); slashSelUpdate(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _slash.index = (_slash.index - 1 + _slash.items.length) % Math.max(1, _slash.items.length); slashSelUpdate(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); slashChoose(_slash.index); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); slashClose(); }
}, true);
preview.addEventListener('focusout', () => setTimeout(slashClose, 120));

// ── Botón «+» junto al bloque (como en un editor de bloques): abre el mismo menú sin escribir «/» ──
const blkPlus = document.getElementById('blkPlus');
let _plusBlk = null;
function showBlkPlus(blk) {
  if (!blk || !document.body.classList.contains('pv-edit') || !blk.hasAttribute('contenteditable')) { hideBlkPlus(); return; }
  _plusBlk = blk;
  const r = blk.getBoundingClientRect();
  const pr = preview.getBoundingClientRect();
  blkPlus.style.top = Math.max(r.top, 8) + 'px';
  blkPlus.style.left = Math.max(pr.left - 34, 4) + 'px';
  blkPlus.classList.add('show');
}
function hideBlkPlus() { blkPlus.classList.remove('show'); _plusBlk = null; }
preview.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.md-blk'); if (b && b !== _plusBlk) showBlkPlus(b); });
preview.addEventListener('focusin', e => showBlkPlus(e.target.closest && e.target.closest('.md-blk')));
preview.addEventListener('mouseleave', () => setTimeout(() => { if (!blkPlus.matches(':hover') && !(document.activeElement && preview.contains(document.activeElement))) hideBlkPlus(); }, 200));
window.addEventListener('resize', hideBlkPlus);
blkPlus.addEventListener('mousedown', e => e.preventDefault());
blkPlus.addEventListener('click', () => {
  if (!_plusBlk) return;
  const r = blkPlus.getBoundingClientRect();
  _slash = { blk: _plusBlk, p: null, items: SLASH_ITEMS, index: 0, anchor: { left: r.right + 6, bottom: r.bottom, top: r.top } };
  slashRender('');
  slashMenu.classList.add('show');
  slashPosition();
});

export async function slashChoose(i) {
  if (!_slash) return;
  const item = _slash.items[i];
  const { blk, p } = _slash;
  slashClose();
  if (!item) return;
  if (p) p.remove();                            // fuera el "/filtro"
  if (item.special === 'image') { await insertImageFromPicker(blk); return; }
  insertBlockAfter(blk, item.md, item);
}

// ── Insertar un trozo de Markdown como bloque nuevo, después de `blk` ──
export function insertBlockAfter(blk, md, opts = {}) {
  const emptied = !blk.textContent.trim() && !blk.querySelector('img, hr, table, pre');
  pvTouch(blk);
  flushPreviewEdits();                                      // vuelca lo que quedó en el bloque
  const src = editor.value;
  const off = emptied ? +blk.dataset.s : +blk.dataset.e;
  const before = src.slice(0, off);
  const sepBefore = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const after = src.slice(off);
  // Siempre exactamente una línea en blanco entre el bloque nuevo y lo que sigue
  const tail = !after.trim() ? '\n' : after.startsWith('\n\n') ? after : after.startsWith('\n') ? '\n' + after : '\n\n' + after;
  saveToUndo();
  editor.value = before + sepBefore + md + tail;
  markTabModified(); renderLight(); refreshHighlight(); updateClaudeStatus(); debouncedSaveToLS();
  const start = off + sepBefore.length;
  S.previewEditing = false;
  updatePreview();
  const blocks = [...preview.querySelectorAll('.md-blk')];
  const nb = blocks.find(b => +b.dataset.s === start) || blocks.find(b => +b.dataset.s >= start);
  if (!nb) return;
  nb.scrollIntoView({ block: 'nearest' });
  if (opts.source || nb.dataset.ro) { openSourceEditor(nb); return; }
  nb.focus({ preventScroll: true });
  const r = document.createRange();
  if (opts.select !== false) {
    const code = nb.querySelector('pre code');
    const target = code || nb.firstElementChild;
    if (code) r.selectNodeContents(code);
    else {
      // Primer texto con contenido (se salta los espacios entre etiquetas) y sin el espacio inicial
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let tn;
      while ((tn = walker.nextNode()) && !tn.nodeValue.trim()) { /* siguiente */ }
      if (tn) { r.setStart(tn, tn.nodeValue.search(/\S/)); r.setEnd(tn, tn.nodeValue.trimEnd().length); }
      else r.selectNodeContents(target);
    }
  } else {
    const cell = nb.querySelector('th, td, p');
    r.selectNodeContents(cell || nb); r.collapse(true);
  }
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  S.previewEditing = true;
}

// ═══ Editor de código fuente de un bloque ═══
export const srcDialog = document.getElementById('srcOverlay');
export const srcText = document.getElementById('srcText');
export const srcPreview = document.getElementById('srcPreview');
export let _srcBlk = null, _srcTimer = null;

export function openSourceEditor(blk) {
  const s = +blk.dataset.s, e = +blk.dataset.e;
  _srcBlk = { s, e, raw: editor.value.slice(s, e) };
  srcText.value = _srcBlk.raw.replace(/\s+$/, '');
  const kind = /^```mermaid/i.test(srcText.value) ? 'Diagrama Mermaid' : /^\$\$/.test(srcText.value) ? 'Fórmula' : 'HTML / bloque especial';
  document.getElementById('srcTitle').textContent = 'Editar ' + kind.toLowerCase();
  srcDialog.classList.add('open');
  srcText.focus();
  renderSrcPreview();
}
export function closeSrcDialog() { srcDialog.classList.remove('open'); _srcBlk = null; }

export function renderSrcPreview() {
  clearTimeout(_srcTimer);
  _srcTimer = setTimeout(async () => {
    const div = document.createElement('div');
    div.className = 'preview-content';
    div.innerHTML = parseMarkdown(srcText.value, { plain: true });
    srcPreview.replaceChildren(div);
    await enhancePreview(div, getActiveTab(), { export: true });
  }, 160);
}
srcText.addEventListener('input', renderSrcPreview);
srcText.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveSrcDialog(); } });

export function saveSrcDialog() {
  if (!_srcBlk) return;
  const { s, e, raw } = _srcBlk;
  const cur = editor.value;
  if (cur.slice(s, e) !== raw) { showToast('El documento cambió: vuelve a abrir el bloque'); closeSrcDialog(); return; }
  const tail = raw.match(/\s*$/)[0] || '\n';
  saveToUndo();
  editor.value = cur.slice(0, s) + srcText.value.replace(/\s+$/, '') + tail + cur.slice(e);
  markTabModified(); renderLight(); refreshHighlight(); updateClaudeStatus(); debouncedSaveToLS();
  closeSrcDialog();
  S.previewEditing = false;
  updatePreview();
}

// Doble clic en un bloque de solo lectura o botón «Editar código»
preview.addEventListener('dblclick', e => {
  const b = e.target.closest && e.target.closest('.md-blk[data-ro]');
  if (b && document.body.classList.contains('pv-edit')) { e.preventDefault(); openSourceEditor(b); }
});
preview.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.blk-edit');
  if (btn) { e.stopPropagation(); openSourceEditor(btn.closest('.md-blk')); }
}, true);

// Botón visible al pasar el ratón por un bloque de solo lectura (lo crea applyPreviewEditable)
export function ensureSourceButtons() {
  ensureEmptyStart();
  const on = document.body.classList.contains('pv-edit');
  preview.querySelectorAll('.md-blk[data-ro]').forEach(b => {
    let btn = b.querySelector(':scope > .blk-edit');
    if (on && !btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'blk-edit'; btn.setAttribute('contenteditable', 'false');
      btn.title = 'Editar código fuente'; btn.setAttribute('aria-label', 'Editar código fuente del bloque');
      btn.innerHTML = icon('square-code') + ' Editar código';
      b.style.position = 'relative';
      b.appendChild(btn);
    } else if (!on && btn) btn.remove();
  });
}

// Documento vacío en la vista previa: un botón para empezar a escribir ahí mismo
export function ensureEmptyStart() {
  const on = document.body.classList.contains('pv-edit');
  let b = emptyState.querySelector('.empty-start');
  if (on && !b) {
    b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-primary empty-start'; b.textContent = 'Empezar a escribir';
    emptyState.appendChild(b);
  } else if (!on && b) b.remove();
}
preview.addEventListener('click', e => {
  if (!(e.target.closest && e.target.closest('.empty-start'))) return;
  editor.value = '# Título\n\nEscribe aquí.\n';
  editor.dispatchEvent(new Event('input'));
  S.previewEditing = false;
  updatePreview();
  const h = preview.querySelector('.md-blk[contenteditable="true"]');
  if (h) { h.focus(); const r = document.createRange(); r.selectNodeContents(h.firstElementChild); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
});
