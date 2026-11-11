import { parseMarkdown, parseMarkdownBlocks } from './markdown.js';
import { S, cc, editor, emptyState, lineNums, preview, tk, wc } from './state.js';
import { getActiveTab } from './tabs.js';
import { estimateTokens } from './stats.js';
import { updateCurrentLineHighlight } from './editor.js';
import { renderTOC, tocOpen } from './view.js';
import { saveSettings, settings } from './settings.js';
import { enhancePreview } from './enhance.js';
import { applyPreviewEditable } from './preview-edit.js';
import { conflictBar, showConflictBar } from './watch.js';
import { emit } from './events.ts';

// ═══════════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// RESALTADO DE SINTAXIS EN EL EDITOR (capa backdrop)
// ═══════════════════════════════════════════════════
export let syntaxHighlightEnabled = true;
export const editorHighlight = document.getElementById('editorHighlight');
export const editorStack = document.getElementById('editorStack');

export function escHtmlHL(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Resalta una sola línea de Markdown devolviendo HTML con spans de color
export function highlightMarkdownLine(line, state) {
  // Bloques de código con ``` : cambia el estado y se pinta entero
  const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (fence) {
    state.inCode = !state.inCode;
    return `<span class="tok-codeblock">${escHtmlHL(line)}</span>`;
  }
  if (state.inCode) {
    return `<span class="tok-codeblock">${escHtmlHL(line)}</span>`;
  }
  // Encabezados
  let m = line.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (m) {
    return `<span class="tok-marker">${escHtmlHL(m[1])}</span><span class="tok-h">${inlineHL(m[2])}</span>`;
  }
  // Regla horizontal
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
    return `<span class="tok-hr">${escHtmlHL(line)}</span>`;
  }
  // Cita
  m = line.match(/^(\s*>\s?)(.*)$/);
  if (m) {
    return `<span class="tok-marker">${escHtmlHL(m[1])}</span><span class="tok-quote">${inlineHL(m[2])}</span>`;
  }
  // Lista (con o sin checkbox)
  m = line.match(/^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?(.*)$/);
  if (m) {
    const indent = m[1], marker = m[2], sp = m[3], chk = m[4]||'', rest = m[5];
    return escHtmlHL(indent) +
      `<span class="tok-list">${escHtmlHL(marker)}</span>` + escHtmlHL(sp) +
      (chk ? `<span class="tok-marker">${escHtmlHL(chk)}</span>` : '') +
      inlineHL(rest);
  }
  // Línea normal: solo inline (vacío si la línea está vacía, para no desalinear)
  return inlineHL(line);
}

// Resalta marcas inline: **bold**, *italic*, `code`, ~~strike~~, [links](), <tags>
export function inlineHL(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const rest = text.slice(i);
    let m;
    // código inline `...`
    if ((m = rest.match(/^`[^`]+`/))) {
      out += `<span class="tok-code">${escHtmlHL(m[0])}</span>`; i += m[0].length; continue;
    }
    // negrita+cursiva ***...***
    if ((m = rest.match(/^\*\*\*[^*]+\*\*\*/))) {
      out += `<span class="tok-marker">***</span><span class="tok-bold tok-italic">${escHtmlHL(m[0].slice(3,-3))}</span><span class="tok-marker">***</span>`; i += m[0].length; continue;
    }
    // negrita **...**
    if ((m = rest.match(/^\*\*[^*]+\*\*/)) || (m = rest.match(/^__[^_]+__/))) {
      const d = m[0].slice(0,2);
      out += `<span class="tok-marker">${d}</span><span class="tok-bold">${escHtmlHL(m[0].slice(2,-2))}</span><span class="tok-marker">${d}</span>`; i += m[0].length; continue;
    }
    // cursiva *...* o _..._
    if ((m = rest.match(/^\*[^*\s][^*]*\*/)) || (m = rest.match(/^_[^_\s][^_]*_/))) {
      const d = m[0][0];
      out += `<span class="tok-marker">${d}</span><span class="tok-italic">${escHtmlHL(m[0].slice(1,-1))}</span><span class="tok-marker">${d}</span>`; i += m[0].length; continue;
    }
    // tachado ~~...~~
    if ((m = rest.match(/^~~[^~]+~~/))) {
      out += `<span class="tok-marker">~~</span><span class="tok-strike">${escHtmlHL(m[0].slice(2,-2))}</span><span class="tok-marker">~~</span>`; i += m[0].length; continue;
    }
    // imagen ![alt](url) o enlace [txt](url)
    if ((m = rest.match(/^(!?)\[([^\]]*)\]\(([^)]+)\)/))) {
      out += `<span class="tok-marker">${m[1]}[</span><span class="tok-link">${escHtmlHL(m[2])}</span><span class="tok-marker">](</span><span class="tok-url">${escHtmlHL(m[3])}</span><span class="tok-marker">)</span>`;
      i += m[0].length; continue;
    }
    // etiqueta tipo <instrucciones> (útil en prompts)
    if ((m = rest.match(/^<\/?[a-zA-Z][\w-]*\s*\/?>/))) {
      out += `<span class="tok-tag">${escHtmlHL(m[0])}</span>`; i += m[0].length; continue;
    }
    // carácter normal
    out += escHtmlHL(text[i]); i++;
  }
  return out;
}

export function refreshHighlight() {
  if (!syntaxHighlightEnabled) return;
  const lines = editor.value.split('\n');
  const state = { inCode: false };
  const html = lines.map(l => highlightMarkdownLine(l, state)).join('\n');
  // El \n final asegura que la última línea vacía tenga altura
  editorHighlight.innerHTML = '<div class="eh-inner">' + html + '\n</div>';
  alignHighlightWidth();
  syncHighlightScroll();
}

// Hace que la capa de resaltado tenga EXACTAMENTE el mismo ancho de texto que el
// textarea (que reserva espacio para su barra de scroll). Sin esto, la capa
// envuelve las líneas en otro punto y el texto se desalinea, acumulándose hacia abajo.
export function alignHighlightWidth() {
  const inner = editorHighlight.firstElementChild;
  if (!inner) return;
  // clientWidth del textarea = ancho visible sin la barra de scroll
  editorHighlight.style.width = editor.clientWidth + 'px';
}

export function setSyntaxHighlight(on) {
  syntaxHighlightEnabled = on;
  if (on) refreshHighlight();        // pinta la capa ANTES de ocultar el texto del textarea
  editorStack.classList.toggle('highlight-on', on);
  if (settings) { settings.syntaxHL = on; saveSettings(); }
}

// El textarea es el único que scrollea; la capa de resaltado (overflow:hidden) se
// desplaza con él copiando su scrollTop/scrollLeft. Así texto y color van sincronizados.
export function syncHighlightScroll() {
  const inner = editorHighlight.firstElementChild;
  if (inner) {
    inner.style.transform = `translateY(${-editor.scrollTop}px) translateX(${-editor.scrollLeft}px)`;
  }
  updateCurrentLineHighlight();
}
editor.addEventListener('scroll', syncHighlightScroll, { passive: true });
window.addEventListener('resize', () => { if (syntaxHighlightEnabled) { alignHighlightWidth(); syncHighlightScroll(); } });
// Cubre cualquier cambio de tamaño del editor (divisor, vista, zen, fuente…)
if (window.ResizeObserver) {
  const _ro = new ResizeObserver(() => {
    if (syntaxHighlightEnabled) { alignHighlightWidth(); syncHighlightScroll(); updateCurrentLineHighlight(); }
  });
  // Tras cargar todos los scripts: el primer aviso del observador llama a funciones de módulos posteriores
  document.addEventListener('DOMContentLoaded', () => _ro.observe(editor));
}

// Render pesado: parseo de la preview + resaltado de sintaxis
export function renderHeavy() {
  if (S.previewEditing) return;
  const val = editor.value;
  if (!val.trim()) {
    preview.innerHTML = '';
    preview.appendChild(emptyState);
    applyPreviewEditable();
  } else {
    emptyState.remove();
    let parsed;
    try { parsed = parseMarkdownBlocks(val); }
    catch (e) { preview.innerHTML = parseMarkdown(val); parsed = null; }
    if (parsed) patchPreview(parsed);
    enhancePreview(preview, getActiveTab());
    applyPreviewEditable();
  }
  emit('doc:rendered');   // claude.js, wikilinks.js y workspace.js reaccionan por su cuenta
  if (conflictBar && !conflictBar.hidden) showConflictBar();
  if (tocOpen) renderTOC();
}

// Render ligero: contadores (instantáneo). Solo recalcula lo que cambió.
export let _lastLineCount = -1;
export let _tokenTimer = null;
export function renderLight() {
  const val = editor.value;
  cc.textContent = val.length;
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  wc.textContent = words;
  // Tokens: cálculo agrupado (recorre todo el texto, no conviene por tecla)
  clearTimeout(_tokenTimer);
  _tokenTimer = setTimeout(() => { tk.textContent = estimateTokens(editor.value); }, 200);
  // Números de línea: solo si cambió la cantidad de líneas
  if (S.wordWrap) {
    const lines = val.split('\n').length;
    if (lines !== _lastLineCount) {
      _lastLineCount = lines;
      lineNums.innerHTML = Array.from({length:lines}, (_,i)=>i+1).join('<br/>');
    }
  }
}

// updatePreview completo (para cambios de pestaña, carga, etc., donde no hay tecleo)
export function updatePreview() {
  if (S.previewEditing) return;
  renderLight();
  refreshHighlight();   // imprescindible: el texto visible vive en la capa de resaltado
  renderHeavy();
}

// Versión con debounce para usar mientras se teclea
export let _heavyTimer = null;
export function scheduleHeavy() {
  clearTimeout(_heavyTimer);
  _heavyTimer = setTimeout(renderHeavy, 130);
}

// ── Pintado incremental de la vista previa ──
// En vez de reemplazar todo el HTML en cada pulsación, se reutilizan los bloques cuyo HTML no ha
// cambiado (conservan lo ya dibujado: diagramas, fórmulas, imágenes) y solo se crean los nuevos.
export function patchPreview({ card, blocks }) {
  const pool = new Map();                     // html → bloques existentes con ese html (en orden)
  const existing = [...preview.children];
  for (const el of existing) {
    if (el._html === undefined) continue;
    const list = pool.get(el._html);
    if (list) list.push(el); else pool.set(el._html, [el]);
  }
  const nodes = [];
  if (card) {
    const old = existing.find(el => el.classList && el.classList.contains('frontmatter') && el._card === card);
    if (old) nodes.push(old);
    else { const t = document.createElement('div'); t.innerHTML = card; const n = t.firstElementChild; if (n) { n._card = card; nodes.push(n); } }
  }
  for (const b of blocks) {
    const list = pool.get(b.html);
    let el = list && list.shift();
    if (!el) {
      el = document.createElement('div');
      el.className = 'md-blk';
      el.innerHTML = b.html;
      el._html = b.html;
    }
    el.dataset.s = b.s; el.dataset.e = b.e;
    if (b.ro) el.dataset.ro = '1'; else delete el.dataset.ro;
    nodes.push(el);
  }
  let same = existing.length === nodes.length;
  for (let i = 0; same && i < nodes.length; i++) if (existing[i] !== nodes[i]) same = false;
  if (same) return;
  if (existing.length === nodes.length) {
    // mismo número de bloques: solo se sustituyen los que cambiaron (caso típico al teclear)
    for (let i = 0; i < nodes.length; i++) if (existing[i] !== nodes[i]) existing[i].replaceWith(nodes[i]);
    return;
  }
  const frag = document.createDocumentFragment();
  nodes.forEach(n => frag.appendChild(n));
  preview.replaceChildren(frag);
}
