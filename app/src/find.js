import { editor } from './state.js';
import { debouncedSaveToLS } from './storage.js';
import { syncHighlightScroll, updatePreview } from './render.js';
import { saveToUndo } from './history.js';
import { markTabModified } from './editor.js';
import { showToast } from './actions.js';
import { flashEditorRange, getCaretCoords } from './view.js';

// ═══════════════════════════════════════════════════
// FIND & REPLACE
// ═══════════════════════════════════════════════════
export const findPanel   = document.getElementById('findPanel');
export const findInput   = document.getElementById('findInput');
export const replaceInput= document.getElementById('replaceInput');
export const findCountEl  = document.getElementById('findCount');
export let findMatches = [];      // array de {start, end}
export let findIndex = -1;        // coincidencia activa
export let findOpts = { case:false, word:false, regex:false };

export function buildFindRegex() {
  let q = findInput.value;
  if (!q) return null;
  try {
    if (!findOpts.regex) q = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (findOpts.word) q = '\\b' + q + '\\b';
    const flags = 'g' + (findOpts.case ? '' : 'i');
    return new RegExp(q, flags);
  } catch(e) {
    return 'error';
  }
}

export function runFind(keepIndex=false) {
  const re = buildFindRegex();
  findMatches = [];
  if (re === 'error') { findCountEl.textContent = 'regex ✕'; findCountEl.classList.add('nores'); return; }
  if (re) {
    const text = editor.value;
    let m;
    while ((m = re.exec(text)) !== null) {
      findMatches.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++; // evita bucle infinito
    }
  }
  if (!keepIndex || findIndex >= findMatches.length) {
    // Selecciona la coincidencia más cercana al cursor
    const cur = editor.selectionStart;
    findIndex = findMatches.findIndex(mm => mm.start >= cur);
    if (findIndex === -1) findIndex = findMatches.length ? 0 : -1;
  }
  updateFindUI();
}

// Solo actualiza el contador. NO toca el editor (no roba el foco al escribir).
export function updateFindUI() {
  if (!findMatches.length) {
    findCountEl.textContent = findInput.value ? '0 resultados' : '0/0';
    findCountEl.classList.toggle('nores', !!findInput.value);
    return;
  }
  findCountEl.classList.remove('nores');
  findCountEl.textContent = `${findIndex+1}/${findMatches.length}`;
}

// Salta a la coincidencia activa en el editor. Solo se llama desde Enter/flechas.
export function highlightMatch() {
  if (findIndex < 0 || !findMatches[findIndex]) return;
  const { start, end } = findMatches[findIndex];
  editor.focus();
  editor.setSelectionRange(start, end);
  flashEditorRange(start, end);
  const coords = getCaretCoords(start);
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 25;
  if (coords) {
    if (coords.top < editor.scrollTop || coords.top > editor.scrollTop + editor.clientHeight - lineHeight*2) {
      editor.scrollTop = Math.max(0, coords.top - editor.clientHeight/2);
      syncHighlightScroll();
    }
  }
  // Devuelve el foco al buscador para seguir navegando con Enter
  setTimeout(() => { if (findPanel.classList.contains('open')) findInput.focus(); }, 0);
}

export function findNav(dir) {
  if (!findMatches.length) return;
  findIndex = (findIndex + dir + findMatches.length) % findMatches.length;
  updateFindUI();
  highlightMatch();
}

export function replaceOne() {
  if (findIndex < 0 || !findMatches[findIndex]) { runFind(); return; }
  const { start, end } = findMatches[findIndex];
  saveToUndo();
  const rep = replaceInput.value;
  editor.value = editor.value.substring(0, start) + rep + editor.value.substring(end);
  editor.setSelectionRange(start, start + rep.length);
  markTabModified(); updatePreview(); debouncedSaveToLS();
  runFind(true);
  if (findMatches.length) { if (findIndex >= findMatches.length) findIndex = 0; updateFindUI(); }
  showToast('✓ Reemplazado');
}

export function replaceAll() {
  const re = buildFindRegex();
  if (!re || re === 'error' || !findMatches.length) { showToast('Sin coincidencias'); return; }
  saveToUndo();
  const count = findMatches.length;
  editor.value = editor.value.replace(re, replaceInput.value);
  markTabModified(); updatePreview(); debouncedSaveToLS();
  runFind();
  showToast(`✓ ${count} reemplazo(s) realizados`);
}

export function toggleFindOpt(opt) {
  findOpts[opt] = !findOpts[opt];
  const map = { case:'findCase', word:'findWord', regex:'findRegex' };
  document.getElementById(map[opt]).classList.toggle('active', findOpts[opt]);
  runFind();
}

export function openFind(withReplace=false) {
  findPanel.classList.add('open');
  document.getElementById('replaceRow').style.display = withReplace ? 'flex' : 'none';
  const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
  if (sel && !sel.includes('\n')) findInput.value = sel;
  findInput.focus();
  findInput.select();
  runFind();
}

export function closeFind() {
  findPanel.classList.remove('open');
  editor.focus();
}

findInput.addEventListener('input', () => runFind());
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); findNav(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
replaceInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
