// ═══════════════════════════════════════════════════
// OPERACIONES SOBRE BLOQUES (duplicar, borrar, mover, convertir…)
// ═══════════════════════════════════════════════════
// Trabajan sobre el texto fuente usando la posición [s,e) de cada bloque (ver parseMarkdownBlocks)
// y repintan. Las usan el menú contextual y los atajos.
import { S, editor, preview } from './state.js';
import { saveToUndo } from './history.js';
import { markTabModified } from './editor.js';
import { renderLight, updatePreview } from './render.js';
import { refreshHighlight } from './render.js';
import { debouncedSaveToLS } from './storage.js';
import { updateClaudeStatus } from './claude.js';
import { flushPreviewEdits, placeCaret } from './preview-edit.js';
import { showToast } from './actions.js';

const blockList = () => [...preview.querySelectorAll('.md-blk')];

// Comprueba que el bloque sigue coincidiendo con el texto fuente y devuelve sus datos
function info(blk) {
  flushPreviewEdits();
  const s = +blk.dataset.s, e = +blk.dataset.e;
  const raw = editor.value.slice(s, e);
  if (blk._raw !== undefined && blk._raw !== raw) { showToast('El documento cambió: vuelve a intentarlo'); updatePreview(); return null; }
  const body = raw.replace(/\s+$/, '');
  return { s, e, raw, body, tail: raw.slice(body.length) };
}

// Sustituye el texto fuente, repinta y coloca el cursor en el bloque que empieza en `focusAt`
function commit(newValue, focusAt) {
  saveToUndo();
  editor.value = newValue;
  markTabModified(); renderLight(); refreshHighlight(); updateClaudeStatus(); debouncedSaveToLS();
  S.previewEditing = false;
  updatePreview();
  if (focusAt == null) return;
  const blocks = blockList();
  let idx = blocks.findIndex(b => +b.dataset.s >= focusAt);
  if (idx < 0) idx = blocks.length - 1;
  if (idx >= 0) {
    if (blocks[idx].hasAttribute('contenteditable')) placeCaret(idx, 0);
    blocks[idx].scrollIntoView({ block: 'nearest' });
  }
}

export function duplicateBlock(blk) {
  const b = info(blk); if (!b) return;
  const at = b.s + b.body.length;
  commit(editor.value.slice(0, at) + '\n\n' + b.body + editor.value.slice(at), at + 2);
}

export function deleteBlock(blk) {
  const b = info(blk); if (!b) return;
  const v = editor.value;
  commit((v.slice(0, b.s) + v.slice(b.e)).replace(/\n{3,}/g, '\n\n'), b.s);
}

export function moveBlock(blk, dir) {
  const blocks = blockList();
  const i = blocks.indexOf(blk);
  const other = blocks[i + dir];
  if (!other) { showToast(dir < 0 ? 'Ya es el primer bloque' : 'Ya es el último bloque'); return; }
  const [first, second] = dir < 0 ? [other, blk] : [blk, other];
  const a = info(first), b = info(second);
  if (!a || !b) return;
  const v = editor.value;
  const gap = v.slice(a.e, b.s);
  // Se intercambian los cuerpos y se conserva la separación (líneas en blanco) tal cual estaba
  const out = v.slice(0, a.s) + b.body + a.tail + gap + a.body + b.tail + v.slice(b.e);
  const movedAt = dir < 0 ? a.s : a.s + b.body.length + a.tail.length + gap.length;
  commit(out, movedAt);
}

const PREFIX = /^(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;
export const CONVERT_KINDS = [
  { id: 'p', label: 'Párrafo', icon: 'pilcrow' }, { id: 'h1', label: 'Título 1', icon: 'heading-1' }, { id: 'h2', label: 'Título 2', icon: 'heading-2' },
  { id: 'h3', label: 'Título 3', icon: 'heading-3' }, { id: 'quote', label: 'Cita', icon: 'quote' }, { id: 'ul', label: 'Lista con viñetas', icon: 'list' },
  { id: 'ol', label: 'Lista numerada', icon: 'list-ordered' }, { id: 'task', label: 'Lista de tareas', icon: 'list-checks' },
];
export function convertibleBlock(blk) {
  const el = blk.firstElementChild;
  return !!el && /^(P|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(el.tagName) && !blk.dataset.ro && !blk.querySelector('table, pre') && !el.classList.contains('callout');
}
export function convertBlock(blk, kind) {
  const b = info(blk); if (!b) return;
  const lines = b.body.split('\n').map(l => l.replace(PREFIX, '')).filter(l => l.trim() !== '');
  if (!lines.length) lines.push('Texto');
  let out;
  if (kind === 'p') out = lines.join('\n');
  else if (/^h[1-3]$/.test(kind)) out = '#'.repeat(+kind[1]) + ' ' + lines.join(' ');
  else if (kind === 'quote') out = lines.map(l => '> ' + l).join('\n');
  else if (kind === 'ul') out = lines.map(l => '- ' + l).join('\n');
  else if (kind === 'ol') out = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
  else out = lines.map(l => '- [ ] ' + l).join('\n');
  const v = editor.value;
  commit(v.slice(0, b.s) + out + b.tail + v.slice(b.e), b.s);
}

export async function copyBlockMarkdown(blk) {
  const b = info(blk); if (!b) return;
  try { await navigator.clipboard.writeText(b.body); showToast('✓ Markdown del bloque copiado'); } catch (e) { showToast('No se pudo copiar'); }
}

// Cambia el lenguaje de un bloque de código (``` info)
export function setCodeLanguage(blk, lang) {
  const b = info(blk); if (!b) return;
  const out = b.body.replace(/^(\s*(?:`{3,}|~{3,}))[^\n]*/, (m, fence) => fence + lang);
  const v = editor.value;
  commit(v.slice(0, b.s) + out + b.tail + v.slice(b.e), b.s);
}
