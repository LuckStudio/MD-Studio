import { on } from './events.ts';
import { S, preview } from './state.js';
import { MD_EXT, resolveRelative } from './fs.js';
import { escAttr, escHtml, getActiveTab } from './tabs.js';
import { openFolder } from './files.js';
import { flashElement } from './preview-sync.js';
import { findInput, findNav, openFind, runFind } from './find.js';
import { showToast } from './actions.js';
import { addRecent, persistTabRefs } from './recents.js';
import { buildWorkspaceIndex } from './wsindex.js';
import { hideHome, openRefs } from './home.js';

// ═══════════════════════════════════════════════════
// CARPETA DE TRABAJO (wsFolder): explorador, búsqueda y rutas relativas
// ═══════════════════════════════════════════════════
export let wsFolder = null;           // { root: DirRef, name, id }
export let _wsCounter = 0;
export const filesPanel = document.getElementById('filesPanel');
export const filesTree = document.getElementById('filesTree');
export const filesFilter = document.getElementById('filesFilter');
export const filesResults = document.getElementById('filesResults');
export const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', '__pycache__']);

export async function setWorkspace(dir) {
  if (!(await dir.permission('read', true))) { showToast('⚠ Permiso denegado para la carpeta'); return; }
  clearResourceCache();
  wsFolder = { root: dir, name: dir.name, id: ++_wsCounter };
  addRecent(dir);
  document.getElementById('filesTitle').textContent = dir.name;
  filesFilter.value = '';
  filesResults.hidden = true;
  filesTree.hidden = false;
  await renderTreeRoot();
  buildWorkspaceIndex();   // en segundo plano
  openFilesPanel(true);
  hideHome();
  showToast('✓ Carpeta abierta: ' + dir.name);
}

export function closeFolder() {
  wsFolder = null;
  S.wsIndex = null;
  clearResourceCache();
  S.tabs.forEach(t => { t.relPath = null; });
  filesTree.innerHTML = '';
  openFilesPanel(false);
  persistTabRefs();
}

export function openFilesPanel(open) {
  filesPanel.classList.toggle('open', open);
  document.getElementById('filesToggleBtn')?.classList.toggle('active', open);
}

export function toggleFiles() {
  if (!wsFolder) { openFolder(); return; }
  openFilesPanel(!filesPanel.classList.contains('open'));
}

// ── Árbol ──
export async function listMarkdown(dir) {
  const entries = await dir.list();
  return entries
    .filter(e => e.kind === 'dir' ? (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) : MD_EXT.test(e.name))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es', { numeric: true }) : a.kind === 'dir' ? -1 : 1));
}

export async function renderTreeRoot() {
  filesTree.innerHTML = '';
  await fillTree(filesTree, wsFolder.root, []);
}

export async function fillTree(container, dir, segs) {
  let entries;
  try { entries = await listMarkdown(dir); }
  catch (e) { container.innerHTML = '<div class="ft-empty">No se pudo leer la carpeta</div>'; return; }
  if (!entries.length) { container.innerHTML = '<div class="ft-empty">Sin archivos Markdown</div>'; return; }
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'ft-row ' + e.kind;
    row.style.setProperty('--depth', segs.length);
    row.dataset.path = [...segs, e.name].join('/');
    row.tabIndex = 0;
    row.innerHTML = `<span class="ft-ic">${e.kind === 'dir' ? '▸' : '✦'}</span><span class="ft-name">${escHtml(e.name)}</span>`;
    container.appendChild(row);
    if (e.kind === 'dir') {
      const kids = document.createElement('div');
      kids.className = 'ft-kids'; kids.hidden = true;
      container.appendChild(kids);
      let loaded = false;
      const toggle = async () => {
        kids.hidden = !kids.hidden;
        row.classList.toggle('open', !kids.hidden);
        row.querySelector('.ft-ic').textContent = kids.hidden ? '▸' : '▾';
        if (!loaded && !kids.hidden) { loaded = true; await fillTree(kids, await dir.dirAt([e.name]), [...segs, e.name]); }
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    } else {
      const open = () => openWorkspaceFile([...segs, e.name]);
      row.addEventListener('click', open);
      row.addEventListener('keydown', ev => { if (ev.key === 'Enter') open(); });
    }
  }
  highlightActiveInTree();
}

export function highlightActiveInTree() {
  const t = getActiveTab();
  const cur = t && t.relPath ? t.relPath.join('/') : null;
  filesTree.querySelectorAll('.ft-row.file').forEach(r => r.classList.toggle('active', r.dataset.path === cur));
}

export async function openWorkspaceFile(segs, { anchor, view } = {}) {
  if (!wsFolder) return;
  try {
    const ref = await wsFolder.root.fileAt(segs);
    await openRefs([ref], { relPath: segs, view });
    if (anchor) scrollPreviewToId(anchor);
    highlightActiveInTree();
  } catch (e) {
    showToast(e.name === 'NotFoundError' ? '✕ No existe: ' + segs.join('/') : 'Error al abrir: ' + e.message);
  }
}

// ── Filtro por nombre y búsqueda en contenido ──
filesFilter.addEventListener('input', () => {
  const q = filesFilter.value.trim().toLowerCase();
  if (!q) { filesResults.hidden = true; filesTree.hidden = false; return; }
  // Con texto, el árbol se sustituye por una lista plana (el contenido se busca con Enter)
  filesTree.hidden = true; filesResults.hidden = false;
  filesResults.innerHTML = '<div class="ft-empty">Pulsa Enter para buscar «' + escHtml(filesFilter.value) + '» en el contenido de todos los archivos</div>';
  searchNames(q);
});
filesFilter.addEventListener('keydown', e => {
  if (e.key === 'Enter' && filesFilter.value.trim()) searchContent(filesFilter.value.trim());
  if (e.key === 'Escape') { filesFilter.value = ''; filesFilter.dispatchEvent(new Event('input')); }
});

export async function walkMarkdown(dir, segs, visit, state) {
  for (const e of await listMarkdown(dir)) {
    if (state.stop) return;
    if (e.kind === 'dir') await walkMarkdown(await dir.dirAt([e.name]), [...segs, e.name], visit, state);
    else await visit(await dir.fileAt([e.name]), [...segs, e.name]);
  }
}

export async function searchNames(q) {
  const hits = [];
  const state = { stop: false };
  await walkMarkdown(wsFolder.root, [], async (f, segs) => {
    if (segs.join('/').toLowerCase().includes(q)) hits.push(segs);
    if (hits.length >= 100) state.stop = true;
  }, state);
  if (filesFilter.value.trim().toLowerCase() !== q) return;   // el usuario siguió escribiendo
  const head = '<div class="ft-empty">Pulsa Enter para buscar en el contenido</div>';
  filesResults.innerHTML = head + hits.map(s =>
    `<div class="ft-hit" data-path="${escAttr(s.join('/'))}"><span class="ft-name">${escHtml(s.join('/'))}</span></div>`).join('');
  bindHits();
}

export let _searchToken = 0;
export async function searchContent(query) {
  if (!wsFolder) return;
  const token = ++_searchToken;
  const q = query.toLowerCase();
  filesResults.innerHTML = '<div class="ft-empty">Buscando…</div>';
  const out = [];
  const state = { stop: false };
  let scanned = 0;
  await walkMarkdown(wsFolder.root, [], async (f, segs) => {
    if (token !== _searchToken) { state.stop = true; return; }
    if (++scanned > 800) { state.stop = true; return; }
    try {
      const { text, size } = await f.read();
      if (size > 2_000_000) return;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && out.length < 300; i++) {
        if (lines[i].toLowerCase().includes(q)) out.push({ segs, line: i + 1, text: lines[i].trim().slice(0, 140) });
      }
    } catch (e) {}
    if (out.length >= 300) state.stop = true;
  }, state);
  if (token !== _searchToken) return;
  if (!out.length) { filesResults.innerHTML = `<div class="ft-empty">Sin resultados para «${escHtml(query)}»</div>`; return; }
  const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  filesResults.innerHTML = out.map(h =>
    `<div class="ft-hit" data-path="${escAttr(h.segs.join('/'))}" data-line="${h.line}">
       <span class="ft-name">${escHtml(h.segs.join('/'))}:${h.line}</span>
       <span class="ft-snip">${escHtml(h.text).replace(re, '<mark>$1</mark>')}</span></div>`).join('');
  bindHits(query);
}

export function bindHits(query) {
  filesResults.querySelectorAll('.ft-hit').forEach(el => el.addEventListener('click', async () => {
    const segs = el.dataset.path.split('/');
    await openWorkspaceFile(segs, { view: S.currentView === 'preview' ? 'split' : undefined });
    if (query) { openFind(false); findInput.value = query; runFind(); findNav(1); }
  }));
}

// ═══════════════════════════════════════════════════
// RUTAS RELATIVAS: imágenes y enlaces a otros .md
// ═══════════════════════════════════════════════════
// Carpeta desde la que se resuelven las rutas relativas de una pestaña, o null.
export function baseDirFor(tab) {
  if (!tab || !tab.file) return null;
  if (wsFolder && tab.relPath) return { dir: wsFolder.root, segs: tab.relPath.slice(0, -1), key: 'w' + wsFolder.id };
  return null;
}

export const _resourceCache = new Map();   // clave → URL blob
export function clearResourceCache() { _resourceCache.forEach(u => URL.revokeObjectURL(u)); _resourceCache.clear(); }
export function resourceKey(base, segs) { return base.key + '|' + segs.join('/'); }

// Síncrono: URL ya resuelta o null
export function cachedResourceUrl(tab, href) {
  const base = baseDirFor(tab);
  const segs = base && resolveRelative(base.segs, href);
  return segs ? _resourceCache.get(resourceKey(base, segs)) || null : null;
}

export async function resolveResourceUrl(tab, href) {
  const base = baseDirFor(tab);
  const segs = base && resolveRelative(base.segs, href);
  if (!segs) return null;
  const key = resourceKey(base, segs);
  if (_resourceCache.has(key)) return _resourceCache.get(key);
  try {
    const f = await base.dir.fileAt(segs);
    const { blob } = await f.readBlob();
    const url = URL.createObjectURL(blob);
    _resourceCache.set(key, url);
    return url;
  } catch (e) { return null; }
}

// Abre un enlace relativo a otro Markdown (con #ancla opcional). Devuelve true si lo gestionó.
export async function openRelativeLink(tab, href) {
  const base = baseDirFor(tab);
  const segs = base && resolveRelative(base.segs, href);
  if (!segs || !MD_EXT.test(segs[segs.length - 1])) return false;
  const anchor = (href.split('#')[1] || '') && decodeURIComponent(href.split('#')[1]);
  try {
    const ref = await base.dir.fileAt(segs);
    const relPath = base.key.startsWith('w') ? segs : null;
    await openRefs([ref], { relPath });
    if (anchor) scrollPreviewToId(anchor);
  } catch (e) {
    showToast('✕ No se pudo abrir ' + href);
  }
  return true;
}

export function scrollPreviewToId(id) {
  const el = document.getElementById(id) || preview.querySelector(`[id="${CSS.escape(id)}"]`);
  if (el && preview.contains(el)) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); flashElement(el); }
}

// Clics en la vista previa: anclas internas y enlaces relativos a otros .md
preview.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || !preview.contains(a)) return;
  if (document.body.classList.contains('pv-edit') && !(e.ctrlKey || e.metaKey)) return;   // al editar, un clic solo coloca el cursor
  const href = a.getAttribute('href');
  if (href.startsWith('#')) { e.preventDefault(); scrollPreviewToId(decodeURIComponent(href.slice(1))); return; }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//')) {
    e.preventDefault();
    openRelativeLink(getActiveTab(), href).then(done => {
      if (!done) showToast('Enlace local sin carpeta abierta: ' + href);
    });
  }
});

on('doc:rendered', highlightActiveInTree);