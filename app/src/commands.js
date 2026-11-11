import { routeToPreview, pvInsertSnippet } from './preview-edit.js';
import { iconGlyph } from './icons.js';
import { S, editor, preview } from './state.js';
import { escAttr, escHtml, newTab, switchTab } from './tabs.js';
import { debouncedSaveToLS } from './storage.js';
import { downloadMD, openFile, openFolder, saveFile, saveFileAs } from './files.js';
import { exportHTML, exportPDF, exportTXT } from './export.js';
import { openStats } from './stats.js';
import { updatePreview } from './render.js';
import { flashElement } from './preview-sync.js';
import { redo, saveToUndo, undo } from './history.js';
import { goToLine, markTabModified } from './editor.js';
import { openFind } from './find.js';
import { copyMD, insertBlock, insertHeading, showToast, wrap } from './actions.js';
import { getHeadings, jumpToHeading, scrollEditorToPos, setView, toggleTOC, toggleWordWrap, toggleZen } from './view.js';
import { openSettings } from './settings.js';
import { listRecents } from './recents.js';
import { openWorkspaceFile } from './workspace.js';
import { wsFileList } from './wsindex.js';
import { BUILTIN_TEMPLATES, newFromTemplate } from './templates.js';
import { showDiff } from './diff.js';
import { copyShareLink, exportDOCX, openExport } from './exportdlg.js';
import { openHistory } from './versions.js';
import { showClaudeCheck } from './claude.js';
import { installApp, isInstalled } from './pwa.js';
import { toggleReader } from './reader.js';
import { startTour } from './tour.js';
import { startTutorial } from './tutorial.js';
import { openRecent, showHome } from './home.js';

// ═══════════════════════════════════════════════════
// COMMAND PALETTE + SNIPPETS DE PROMPT
// ═══════════════════════════════════════════════════
export const cmdOverlay = document.getElementById('cmdOverlay');
export const cmdInput   = document.getElementById('cmdInput');
export const cmdResults = document.getElementById('cmdResults');
export let cmdSelIndex = 0;
export let cmdFiltered = [];

// Inserta texto en la posición del cursor del editor
export function insertSnippetKey(key) {
  if (promptSnippets[key]) insertSnippet(promptSnippets[key]);
}
export function insertSnippet(text) {
  if (routeToPreview()) { pvInsertSnippet(text); return; }
  const s = editor.selectionStart;
  const before = editor.value.substring(0, s);
  const after  = editor.value.substring(editor.selectionEnd);
  const prefix = (before.length && !before.endsWith('\n')) ? '\n\n' : '';
  const suffix = (after.length && !after.startsWith('\n')) ? '\n\n' : '';
  editor.value = before + prefix + text + suffix + after;
  const caret = s + prefix.length + text.length;
  editor.selectionStart = editor.selectionEnd = caret;
  editor.focus();
  saveToUndo(); updatePreview(); markTabModified(); debouncedSaveToLS();
}

// Snippets pensados para construir prompts y archivos para Claude
export const promptSnippets = {
  rol:      `## Rol\n\nEres [describe el rol: experto en…, asistente de…]. Tu objetivo es [objetivo principal].`,
  contexto: `## Contexto\n\n[Información de fondo que el modelo necesita para entender la tarea.]`,
  tarea:    `## Tarea\n\n[Describe con precisión qué debe hacer el modelo, paso a paso si conviene.]`,
  reglas:   `## Reglas\n\n- [Regla 1]\n- [Regla 2]\n- No [restricción]`,
  formato:  `## Formato de salida\n\nResponde en [formato: Markdown / JSON / lista]. Estructura:\n\n\`\`\`\n[esquema esperado]\n\`\`\``,
  ejemplos: `## Ejemplos\n\n<ejemplo>\nEntrada: [ejemplo de entrada]\nSalida: [salida esperada]\n</ejemplo>`,
  pasos:    `Piensa paso a paso antes de responder. Razona dentro de <pensamiento></pensamiento> y da la respuesta final fuera.`,
  xmltag:   `<instrucciones>\n[Tus instrucciones aquí]\n</instrucciones>`,
  full:     `## Rol\n\nEres [rol].\n\n## Contexto\n\n[contexto]\n\n## Tarea\n\n[tarea]\n\n## Reglas\n\n- [regla]\n\n## Formato de salida\n\n[formato]`,
};

// ── PLANTILLAS PROPIAS (guardadas por el usuario en LocalStorage) ──
export let myTemplates = [];
export function loadTemplates() {
  try {
    const raw = localStorage.getItem('claudemd_templates');
    myTemplates = raw ? JSON.parse(raw) : [];
  } catch(e) { myTemplates = []; }
}
export function persistTemplates() {
  try { localStorage.setItem('claudemd_templates', JSON.stringify(myTemplates)); } catch(e) {}
}
export function saveAsTemplate() {
  // Usa la selección si la hay; si no, todo el documento
  const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
  const content = sel.trim() ? sel : editor.value;
  if (!content.trim()) { showToast('No hay contenido para guardar'); return; }
  const name = prompt('Nombre de la plantilla:');
  if (!name || !name.trim()) return;
  const existing = myTemplates.findIndex(t => t.name === name.trim());
  const tpl = { name: name.trim(), content };
  if (existing >= 0) myTemplates[existing] = tpl; else myTemplates.push(tpl);
  persistTemplates();
  renderTemplateFlyout();
  showToast('✓ Plantilla "' + name.trim() + '" guardada');
}
export function deleteTemplate(name) {
  if (!confirm(`¿Borrar la plantilla "${name}"?`)) return;
  myTemplates = myTemplates.filter(t => t.name !== name);
  persistTemplates();
  renderTemplateFlyout();
  showToast('Plantilla borrada');
}
export function insertTemplate(name) {
  const tpl = myTemplates.find(t => t.name === name);
  if (tpl) insertSnippet(tpl.content);
}
// Construye el contenido del flyout de plantillas en la barra lateral
export function renderTemplateFlyout() {
  const fly = document.getElementById('templatesFlyout');
  if (!fly) return;
  let html = '<div class="sb-flyout-title">Archivos de Claude (nueva pestaña)</div>';
  BUILTIN_TEMPLATES.forEach(t => {
    html += `<button class="sb-fly-btn" data-action="newFromTemplate" data-args="${escAttr(JSON.stringify([t.id]))}">${iconGlyph(t.icon)} ${escHtml(t.name)}</button>`;
  });
  html += '<div class="sb-flyout-title" style="margin-top:6px">Mis plantillas</div>';
  html += '<button class="sb-fly-btn" data-action="saveAsTemplate">＋ Guardar actual como plantilla</button>';
  if (!myTemplates.length) {
    html += '<div style="padding:8px 10px;font-size:11.5px;color:var(--text-muted);font-style:italic">Aún no tienes plantillas. Selecciona texto (o todo) y pulsa arriba para guardar.</div>';
  } else {
    myTemplates.forEach(t => {
      const safe = escHtml(t.name);
      html += `<div class="sb-tpl-row">
        <button class="sb-fly-btn sb-tpl-use" data-action="insertTemplate" data-args="${escAttr(JSON.stringify([t.name]))}">› ${safe}</button>
        <button class="sb-tpl-del" title="Borrar" data-action="deleteTemplate" data-args="${escAttr(JSON.stringify([t.name]))}" data-stop>×</button>
      </div>`;
    });
  }
  fly.innerHTML = html;
}

// Catálogo de comandos
export function buildCommands() {
  return [
    { group:'Archivo', icon:'💾', name:'Guardar', kbd:'Ctrl+S', run:saveFile },
    { group:'Archivo', icon:'💾', name:'Guardar como…', kbd:'Ctrl+⇧+S', run:saveFileAs },
    { group:'Archivo', icon:'⬇', name:'Descargar .md', run:downloadMD },
    { group:'Archivo', icon:'⬇', name:'Exportar… (PDF, Word, HTML, enlace)', run:openExport },
    { group:'Archivo', icon:'🌐', name:'Exportar a HTML', run:exportHTML },
    { group:'Archivo', icon:'📑', name:'Exportar a Word (.docx)', run:exportDOCX },
    { group:'Archivo', icon:'🔗', name:'Copiar enlace para compartir', run:copyShareLink },
    { group:'Archivo', icon:'📑', name:'Exportar a PDF', run:exportPDF },
    { group:'Archivo', icon:'📝', name:'Exportar a texto plano', run:exportTXT },
    { group:'Archivo', icon:'⎘', name:'Copiar Markdown', run:copyMD },
    { group:'Archivo', icon:'📄', name:'Nueva pestaña', kbd:'Ctrl+N', run:newTab },
    { group:'Archivo', icon:'📂', name:'Abrir archivo…', kbd:'Ctrl+O', run:openFile },
    { group:'Archivo', icon:'📁', name:'Abrir carpeta…', run:openFolder },
    { group:'Archivo', icon:'🏠', name:'Ir a la pantalla de inicio', run:showHome },
    { group:'Ayuda', icon:'▶', name:'Tutorial animado (vídeo)', run:startTutorial },
    { group:'Ayuda', icon:'ℹ', name:'Recorrido guiado', run:startTour },
    ...(isInstalled() ? [] : [{ group:'Ayuda', icon:'⬇', name:'Instalar como aplicación', run:installApp }]),
    { group:'Archivo', icon:'⇄', name:'Ver cambios sin guardar', run:()=>showDiff() },
    { group:'Archivo', icon:'↺', name:'Historial de versiones', run:openHistory },
    { group:'Claude', icon:'✓', name:'Comprobar archivo de Claude (skill, agente, CLAUDE.md…)', run:showClaudeCheck },
    ...BUILTIN_TEMPLATES.map(t => ({ group:'Claude', icon:t.icon, name:'Nuevo desde plantilla: ' + t.name, run:()=>newFromTemplate(t.id) })),
    { group:'Ver', icon:'📖', name:'Modo lectura', run:toggleReader },
    { group:'Editar', icon:'🔍', name:'Buscar', kbd:'Ctrl+F', run:()=>openFind(false) },
    { group:'Editar', icon:'⇄', name:'Buscar y reemplazar', kbd:'Ctrl+H', run:()=>openFind(true) },
    { group:'Editar', icon:'↩', name:'Deshacer', kbd:'Ctrl+Z', run:undo },
    { group:'Editar', icon:'↪', name:'Rehacer', kbd:'Ctrl+Y', run:redo },
    { group:'Ver', icon:'⊟', name:'Vista dividida', run:()=>setView('split') },
    { group:'Ver', icon:'✏', name:'Solo editor', run:()=>setView('editor') },
    { group:'Ver', icon:'👁', name:'Solo vista previa', run:()=>setView('preview') },
    { group:'Ver', icon:'☰', name:'Mostrar/ocultar índice', run:toggleTOC },
    { group:'Ver', icon:'↵', name:'Ajuste de línea', run:toggleWordWrap },
    { group:'Ver', icon:'🧘', name:'Modo concentración', run:toggleZen },
    { group:'Ver', icon:'→', name:'Ir a línea…', kbd:'Ctrl+G', run:goToLine },
    { group:'Ver', icon:'📊', name:'Estadísticas del documento', run:openStats },
    { group:'Prompt', icon:'▤', name:'Guardar como plantilla', run:saveAsTemplate },
    { group:'Ver', icon:'✦', name:'Apariencia / ajustes visuales', run:openSettings },
    { group:'Formato', icon:'H', name:'Encabezado 1', run:()=>insertHeading(1) },
    { group:'Formato', icon:'H', name:'Encabezado 2', run:()=>insertHeading(2) },
    { group:'Formato', icon:'𝐁', name:'Negrita', kbd:'Ctrl+B', run:()=>wrap('**','**') },
    { group:'Formato', icon:'𝐼', name:'Cursiva', kbd:'Ctrl+I', run:()=>wrap('*','*') },
    { group:'Formato', icon:'⊞', name:'Insertar tabla', run:()=>insertBlock('table') },
    { group:'Formato', icon:'</>', name:'Bloque de código', run:()=>insertBlock('code') },
    { group:'Formato', icon:'☑', name:'Lista de tareas', run:()=>insertBlock('task') },
    { group:'Snippet de prompt', icon:'✦', name:'Estructura completa de prompt', run:()=>insertSnippet(promptSnippets.full) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Rol', run:()=>insertSnippet(promptSnippets.rol) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Contexto', run:()=>insertSnippet(promptSnippets.contexto) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Tarea', run:()=>insertSnippet(promptSnippets.tarea) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Reglas', run:()=>insertSnippet(promptSnippets.reglas) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Formato de salida', run:()=>insertSnippet(promptSnippets.formato) },
    { group:'Snippet de prompt', icon:'✦', name:'Sección: Ejemplos (few-shot)', run:()=>insertSnippet(promptSnippets.ejemplos) },
    { group:'Snippet de prompt', icon:'✦', name:'Instrucción: pensar paso a paso', run:()=>insertSnippet(promptSnippets.pasos) },
    { group:'Snippet de prompt', icon:'✦', name:'Etiqueta XML de instrucciones', run:()=>insertSnippet(promptSnippets.xmltag) },
  ];
}

// ── Paleta de comandos v2: comandos + archivos + pestañas + títulos + recientes ──
export let _cmdRecents = [];
export let _cmdMode = '';           // '', '>', '#', '@', ':'

export function openCmd() {
  cmdOverlay.classList.add('open');
  cmdInput.value = '';
  cmdSelIndex = 0;
  cmdInput.setAttribute('aria-expanded', 'true');
  listRecents().then(r => { _cmdRecents = r; if (cmdOverlay.classList.contains('open')) filterCmd(); }).catch(() => {});
  filterCmd();
  cmdInput.focus();
}
export function closeCmd() {
  cmdOverlay.classList.remove('open');
  cmdInput.setAttribute('aria-expanded', 'false');
  if (S.currentView === 'preview') { const b = preview.querySelector('.md-blk[contenteditable="true"]'); if (b) return; }
  editor.focus();
}

// Coincidencia difusa: letras en orden, con bonus por palabra nueva y letras seguidas
export function fuzzyMatch(q, text) {
  const s = text.toLowerCase();
  const pos = [];
  let qi = 0, score = 0, last = -2;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      score += (i === last + 1 ? 5 : 1) + (i === 0 || ' -_/.'.includes(s[i - 1]) ? 4 : 0);
      pos.push(i); last = i; qi++;
    }
  }
  if (qi < q.length) return null;
  if (s.includes(q)) score += 12;                // la subcadena exacta gana siempre
  return { score: score - s.length * 0.04, pos };
}

export function highlightMatch(text, pos) {
  if (!pos || !pos.length) return escHtml(text);
  const set = new Set(pos);
  let out = '';
  [...text].forEach((ch, i) => { out += set.has(i) ? `<mark>${escHtml(ch)}</mark>` : escHtml(ch); });
  return out;
}

export function paletteSources() {
  const items = [];
  const tabItems = S.tabs.filter(t => t.id !== S.activeTabId).map(t => ({ group: 'Pestañas', icon: '📄', name: t.name + '.md', run: () => switchTab(t.id) }));
  const recents = _cmdRecents.map(r => ({ group: 'Recientes', icon: r.kind === 'dir' ? '📁' : '📄', name: r.name, hint: r.meta && r.meta.title, run: () => openRecent(r) }));
  const files = wsFileList().map(f => ({ group: 'Archivos', icon: '📄', name: f.path, hint: f.title, run: () => openWorkspaceFile(f.segs) }));
  const heads = getHeadings().map((h, i) => ({ group: 'Títulos', icon: '≡', name: h.text, hint: 'H' + h.level, run: () => jumpToHeading(h, i) }));
  return { commands: buildCommands(), tabs: tabItems, recents, files, heads };
}

export function filterCmd() {
  let q = cmdInput.value.trim();
  _cmdMode = '';
  if (/^[>#@:]/.test(q)) { _cmdMode = q[0]; q = q.slice(1).trim(); }
  const src = paletteSources();

  if (_cmdMode === ':') {
    const n = parseInt(q, 10);
    cmdFiltered = Number.isFinite(n) ? [{ group: 'Ir a', icon: '→', name: `Línea ${n}`, run: () => goToLineNumber(n) }] : [];
    cmdHint = 'Escribe un número de línea';
    return renderCmd();
  }
  let pool;
  if (_cmdMode === '>') pool = src.commands;
  else if (_cmdMode === '#') pool = src.heads;
  else if (_cmdMode === '@') pool = [...src.files, ...src.tabs, ...src.recents];
  else pool = [...src.commands, ...src.tabs, ...src.files, ...src.heads, ...src.recents];

  if (!q) {
    // Sin texto: pestañas y recientes primero, luego los comandos agrupados
    cmdFiltered = _cmdMode ? pool.slice(0, 60)
      : [...src.tabs, ...src.recents.slice(0, 5), ...src.commands];
  } else {
    const ql = q.toLowerCase();
    cmdFiltered = pool.map(c => {
      const m = fuzzyMatch(ql, c.name) || (c.hint ? (() => { const h = fuzzyMatch(ql, c.hint); return h && { score: h.score - 6, pos: [] }; })() : null);
      return m ? { c, score: m.score, pos: m.pos } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 60).map(x => ({ ...x.c, _pos: x.pos }));
  }
  cmdHint = '';
  if (cmdSelIndex >= cmdFiltered.length) cmdSelIndex = 0;
  renderCmd();
}
export let cmdHint = '';

export function renderCmd() {
  cmdResults.setAttribute('role', 'listbox');
  if (!cmdFiltered.length) {
    cmdResults.innerHTML = `<div class="cmd-empty" role="presentation">${cmdHint || 'Sin coincidencias'}</div>`;
    cmdInput.removeAttribute('aria-activedescendant');
    return;
  }
  cmdResults.innerHTML = '';
  const grouped = !cmdInput.value.trim() || _cmdMode === '>';
  let lastGroup = null;
  cmdFiltered.forEach((c, i) => {
    if (grouped && c.group !== lastGroup) {
      const gl = document.createElement('div');
      gl.className = 'cmd-group-label'; gl.setAttribute('role', 'presentation');
      gl.textContent = c.group;
      cmdResults.appendChild(gl);
      lastGroup = c.group;
    }
    const item = document.createElement('div');
    item.className = 'cmd-item' + (i === cmdSelIndex ? ' sel' : '');
    item.id = 'cmd-opt-' + i;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === cmdSelIndex));
    item.innerHTML = `<span class="cmd-icon">${iconGlyph(c.icon)}</span>` +
      `<span class="cmd-name">${highlightMatch(c.name, c._pos)}${c.hint ? `<small>${escHtml(c.hint)}</small>` : ''}</span>` +
      (c.kbd ? `<span class="cmd-kbd">${c.kbd}</span>` : (grouped ? '' : `<span class="cmd-kbd">${escHtml(c.group)}</span>`));
    item.onclick = () => runCmd(i);
    item.onmouseenter = () => { cmdSelIndex = i; updateCmdSel(); };
    cmdResults.appendChild(item);
  });
  cmdInput.setAttribute('aria-activedescendant', 'cmd-opt-' + cmdSelIndex);
}

export function updateCmdSel() {
  cmdResults.querySelectorAll('.cmd-item').forEach((el, i) => {
    el.classList.toggle('sel', i === cmdSelIndex);
    el.setAttribute('aria-selected', String(i === cmdSelIndex));
  });
  cmdInput.setAttribute('aria-activedescendant', 'cmd-opt-' + cmdSelIndex);
  const sel = cmdResults.querySelectorAll('.cmd-item')[cmdSelIndex];
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

export function runCmd(i) {
  const c = cmdFiltered[i];
  if (!c) return;
  closeCmd();
  setTimeout(() => c.run(), 30);
}

// Ir a línea N: en el editor, o al bloque equivalente si solo hay vista previa
export function goToLineNumber(n) {
  const lines = editor.value.split('\n');
  const line = Math.max(1, Math.min(n, lines.length));
  const pos = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
  if (S.currentView === 'preview') {
    const blk = [...preview.querySelectorAll('.md-blk')].reverse().find(b => +b.dataset.s <= pos);
    if (blk) { blk.scrollIntoView({ block: 'center', behavior: 'smooth' }); flashElement(blk); }
  } else {
    editor.focus(); scrollEditorToPos(pos, 0); editor.setSelectionRange(pos, pos);
  }
}

cmdInput.addEventListener('input', () => { cmdSelIndex = 0; filterCmd(); });
cmdInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelIndex = Math.min(cmdSelIndex+1, cmdFiltered.length-1); updateCmdSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelIndex = Math.max(cmdSelIndex-1, 0); updateCmdSel(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSelIndex); }
  else if (e.key === 'Escape') { e.preventDefault(); closeCmd(); }
});
cmdOverlay.addEventListener('click', e => { if (e.target === cmdOverlay) closeCmd(); });
