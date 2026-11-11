import { editor } from './state.js';
import { escHtml, getActiveTab } from './tabs.js';
import { saveFile } from './files.js';
import { flushPreviewEdits } from './preview-edit.js';

// Núcleo puro (Myers por líneas) en diff-core.ts; aquí solo la parte visual.
import { diffText, myersDiff } from './diff-core.ts';
export { diffText, myersDiff };

// HTML del diff a partir del resultado de diffText() (lo usan el modal de cambios y el historial)
export function diffBodyHTML(r) {
  if (!r.ops) return '<p class="cl-none">Hay demasiados cambios para mostrarlos línea a línea.</p>';
  if (!r.added && !r.removed) return '<p class="cl-none">Sin cambios.</p>';
  const CTX = 3;
  const keep = new Array(r.ops.length).fill(false);
  r.ops.forEach((op, i) => { if (op.t !== '=') for (let j = Math.max(0, i - CTX); j <= Math.min(r.ops.length - 1, i + CTX); j++) keep[j] = true; });
  let html = '', oldN = 0, newN = 0, gap = false;
  r.ops.forEach((op, i) => {
    if (op.t !== '+') oldN++;
    if (op.t !== '-') newN++;
    if (!keep[i]) { gap = true; return; }
    if (gap) { html += '<div class="df-gap">⋯</div>'; gap = false; }
    const cls = op.t === '+' ? 'add' : op.t === '-' ? 'del' : 'ctx';
    html += `<div class="df-line ${cls}"><span class="df-n">${op.t === '+' ? '' : oldN}</span><span class="df-n">${op.t === '-' ? '' : newN}</span>` +
            `<span class="df-sign">${op.t === '=' ? '' : op.t === '+' ? '+' : '−'}</span><span class="df-txt">${escHtml(op.s) || '&nbsp;'}</span></div>`;
  });
  return html;
}

// ── Modal ──
export let _diffCanSave = false;
export function showDiff(opts) {
  flushPreviewEdits();
  const tab = getActiveTab();
  const o = opts || { before: tab ? tab.savedContent : '', after: editor.value, labelBefore: 'Guardado', labelAfter: 'Actual', canSave: true };
  _diffCanSave = !!o.canSave && !!tab;
  const r = diffText(o.before, o.after);
  const body = document.getElementById('diffBody');
  document.getElementById('diffSave').hidden = !_diffCanSave;
  document.getElementById('diffSummary').innerHTML =
    `<span class="df-add">+${r.added}</span> <span class="df-del">−${r.removed}</span> · ${escHtml(o.labelBefore)} → ${escHtml(o.labelAfter)}`;
  body.innerHTML = diffBodyHTML(r);
  document.getElementById('diffOverlay').classList.add('open');
}
export function closeDiff() { document.getElementById('diffOverlay').classList.remove('open'); }
export async function saveFromDiff() { closeDiff(); await saveFile(); }
