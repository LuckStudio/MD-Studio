// ═══════════════════════════════════════════════════
// MENÚS CONTEXTUALES (clic derecho) EN TODA LA APLICACIÓN
// ═══════════════════════════════════════════════════
// Un único listener decide qué panel mostrar según el elemento pulsado. Mayús+clic derecho deja el
// menú nativo del navegador (ortografía, «inspeccionar»); los campos de texto sueltos (buscar,
// renombrar…) también lo conservan. Se pueden abrir con teclado: tecla Menú o Mayús+F10.
import { S, editor, preview } from './state.js';
import { showContextMenu } from './ctxmenu.js';
import { renderMdFragment } from './markdown.js';
import { showToast, wrap, insertBlock, insertHeading } from './actions.js';
import { fmtCommand, openFmtLink, pvBlock, placeCaret, flushPreviewEdits, previewEditEnabled, syncEditorToBlock } from './preview-edit.js';
import { insertBlockAfter, openSourceEditor, SLASH_ITEMS } from './blocks.js';
import { insertImageFromPicker } from './images.js';
import { duplicateBlock, deleteBlock, moveBlock, convertBlock, convertibleBlock, CONVERT_KINDS, copyBlockMarkdown, setCodeLanguage } from './blockops.js';
import { tableAction, currentCell, placeInCell } from './tables.js';
import { openWikiLink } from './wikilinks.js';
import { getHeadings, jumpToHeading } from './view.js';
import { getActiveTab, closeTab, createTab, switchTab, renderTabs, startRenameTab, newTab } from './tabs.js';
import { saveFile, saveFileAs, openFile, openFolder, downloadMD } from './files.js';
import { openFind } from './find.js';
import { goToLine } from './editor.js';
import { openCmd } from './commands.js';
import { openSettings } from './settings.js';
import { toggleReader } from './reader.js';
import { startTour } from './tour.js';
import { showHome } from './home.js';
import { showDiff } from './diff.js';
import { openHistory } from './versions.js';
import { wsFolder, renderTreeRoot, openWorkspaceFile, closeFolder } from './workspace.js';
import { updateIndexEntry } from './wsindex.js';
import { togglePreviewEdit } from './preview-edit.js';
import { openExport } from './exportdlg.js';

const copyText = async (t, msg = 'Copiado') => { try { await navigator.clipboard.writeText(t); showToast('✓ ' + msg); } catch (e) { showToast('No se pudo copiar'); } };
const sel = () => window.getSelection();
const hasPvSelection = () => { const s = sel(); return s.rangeCount && !s.isCollapsed && pvBlock(s.anchorNode); };

// ── Pegar con el portapapeles (necesita el permiso del navegador, que se pide una vez) ──
async function pasteInPreview() {
  try {
    const text = await navigator.clipboard.readText();
    let html = renderMdFragment(text).trim();
    const one = html.match(/^<p>([\s\S]*)<\/p>$/);
    if (one && !/<p>/.test(one[1])) html = one[1];
    document.execCommand('insertHTML', false, html);
  } catch (e) { showToast('Pega con Ctrl+V (el navegador no dio acceso al portapapeles)'); }
}
async function pasteInEditor() {
  try { document.execCommand('insertText', false, await navigator.clipboard.readText()); }
  catch (e) { showToast('Pega con Ctrl+V (el navegador no dio acceso al portapapeles)'); }
}

// ═══ Vista previa ═══
function previewMenu(el) {
  const editing = previewEditEnabled();
  const blk = el.closest('.md-blk');
  const link = el.closest('a'), img = el.closest('img'), cell = el.closest('td, th'), pre = el.closest('pre');
  const editable = editing && blk && blk.hasAttribute('contenteditable');
  const items = [];

  if (link) {
    const href = link.getAttribute('href') || '';
    const wiki = link.classList.contains('wikilink');
    items.push({ label: 'Abrir enlace', icon: 'external-link', kbd: editing ? 'Ctrl+clic' : '', action: () => {
      if (wiki) openWikiLink(link.dataset.wiki, link.dataset.anchor);
      else if (/^https?:|^mailto:/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
      else link.click();
    } });
    items.push({ label: 'Copiar dirección', icon: 'copy', action: () => copyText(wiki ? `[[${link.dataset.wiki}]]` : href, 'Dirección copiada') });
    if (editable) {
      items.push({ label: 'Editar enlace…', icon: 'link', disabled: wiki, action: () => { const r = document.createRange(); r.selectNodeContents(link); sel().removeAllRanges(); sel().addRange(r); openFmtLink(); } });
      items.push({ label: 'Quitar enlace', icon: 'eraser', action: () => { const r = document.createRange(); r.selectNodeContents(link); sel().removeAllRanges(); sel().addRange(r); document.execCommand('unlink'); } });
    }
    items.push('sep');
  }
  if (img) {
    items.push({ label: 'Abrir imagen', icon: 'external-link', action: () => window.open(img.currentSrc || img.src, '_blank', 'noopener') });
    items.push({ label: 'Copiar ruta de la imagen', icon: 'copy', action: () => copyText(img.getAttribute('data-rel-src') || img.getAttribute('src') || '', 'Ruta copiada') });
    items.push('sep');
  }

  // Portapapeles y formato
  if (hasPvSelection() && editable) {
    items.push({ label: 'Cortar', icon: 'scissors', kbd: 'Ctrl+X', action: () => document.execCommand('cut') });
    items.push({ label: 'Copiar', icon: 'copy', kbd: 'Ctrl+C', action: () => document.execCommand('copy') });
    items.push({ label: 'Pegar', icon: 'clipboard-paste', kbd: 'Ctrl+V', action: pasteInPreview });
    items.push('sep');
    items.push({ label: 'Formato', icon: 'bold', items: [
      { label: 'Negrita', icon: 'bold', kbd: 'Ctrl+B', action: () => fmtCommand('bold') },
      { label: 'Cursiva', icon: 'italic', kbd: 'Ctrl+I', action: () => fmtCommand('italic') },
      { label: 'Tachado', icon: 'strikethrough', action: () => fmtCommand('strike') },
      { label: 'Código en línea', icon: 'code', action: () => fmtCommand('code') },
      { label: 'Enlace…', icon: 'link', kbd: 'Ctrl+K', action: () => openFmtLink() },
    ] });
    items.push('sep');
  } else if (!sel().isCollapsed) {
    items.push({ label: 'Copiar', icon: 'copy', kbd: 'Ctrl+C', action: () => document.execCommand('copy') });
    items.push('sep');
  } else if (editable) {
    items.push({ label: 'Pegar', icon: 'clipboard-paste', kbd: 'Ctrl+V', action: pasteInPreview });
    items.push('sep');
  }

  // Tabla
  if (cell && editable) {
    const act = a => () => { placeInCell(cell); tableAction(a); };
    const align = v => () => {
      const table = cell.closest('table'), idx = cell.cellIndex;
      [...table.rows].forEach(r => { if (v) r.cells[idx].setAttribute('align', v); else r.cells[idx].removeAttribute('align'); });
      blk.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    };
    items.push({ label: 'Tabla', icon: 'table', items: [
      { label: 'Insertar fila encima', icon: 'arrow-up', action: act('row-add-above') },
      { label: 'Insertar fila debajo', icon: 'arrow-down', action: act('row-add') },
      { label: 'Borrar fila', icon: 'trash-2', action: act('row-del') },
      'sep',
      { label: 'Insertar columna a la izquierda', icon: 'columns-3', action: act('col-add-left') },
      { label: 'Insertar columna a la derecha', icon: 'columns-3', action: act('col-add') },
      { label: 'Borrar columna', icon: 'trash-2', action: act('col-del') },
      'sep',
      { label: 'Alinear columna', icon: 'list', items: [
        { label: 'A la izquierda', checked: cell.getAttribute('align') === 'left', action: align('left') },
        { label: 'Centrada', checked: cell.getAttribute('align') === 'center', action: align('center') },
        { label: 'A la derecha', checked: cell.getAttribute('align') === 'right', action: align('right') },
        { label: 'Por defecto', checked: !cell.getAttribute('align'), action: align('') },
      ] },
      'sep',
      { label: 'Borrar tabla', icon: 'trash-2', danger: true, action: act('table-del') },
    ] });
    items.push('sep');
  }

  // Código
  if (pre) {
    const code = pre.querySelector('code');
    items.push({ label: 'Copiar código', icon: 'copy', action: () => copyText(code ? code.textContent : pre.textContent, 'Código copiado') });
    if (editable) {
      const LANGS = ['js', 'ts', 'python', 'bash', 'json', 'html', 'css', 'yaml', 'sql', 'markdown', 'diff'];
      const cur = pre.getAttribute('data-lang') || '';
      items.push({ label: 'Lenguaje', icon: 'code', items: [...LANGS.map(l => ({ label: l, checked: cur === l, action: () => setCodeLanguage(blk, l) })), 'sep', { label: 'Sin lenguaje', checked: !cur, action: () => setCodeLanguage(blk, '') }] });
    }
    items.push('sep');
  }

  // Bloque
  if (blk && editing) {
    if (editable && convertibleBlock(blk)) {
      const cur = blk.firstElementChild.tagName;
      items.push({ label: 'Convertir en', icon: 'pilcrow', items: CONVERT_KINDS.map(k => ({ label: k.label, icon: k.icon, checked: (k.id === 'p' && cur === 'P') || (/^h[1-3]$/.test(k.id) && cur === k.id.toUpperCase()) || (k.id === 'quote' && cur === 'BLOCKQUOTE') || (k.id === 'ul' && cur === 'UL') || (k.id === 'ol' && cur === 'OL'), action: () => convertBlock(blk, k.id) })) });
    }
    items.push({ label: 'Insertar debajo', icon: 'plus', items: SLASH_ITEMS.map(it => ({ label: it.name, icon: it.icon, action: () => {
      if (it.special === 'image') insertImageFromPicker(blk); else insertBlockAfter(blk, it.md, it);
    } })) });
    if (blk.dataset.ro) items.push({ label: 'Editar código fuente…', icon: 'square-code', action: () => openSourceEditor(blk) });
    items.push('sep');
    items.push({ label: 'Duplicar bloque', icon: 'copy-plus', action: () => duplicateBlock(blk) });
    items.push({ label: 'Subir bloque', icon: 'arrow-up', action: () => moveBlock(blk, -1) });
    items.push({ label: 'Bajar bloque', icon: 'arrow-down', action: () => moveBlock(blk, +1) });
    items.push({ label: 'Copiar bloque como Markdown', icon: 'file-code', action: () => copyBlockMarkdown(blk) });
    items.push({ label: 'Eliminar bloque', icon: 'trash-2', danger: true, action: () => deleteBlock(blk) });
    items.push('sep');
  }
  items.push({ label: 'Seleccionar todo', icon: 'text-select', kbd: 'Ctrl+A', action: () => { const r = document.createRange(); r.selectNodeContents(preview); sel().removeAllRanges(); sel().addRange(r); } });
  items.push({ label: editing ? 'Bloquear edición de la vista previa' : 'Activar edición de la vista previa', icon: editing ? 'lock' : 'pencil', action: togglePreviewEdit });
  return trim(items);
}

// ═══ Editor de texto ═══
function editorMenu() {
  const has = editor.selectionEnd > editor.selectionStart;
  const text = has ? editor.value.slice(editor.selectionStart, editor.selectionEnd) : '';
  const items = [
    { label: 'Cortar', icon: 'scissors', kbd: 'Ctrl+X', disabled: !has, action: () => document.execCommand('cut') },
    { label: 'Copiar', icon: 'copy', kbd: 'Ctrl+C', disabled: !has, action: () => document.execCommand('copy') },
    { label: 'Pegar', icon: 'clipboard-paste', kbd: 'Ctrl+V', action: pasteInEditor },
    { label: 'Seleccionar todo', icon: 'text-select', kbd: 'Ctrl+A', action: () => { editor.focus(); editor.select(); } },
    'sep',
    { label: 'Formato', icon: 'bold', items: [
      { label: 'Negrita', icon: 'bold', kbd: 'Ctrl+B', action: () => wrap('**', '**') },
      { label: 'Cursiva', icon: 'italic', kbd: 'Ctrl+I', action: () => wrap('*', '*') },
      { label: 'Tachado', icon: 'strikethrough', action: () => wrap('~~', '~~') },
      { label: 'Código en línea', icon: 'code', action: () => wrap('`', '`') },
    ] },
    { label: 'Título', icon: 'heading-1', items: [1, 2, 3, 4].map(n => ({ label: 'Título ' + n, icon: n < 4 ? 'heading-' + n : 'pilcrow', action: () => insertHeading(n) })) },
    { label: 'Insertar', icon: 'plus', items: [
      { label: 'Enlace', icon: 'link', type: 'link' }, { label: 'Imagen', icon: 'image', type: 'image' }, { label: 'Lista con viñetas', icon: 'list', type: 'ul' },
      { label: 'Lista numerada', icon: 'list-ordered', type: 'ol' }, { label: 'Lista de tareas', icon: 'list-checks', type: 'task' }, { label: 'Cita', icon: 'quote', type: 'blockquote' },
      { label: 'Bloque de código', icon: 'code', type: 'code' }, { label: 'Tabla', icon: 'table', type: 'table' }, { label: 'Separador', icon: 'minus', type: 'hr' },
    ].map(i => ({ ...i, action: () => insertBlock(i.type) })) },
    'sep',
    has && { label: `Buscar «${text.length > 24 ? text.slice(0, 24) + '…' : text}»`, icon: 'search', action: () => { openFind(false); const f = document.getElementById('findInput'); f.value = text; f.dispatchEvent(new Event('input')); } },
    { label: 'Ir a línea…', icon: 'arrow-down', kbd: 'Ctrl+G', action: goToLine },
    S.currentView === 'split' && previewEditEnabled() && { label: 'Mostrar en la vista previa', icon: 'eye', action: () => syncEditorToBlock(editor.selectionStart) },
  ];
  return trim(items);
}

// ═══ Pestañas ═══
function tabMenu(tabEl) {
  const id = +tabEl.dataset.id;
  const tab = S.tabs.find(t => t.id === id);
  if (!tab) return null;
  const idx = S.tabs.indexOf(tab);
  const closeMany = ids => ids.forEach(i => closeTab(i));
  return trim([
    { label: 'Guardar', icon: 'save', kbd: 'Ctrl+S', action: () => { switchTab(id); saveFile(); } },
    { label: 'Guardar como…', icon: 'save', action: () => { switchTab(id); saveFileAs(); } },
    'sep',
    { label: 'Cerrar', icon: 'x', kbd: 'Ctrl+W', action: () => closeTab(id) },
    { label: 'Cerrar las demás', icon: 'x', disabled: S.tabs.length < 2, action: () => closeMany(S.tabs.filter(t => t.id !== id).map(t => t.id)) },
    { label: 'Cerrar las de la derecha', icon: 'x', disabled: idx >= S.tabs.length - 1, action: () => closeMany(S.tabs.slice(idx + 1).map(t => t.id)) },
    'sep',
    { label: 'Duplicar pestaña', icon: 'copy-plus', action: () => { const c = id === S.activeTabId ? editor.value : tab.content; const t = createTab(tab.name + ' copia', c); t.modified = true; renderTabs(); switchTab(t.id); } },
    { label: 'Renombrar', icon: 'pencil', action: () => { switchTab(id); const l = document.querySelector('.tab-item.active .tab-label'); if (l) startRenameTab(id, l); } },
    { label: 'Copiar nombre', icon: 'copy', action: () => copyText(tab.name + '.md', 'Nombre copiado') },
    'sep',
    { label: 'Historial de versiones…', icon: 'history', action: () => { switchTab(id); openHistory(); } },
    { label: 'Ver cambios sin guardar', icon: 'git-compare', disabled: !tab.modified, action: () => { switchTab(id); showDiff(); } },
  ]);
}

// ═══ Carpeta (explorador) ═══
async function createDocIn(dirSegs) {
  if (!wsFolder) return;
  const name = (prompt('Nombre del nuevo documento (sin extensión):') || '').trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!name) return;
  try {
    if (!(await wsFolder.root.permission('readwrite', true))) { showToast('⚠ Sin permiso de escritura en la carpeta'); return; }
    const dir = await wsFolder.root.ensureDirAt(dirSegs);
    const fname = /\.(md|markdown)$/i.test(name) ? name : name + '.md';
    if (await dir.exists(fname)) { showToast('Ya existe ' + fname); return; }
    await dir.writeFile(fname, '# ' + name.replace(/\.(md|markdown)$/i, '') + '\n');
    updateIndexEntry([...dirSegs, fname], '# ' + name + '\n');
    await renderTreeRoot();
    await openWorkspaceFile([...dirSegs, fname]);
  } catch (e) { showToast('No se pudo crear: ' + e.message); }
}
function treeMenu(el) {
  const row = el.closest('.ft-row, .ft-hit');
  const rootItems = [
    { label: 'Nuevo documento aquí…', icon: 'file-plus', action: () => createDocIn([]) },
    { label: 'Actualizar el árbol', icon: 'refresh-cw', action: () => renderTreeRoot() },
    'sep',
    { label: 'Cerrar carpeta', icon: 'x', action: closeFolder },
  ];
  if (!row) return rootItems;
  const segs = row.dataset.path.split('/');
  const isDir = row.classList.contains('dir');
  if (isDir) return [
    { label: 'Nuevo documento aquí…', icon: 'file-plus', action: () => createDocIn(segs) },
    { label: 'Copiar ruta', icon: 'copy', action: () => copyText(segs.join('/'), 'Ruta copiada') },
    'sep', { label: 'Actualizar el árbol', icon: 'refresh-cw', action: () => renderTreeRoot() },
  ];
  const name = segs[segs.length - 1].replace(/\.(md|markdown|mdx|txt)$/i, '');
  return [
    { label: 'Abrir', icon: 'folder-open', action: () => openWorkspaceFile(segs) },
    { label: 'Copiar ruta', icon: 'copy', action: () => copyText(segs.join('/'), 'Ruta copiada') },
    { label: 'Copiar como [[enlace]]', icon: 'link-2', action: () => copyText(`[[${name}]]`, 'Enlace copiado') },
    { label: 'Copiar como enlace Markdown', icon: 'link', action: () => copyText(`[${name}](${encodeURI(segs.join('/'))})`, 'Enlace copiado') },
    'sep',
    { label: 'Nuevo documento en esta carpeta…', icon: 'file-plus', action: () => createDocIn(segs.slice(0, -1)) },
  ];
}

// ═══ Índice (TOC) ═══
function tocMenu(item) {
  const list = [...document.getElementById('tocList').querySelectorAll('.toc-item')];
  const i = list.indexOf(item), h = getHeadings()[i];
  if (!h) return null;
  const slug = h.text.toLowerCase().trim().replace(/[^\w\sÀ-ÿ-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  return [
    { label: 'Ir a la sección', icon: 'arrow-down', action: () => jumpToHeading(h, i) },
    { label: 'Copiar enlace a la sección', icon: 'link', action: () => copyText('#' + slug, 'Enlace copiado') },
    { label: 'Copiar título', icon: 'copy', action: () => copyText(h.text, 'Título copiado') },
  ];
}

// ═══ Inicio: tarjetas recientes ═══
function recentMenu(wrapEl) {
  return [
    { label: 'Abrir', icon: 'folder-open', action: () => wrapEl.querySelector('.home-rcard').click() },
    { label: 'Quitar de recientes', icon: 'x', action: () => wrapEl.querySelector('.rc-del').click() },
  ];
}

// ═══ Resto de la aplicación ═══
function appMenu() {
  return [
    { label: 'Nuevo documento', icon: 'file-plus', kbd: 'Ctrl+N', action: newTab },
    { label: 'Abrir archivo…', icon: 'folder-open', kbd: 'Ctrl+O', action: openFile },
    { label: 'Abrir carpeta…', icon: 'folder', action: openFolder },
    'sep',
    { label: 'Inicio', icon: 'house', action: showHome },
    { label: 'Paleta de comandos', icon: 'command', kbd: 'Ctrl+K', action: openCmd },
    { label: 'Exportar…', icon: 'share-2', action: openExport },
    { label: 'Modo lectura', icon: 'book-open', action: toggleReader },
    'sep',
    { label: 'Apariencia', icon: 'sparkles', action: openSettings },
    { label: 'Recorrido guiado', icon: 'info', action: startTour },
  ];
}

// Quita separadores sobrantes (al principio, al final o repetidos) y huecos
function trim(items) {
  const out = [];
  for (const it of items.filter(Boolean)) { if (it === 'sep' && (!out.length || out[out.length - 1] === 'sep')) continue; out.push(it); }
  while (out[out.length - 1] === 'sep') out.pop();
  return out;
}

document.addEventListener('contextmenu', e => {
  const el = e.target;
  if (!(el instanceof Element) || e.shiftKey || el.closest('.ctx-menu')) return;
  // Campos de texto sueltos (buscar, renombrar, código fuente…) conservan el menú nativo
  if (el.closest('input, select, #srcText, textarea:not(#editor)')) return;

  let items = null;
  if (el.closest('.tab-item')) items = tabMenu(el.closest('.tab-item'));
  else if (el.closest('#filesPanel') && !el.closest('.files-filter')) items = treeMenu(el);
  else if (el.closest('.toc-item')) items = tocMenu(el.closest('.toc-item'));
  else if (el.closest('.home-rcard-wrap')) items = recentMenu(el.closest('.home-rcard-wrap'));
  else if (el.closest('#preview')) {
    // Si el clic derecho cae fuera de la selección, el cursor pasa al punto pulsado (como en un editor)
    items = previewMenu(el);
  } else if (el.closest('#editorStack, #editor')) items = editorMenu();
  else if (el.closest('.fmt-bar, .tbl-bar, .slash-menu, .toast')) return;
  else items = appMenu();

  if (!items || !items.length) return;
  e.preventDefault();
  const kb = e.clientX === 0 && e.clientY === 0;
  let x = e.clientX, y = e.clientY;
  if (kb) { const r = el.getBoundingClientRect(); x = r.left + 12; y = r.bottom - 4; }
  showContextMenu(x, y, items, { fromKeyboard: kb });
});
