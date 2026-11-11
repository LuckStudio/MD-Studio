import { escHtml } from './tabs.js';

// ═══════════════════════════════════════════════════
// ICONOS (sprite SVG inline en index.html)
// ═══════════════════════════════════════════════════
export const ICON_BY_GLYPH = {
  '📄': 'file-plus', '📂': 'folder-open', '📁': 'folder', '💾': 'save', '⬇': 'download', '🌐': 'globe', '📑': 'file-text',
  '📝': 'file-text', '⎘': 'copy', '⬆': 'upload', '🗑': 'trash-2', '🏠': 'house', '✦': 'sparkles', '🔗': 'link', '🖼': 'image',
  '≡': 'list', '☑': 'list-checks', '⊞': 'table', '⊟': 'columns-2', '✏': 'pencil', '👁': 'eye', '📖': 'book-open', '🧘': 'focus',
  '📊': 'chart-column', '↩': 'undo-2', '↪': 'redo-2', '🔍': 'search', '☰': 'panel-left', '❝': 'quote', '▤': 'layout-template',
  '🌙': 'moon', '☀': 'sun', '↺': 'rotate-ccw', '⇄': 'git-compare', '⌥': 'code', '✓': 'check', '⚠': 'triangle-alert',
  '📘': 'book', '🧩': 'puzzle', '🤖': 'bot', '⌨': 'terminal', '↻': 'refresh-cw', '✕': 'x', 'ℹ': 'info', '💡': 'lightbulb',
  '❗': 'circle-alert', '⛔': 'octagon-x', '✎': 'pencil-line', '🔒': 'lock',
};

// icon('save') → <svg>; iconGlyph('💾') acepta el emoji antiguo (paleta de comandos, plantillas…)
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
export function iconGlyph(glyph) {
  const n = ICON_BY_GLYPH[glyph];
  return n ? icon(n) : escHtml(glyph || '');
}
