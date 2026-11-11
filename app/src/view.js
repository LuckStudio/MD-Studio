import { moveViewIndicator, fadeSwap } from './motion.js';
import { emit } from './events.ts';
import { S, editor, lineNums, preview } from './state.js';
import { debouncedSaveToLS } from './storage.js';
import { refreshHighlight, syncHighlightScroll } from './render.js';
import { updateCurrentLineHighlight, updateCursor } from './editor.js';
import { showToast } from './actions.js';
import { applyPreviewEditable, endPreviewEdit } from './preview-edit.js';

// ═══════════════════════════════════════════════════
// VIEW MODES
// ═══════════════════════════════════════════════════
// ── MODO CONCENTRACIÓN ──
export let zenMode = false;
export function toggleZen() {
  zenMode = !zenMode;
  document.body.classList.toggle('zen', zenMode);
  if (zenMode) {
    setTimeout(() => { editor.focus(); refreshHighlight(); updateCurrentLineHighlight(); }, 50);
    showToast('🧘 Modo concentración — Esc para salir');
  } else {
    setTimeout(() => { refreshHighlight(); updateCurrentLineHighlight(); }, 50);
  }
}

// En pantallas estrechas no cabe la vista dividida: se muestra solo la preview,
// pero se recuerda la preferencia del usuario para cuando vuelva a haber sitio.
export const narrowMQ = window.matchMedia('(max-width: 760px)');
narrowMQ.addEventListener('change', () => setView(S.currentView));

export function setView(mode) {
  const changed = S.currentView !== mode;
  endPreviewEdit();
  S.currentView = mode;
  if (mode === 'split' && narrowMQ.matches) mode = 'preview';
  const ep = document.getElementById('editorPanel');
  const pp = document.getElementById('previewPanel');
  const dv = document.getElementById('divider');
  const sb = document.getElementById('leftSidebar');

  ['v-split','v-editor','v-preview'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById('v-'+mode)?.classList.add('active');
  moveViewIndicator();
  if (changed && !document.documentElement.classList.contains('booting')) { fadeSwap(document.getElementById('editorPanel'), 0.4); fadeSwap(document.getElementById('previewPanel'), 0.4); }

  ep.classList.remove('hidden');
  pp.classList.remove('hidden');
  dv.style.display = 'block';
  sb.style.display = 'flex';

  if (mode === 'split') {
    // Restaura el reparto 50/50 (o lo que el divisor haya fijado)
    ep.style.flex = '';
    pp.style.flex = '';
  } else if (mode === 'editor') {
    pp.classList.add('hidden');
    dv.style.display = 'none';
    ep.style.flex = '1 1 100%';   // ocupa todo el ancho
  } else if (mode === 'preview') {
    ep.classList.add('hidden');
    dv.style.display = 'none';
    pp.style.flex = '1 1 100%';   // ocupa todo el ancho
  }
  emit('view:changed', { view: S.currentView });
  debouncedSaveToLS();
}

// ═══════════════════════════════════════════════════
// TABLA DE CONTENIDOS (OUTLINE)
// ═══════════════════════════════════════════════════
export let tocOpen = false;

export function getHeadings() {
  const lines = editor.value.split('\n');
  const headings = [];
  let inFence = false;
  let charPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        headings.push({ level: m[1].length, text: m[2].trim(), line: i, pos: charPos });
      }
    }
    charPos += line.length + 1; // +1 por el \n
  }
  return headings;
}

export function renderTOC() {
  const list = document.getElementById('tocList');
  const headings = getHeadings();
  if (!headings.length) {
    list.innerHTML = '<div class="toc-empty">No hay encabezados.<br>Usa # para crear secciones.</div>';
    return;
  }
  list.innerHTML = '';
  headings.forEach((h, i) => {
    const btn = document.createElement('button');
    btn.className = 'toc-item lvl' + h.level;
    btn.textContent = h.text;
    btn.title = h.text;
    btn.onclick = () => jumpToHeading(h, i);
    list.appendChild(btn);
  });
}

// Salta a un encabezado y lo resalta en editor Y preview
export function jumpToHeading(h, idx) {
  scrollEditorToPos(h.pos, h.text.length + h.level + 1);
  scrollPreviewToHeading(idx);
}

// ── Desplazamiento + flash en el EDITOR ──
export function scrollEditorToPos(pos, selLen=0) {
  editor.focus();
  editor.setSelectionRange(pos, pos + selLen);
  updateCursor();
  // Mide la posición real (respetando word-wrap) con un espejo del textarea
  const coords = getCaretCoords(pos);
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 25;
  if (coords) {
    editor.scrollTop = Math.max(0, coords.top - editor.clientHeight / 2 + lineHeight);
    syncHighlightScroll();
  }
  flashEditorRange(pos, pos + selLen);
}

// Espejo oculto que replica el textarea para medir coordenadas reales de un offset
export let _mirror = null;
export function getMirror() {
  if (_mirror) return _mirror;
  _mirror = document.createElement('div');
  _mirror.id = '_editorMirror';
  document.body.appendChild(_mirror);
  return _mirror;
}
export function syncMirrorStyle() {
  const m = getMirror();
  const cs = getComputedStyle(editor);
  // Copia TODAS las propiedades que afectan al flujo del texto, para que el
  // espejo envuelva las líneas exactamente igual que el textarea.
  const props = ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing',
    'lineHeight','textTransform','wordSpacing','textIndent','tabSize',
    'paddingTop','paddingRight','paddingBottom','paddingLeft'];
  props.forEach(p => { m.style[p] = cs[p]; });
  m.style.position = 'absolute';
  m.style.visibility = 'hidden';
  m.style.top = '0';
  m.style.left = '-9999px';
  m.style.whiteSpace = 'pre-wrap';
  m.style.overflowWrap = 'break-word';
  m.style.wordBreak = 'normal';
  m.style.boxSizing = 'border-box';
  m.style.border = '0';
  m.style.margin = '0';
  // ANCHURA CRÍTICA: el ancho real donde fluye el texto del textarea.
  // clientWidth ya excluye la barra de scroll vertical, que es lo que queremos:
  // si el espejo fuera más ancho, envolvería en menos líneas y la medición
  // vertical saldría desplazada hacia arriba, acumulándose hacia abajo.
  m.style.width = editor.clientWidth + 'px';
}

// Devuelve {top, left, height} del carácter en 'pos' relativo al contenido del textarea.
// Usa un Range del DOM sobre el espejo: es exacto incluso con word-wrap.
export function getCaretCoords(pos) {
  try {
    syncMirrorStyle();
    const m = getMirror();
    const text = editor.value;
    // Contenido: todo el texto hasta pos + un marcador medible
    m.textContent = text.substring(0, pos);
    const marker = document.createElement('span');
    // un carácter real si existe (para medir su alto); si no, un cero ancho
    const ch = text.charAt(pos);
    marker.textContent = (ch && ch !== '\n') ? ch : '\u200b';
    m.appendChild(marker);
    // resto del texto tras el marcador, para que el wrap del contexto sea idéntico
    if (pos < text.length) {
      m.appendChild(document.createTextNode(text.substring(pos + 1)));
    }
    const mRect = m.getBoundingClientRect();
    const rect = marker.getBoundingClientRect();
    const padTop = parseFloat(getComputedStyle(m).paddingTop) || 0;
    const padLeft = parseFloat(getComputedStyle(m).paddingLeft) || 0;
    // Coordenadas relativas al borde de contenido del espejo (= del textarea)
    const top = rect.top - mRect.top;
    const left = rect.left - mRect.left;
    const height = rect.height || (parseFloat(getComputedStyle(editor).lineHeight) || 25);
    return { top, left, height };
  } catch(e) { return null; }
}

// Crea overlay(s) sobre el rango exacto de la coincidencia, respetando word-wrap
export function flashEditorRange(start, end) {
  const area = document.getElementById('editorArea');
  if (end == null) end = start;
  const c1 = getCaretCoords(start);
  const c2 = getCaretCoords(end);
  if (!c1) return;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 25;

  if (c2 && c2.top === c1.top) {
    // misma línea visual: un solo overlay del ancho exacto
    addEditorFlash(c1.top, c1.left, Math.max(c2.left - c1.left, 6), c1.height);
  } else if (c2) {
    // abarca varias líneas visuales: resalta desde el inicio hasta el fin de su línea,
    // las líneas intermedias completas, y el principio de la última
    const padLeft = parseFloat(getComputedStyle(editor).paddingLeft) || 20;
    const rightEdge = editor.clientWidth - padLeft;
    addEditorFlash(c1.top, c1.left, rightEdge - c1.left, c1.height);
    for (let y = c1.top + lineHeight; y < c2.top; y += lineHeight) {
      addEditorFlash(y, padLeft, rightEdge - padLeft, lineHeight);
    }
    addEditorFlash(c2.top, padLeft, c2.left - padLeft || 6, c2.height);
  } else {
    addEditorFlash(c1.top, c1.left, 40, c1.height);
  }
}

export function addEditorFlash(top, left, width, height) {
  const area = document.getElementById('editorArea');
  const flash = document.createElement('div');
  flash.className = 'editor-flash';
  // El overlay vive en editorArea (fijo); el contenido scrollea dentro del textarea,
  // así que restamos el scroll para alinear el flash con la posición visible.
  flash.style.top = (top - editor.scrollTop) + 'px';
  flash.style.left = (left - editor.scrollLeft) + 'px';
  flash.style.width = Math.max(width, 6) + 'px';
  flash.style.right = 'auto';
  flash.style.height = height + 'px';
  area.appendChild(flash);
  setTimeout(() => flash.remove(), 2000);
}

// ── Desplazamiento + flash en la PREVIEW ──
export function scrollPreviewToHeading(idx) {
  // Solo si la preview está visible
  if (S.currentView === 'editor') return;
  const hs = preview.querySelectorAll('h1,h2,h3,h4,h5,h6');
  const target = hs[idx];
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.remove('flash-target');
  void target.offsetWidth; // reinicia la animación
  target.classList.add('flash-target');
  setTimeout(() => target.classList.remove('flash-target'), 2000);
}

export function toggleTOC() {
  tocOpen = !tocOpen;
  document.getElementById('tocPanel').classList.toggle('open', tocOpen);
  document.getElementById('tocToggleBtn').classList.toggle('active', tocOpen);
  if (tocOpen) renderTOC();
}


export function applyWordWrap() {
  editor.style.whiteSpace = S.wordWrap ? 'pre-wrap' : 'pre';
  editor.style.overflowWrap = S.wordWrap ? 'break-word' : 'normal';
  editor.style.overflowX = S.wordWrap ? 'hidden' : 'auto';
  lineNums.style.display = S.wordWrap ? 'none' : 'block';
  document.getElementById('wrapStatus').style.display = S.wordWrap ? 'inline' : 'none';
  document.getElementById('ww-toggle-btn').textContent = S.wordWrap ? '☑ Ajuste de línea (activo)' : '☐ Ajuste de línea (inactivo)';
}

export function toggleWordWrap() {
  S.wordWrap = !S.wordWrap;
  applyWordWrap();
  debouncedSaveToLS();
  showToast(S.wordWrap ? '✓ Ajuste de línea activado' : '✓ Ajuste de línea desactivado');
}
