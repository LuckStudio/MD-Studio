import { preview } from './state.js';
import { showToast } from './actions.js';
import { previewEditEnabled, pvBlock } from './preview-edit.js';

// ═══════════════════════════════════════════════════
// EDITOR DE TABLAS (vista previa editable)
// ═══════════════════════════════════════════════════
// Con el cursor dentro de una tabla aparece una barra con filas, columnas, alineación y borrado.
// Tab / Mayús+Tab recorren las celdas y, en la última, añaden una fila.
export const tblBar = document.getElementById('tblBar');
export const ALIGNS = ['', 'left', 'center', 'right'];

export function currentCell() {
  const n = window.getSelection().anchorNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  const c = el && el.closest && el.closest('td, th');
  return c && pvBlock(c) ? c : null;
}

export function placeInCell(cell, atEnd = false) {
  const r = document.createRange();
  r.selectNodeContents(cell); r.collapse(!atEnd);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
export function touch(blk) { blk.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); }

export function tableAction(act) {
  const cell = currentCell();
  if (!cell) return;
  const tr = cell.parentElement, table = cell.closest('table'), blk = pvBlock(cell);
  const idx = cell.cellIndex;
  const rows = [...table.rows];
  if (act === 'row-add' || act === 'row-add-above') {
    if (act === 'row-add-above' && tr.parentElement.tagName === 'THEAD') { showToast('Encima de los títulos no se puede añadir una fila'); return; }
    const nr = tr.cloneNode(true);
    [...nr.cells].forEach(c => { c.innerHTML = '<br>'; c.removeAttribute('contenteditable'); });
    if (tr.parentElement.tagName === 'THEAD') {
      let tb = table.tBodies[0];
      if (!tb) { tb = document.createElement('tbody'); table.appendChild(tb); }
      [...nr.cells].forEach(c => {
        if (c.tagName === 'TH') { const td = document.createElement('td'); td.innerHTML = '<br>'; if (c.getAttribute('align')) td.setAttribute('align', c.getAttribute('align')); c.replaceWith(td); }
      });
      tb.insertBefore(nr, tb.firstChild);
    } else if (act === 'row-add-above') tr.before(nr);
    else tr.after(nr);
    placeInCell(nr.cells[idx]);
  } else if (act === 'row-del') {
    if (tr.parentElement.tagName === 'THEAD') { showToast('La fila de títulos no se puede borrar'); return; }
    const next = tr.nextElementSibling || tr.previousElementSibling || (table.tHead && table.tHead.rows[0]);
    tr.remove();
    if (next) placeInCell(next.cells[Math.min(idx, next.cells.length - 1)]);
  } else if (act === 'col-add' || act === 'col-add-left') {
    rows.forEach(r => {
      const base = r.cells[idx];
      const c = document.createElement(base.tagName.toLowerCase());
      c.innerHTML = '<br>';
      if (base.getAttribute('align')) c.setAttribute('align', base.getAttribute('align'));
      if (act === 'col-add-left') base.before(c); else base.after(c);
    });
    placeInCell(tr.cells[act === 'col-add-left' ? idx : idx + 1]);
  } else if (act === 'col-del') {
    if (tr.cells.length < 2) { showToast('La tabla necesita al menos una columna'); return; }
    rows.forEach(r => r.cells[idx].remove());
    placeInCell(tr.cells[Math.min(idx, tr.cells.length - 1)]);
  } else if (act === 'align') {
    const next = ALIGNS[(ALIGNS.indexOf(cell.getAttribute('align') || '') + 1) % ALIGNS.length];
    rows.forEach(r => { if (next) r.cells[idx].setAttribute('align', next); else r.cells[idx].removeAttribute('align'); });
    showToast(next ? 'Columna alineada: ' + { left: 'izquierda', center: 'centro', right: 'derecha' }[next] : 'Alineación por defecto');
  } else if (act === 'table-del') {
    const after = table.nextElementSibling || table.previousElementSibling;
    table.remove();
    if (!blk.querySelector('table') && !blk.textContent.trim()) blk.innerHTML = '<p><br></p>';
    if (after) { const r = document.createRange(); r.selectNodeContents(after); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
  touch(blk);
  updateTblBar();
}

export function hideTblBar() { tblBar.classList.remove('show'); }
export function updateTblBar() {
  if (!previewEditEnabled()) { hideTblBar(); return; }
  const cell = currentCell();
  if (!cell || !window.getSelection().rangeCount) { hideTblBar(); return; }
  const rect = cell.closest('table').getBoundingClientRect();
  tblBar.classList.add('show');
  const w = tblBar.offsetWidth, h = tblBar.offsetHeight;
  tblBar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.right - w)) + 'px';
  tblBar.style.top = (rect.top - h - 8 < 8 ? rect.bottom + 8 : rect.top - h - 8) + 'px';
}
document.addEventListener('selectionchange', updateTblBar);
window.addEventListener('resize', hideTblBar);
document.addEventListener('scroll', updateTblBar, true);

tblBar.addEventListener('mousedown', e => e.preventDefault());       // no roba el foco ni la selección
tblBar.addEventListener('click', e => { const b = e.target.closest('[data-tbl]'); if (b) tableAction(b.dataset.tbl); });

// Tab / Mayús+Tab entre celdas; en la última celda, Tab añade una fila
preview.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
  const cell = currentCell();
  if (!cell) return;
  e.preventDefault();
  const table = cell.closest('table');
  const cells = [...table.querySelectorAll('th, td')];
  const i = cells.indexOf(cell);
  if (e.shiftKey) { if (i > 0) placeInCell(cells[i - 1]); return; }
  if (i < cells.length - 1) { placeInCell(cells[i + 1]); return; }
  tableAction('row-add');
  const last = table.rows;
  placeInCell(last[last.length - 1].cells[0]);
});
