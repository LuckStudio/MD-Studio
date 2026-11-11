import { on } from './events.ts';
import { S, preview } from './state.js';
import { escHtml, getActiveTab } from './tabs.js';
import { showToast } from './actions.js';
import { openWorkspaceFile, renderTreeRoot, wsFolder } from './workspace.js';
import { backlinksFor, findWikiTarget, updateIndexEntry } from './wsindex.js';

// ═══════════════════════════════════════════════════
// WIKILINKS [[…]], ENLACES EN EDICIÓN Y RETROENLACES
// ═══════════════════════════════════════════════════
export const inEditMode = () => document.body.classList.contains('pv-edit');

// Marca los [[enlaces]] cuyo destino no existe en la carpeta (punteado rojo)
export function enhanceWikilinks(root) {
  root.querySelectorAll('a.wikilink').forEach(a => {
    const t = S.wsIndex ? findWikiTarget(a.dataset.wiki) : null;
    a.classList.toggle('wikilink-missing', !!S.wsIndex && !t);
    a.title = !wsFolder ? 'Abre una carpeta para seguir los [[enlaces]]' : t ? t.path : 'No existe: Ctrl+clic para crearlo';
  });
}

export async function openWikiLink(name, anchor) {
  if (!wsFolder || !S.wsIndex) { showToast('Abre una carpeta (Archivo → Abrir carpeta) para usar [[enlaces]]'); return; }
  await S.wsIndex.ready;
  const t = findWikiTarget(name);
  if (t) { await openWorkspaceFile(t.segs, { anchor }); return; }
  // No existe: se ofrece crearlo junto al documento actual
  if (!confirm(`«${name}» no existe en la carpeta.\n¿Crear ${name.replace(/[\\/:*?"<>|]/g, '-')}.md?`)) return;
  const tab = getActiveTab();
  const dirSegs = tab && tab.relPath ? tab.relPath.slice(0, -1) : [];
  const fname = name.replace(/[\\/:*?"<>|]/g, '-').trim() + '.md';
  try {
    if (!(await wsFolder.root.permission('readwrite', true))) { showToast('⚠ Sin permiso de escritura en la carpeta'); return; }
    const dir = await wsFolder.root.ensureDirAt(dirSegs);
    if (await dir.exists(fname)) { showToast('Ya existe ' + fname); return; }
    await dir.writeFile(fname, '# ' + name + '\n');
    updateIndexEntry([...dirSegs, fname], '# ' + name + '\n');
    await renderTreeRoot();
    await openWorkspaceFile([...dirSegs, fname]);
  } catch (e) { showToast('No se pudo crear: ' + e.message); }
}

// Activación de enlaces. En edición solo con Ctrl/Cmd+clic (un clic normal coloca el cursor)
preview.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a');
  if (!a || !preview.contains(a)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (inEditMode() && !mod) { e.preventDefault(); return; }
  if (a.classList.contains('wikilink')) {
    e.preventDefault(); e.stopImmediatePropagation();
    openWikiLink(a.dataset.wiki, a.dataset.anchor);
  } else if (inEditMode() && mod) {
    const href = a.getAttribute('href') || '';
    if (/^https?:|^mailto:/i.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); window.open(href, '_blank', 'noopener,noreferrer'); }
  }
}, true);

// ── Retroenlaces: quién enlaza al documento actual ──
export const backStatus = document.getElementById('backStatus');
export let _backTimer = null;
export function scheduleBacklinks() { clearTimeout(_backTimer); _backTimer = setTimeout(updateBacklinksStatus, 250); }

export function currentBacklinks() {
  const tab = getActiveTab();
  return tab && tab.relPath && S.wsIndex ? backlinksFor(tab.relPath) : [];
}
export function updateBacklinksStatus() {
  const n = currentBacklinks().length;
  backStatus.hidden = n === 0;
  backStatus.textContent = n ? `↩ ${n} enlace${n > 1 ? 's' : ''} entrante${n > 1 ? 's' : ''}` : '';
}

export function showBacklinks() {
  const list = currentBacklinks();
  const ul = document.getElementById('backList');
  ul.innerHTML = '';
  if (!list.length) ul.innerHTML = '<li class="cl-none">Ningún documento de la carpeta enlaza a este.</li>';
  list.forEach(f => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'hist-item';
    b.innerHTML = `<span class="hi-time">${escHtml(f.title || f.name)}</span><span class="hi-meta">${escHtml(f.path)}</span>`;
    b.addEventListener('click', () => { closeBacklinks(); openWorkspaceFile(f.segs); });
    li.appendChild(b); ul.appendChild(li);
  });
  document.getElementById('backOverlay').classList.add('open');
}
export function closeBacklinks() { document.getElementById('backOverlay').classList.remove('open'); }

on('doc:rendered', scheduleBacklinks);