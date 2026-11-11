import { fadeSwap, playDocEnter } from './motion.js';
import { S, editor } from './state.js';
import { debouncedSaveToLS } from './storage.js';
import { updatePreview } from './render.js';
import { updateCursor, updateModifiedIndicator } from './editor.js';
import { showToast } from './actions.js';
import { renderTOC, tocOpen } from './view.js';
import { endPreviewEdit } from './preview-edit.js';
import { hideHome, isPristineTab } from './home.js';

// ═══════════════════════════════════════════════════
// TAB MANAGEMENT
// ═══════════════════════════════════════════════════
export function createTab(name='sin-título', content='') {
  // Si la única pestaña es la de bienvenida/vacía, se sustituye en vez de acumularla
  if (S.tabs.length === 1 && isPristineTab(S.tabs[0])) S.tabs = [];
  const id = ++S.tabIdCounter;
  const tab = {
    id, name, content,
    savedContent: content,
    undoStack: [content],
    redoStack: [],
    file: null,        // FileRef (ver fs.js) o null si no está en disco
    relPath: null,     // segmentos relativos a la carpeta abierta, si viene de ella
    diskMtime: null,   // última fecha de modificación conocida en disco
    modified: false
  };
  S.tabs.push(tab);
  if (!document.documentElement.classList.contains('booting')) S.newTabId = id;   // solo la pestaña que abre el usuario entra animada
  return tab;
}

export function getActiveTab() {
  return S.tabs.find(t => t.id === S.activeTabId) || null;
}

export function switchTab(id) {
  endPreviewEdit();
  // Save current editor state to active tab
  const cur = getActiveTab();
  if (cur) {
    cur.content = editor.value;
  }
  S.activeTabId = id;
  const tab = S.tabs.find(t => t.id === id);
  if (!tab) return;
  hideHome();   // abrir/cambiar de documento siempre lleva al editor
  editor.value = tab.content;
  updatePreview();
  if (cur && cur.id !== id) { fadeSwap(document.querySelector('.preview-scroll')); fadeSwap(document.getElementById('editorStack'), 0.5); playDocEnter(); }
  updateCursor();
  renderTabs();
  updateModifiedIndicator();
  if (tocOpen) renderTOC();
}

export function newTab() {
  const tab = createTab('sin-título', '');
  renderTabs();
  switchTab(tab.id);
  editor.focus();
  showToast('✓ Nueva pestaña creada');
}

export function closeActiveTab() {
  const tab = getActiveTab();
  if (!tab) return;
  if (S.tabs.length === 1) {
    // Don't close last tab, just clear
    if (tab.content.trim() && !confirm('¿Borrar el contenido de esta pestaña?')) return;
    tab.content = ''; tab.savedContent = ''; tab.modified = false;
    editor.value = '';
    updatePreview();
    renderTabs();
    return;
  }
  if (tab.modified && !confirm(`¿Cerrar "${tab.name}" sin guardar los cambios?`)) return;
  const idx = S.tabs.findIndex(t => t.id === tab.id);
  S.tabs.splice(idx, 1);
  const next = S.tabs[Math.max(0, idx - 1)];
  switchTab(next.id);
  showToast(`✕ Pestaña "${tab.name}" cerrada`);
}

export function renameTab(id, newName) {
  const tab = S.tabs.find(t => t.id === id);
  if (tab && newName.trim()) {
    tab.name = newName.trim();
    renderTabs();
    debouncedSaveToLS();
  }
}

export function renderTabs() {
  const list = document.getElementById('tabsList');
  list.innerHTML = '';
  S.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab-item' + (tab.id === S.activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '');
    el.dataset.id = tab.id;
    if (tab.id === S.newTabId) el.classList.add('tab-new');
    el.innerHTML = `
      <button class="tab-main" tabindex="-1"><span class="tab-dot"></span><span class="tab-label">${escHtml(tab.name)}.md</span></button>
      <button class="tab-close" data-action="closeTab" data-args="[${tab.id}]" data-stop tabindex="-1">×</button>
    `;
    el.querySelector('.tab-label').addEventListener('dblclick', e => startRenameTab(tab.id, e.currentTarget));
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close') && !e.target.closest('input')) switchTab(tab.id);
    });
    list.appendChild(el);
  });
  if (S.newTabId) setTimeout(() => { S.newTabId = null; }, 0);   // los repintados del mismo instante conservan la entrada
}

export function escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
export function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function startRenameTab(id, labelEl) {
  const tab = S.tabs.find(t => t.id === id);
  if (!tab) return;
  const input = document.createElement('input');
  input.value = tab.name;
  input.onclick = e => e.stopPropagation();
  input.onblur = () => { renameTab(id, input.value); };
  input.onkeydown = e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { renderTabs(); }
    e.stopPropagation();
  };
  labelEl.innerHTML = '';
  labelEl.appendChild(input);
  input.focus();
  input.select();
}

export function closeTab(id) {
  if (id === S.activeTabId) { closeActiveTab(); return; }
  const tab = S.tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.modified && !confirm(`¿Cerrar "${tab.name}" sin guardar?`)) return;
  S.tabs = S.tabs.filter(t => t.id !== id);
  renderTabs();
  debouncedSaveToLS();
}
