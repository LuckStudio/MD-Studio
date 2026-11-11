import { on } from './events.ts';
import { S } from './state.js';
import { resolveRelative, stripMdExt } from './fs.js';
import { updatePreview } from './render.js';
import { docMeta } from './recents.js';
import { walkMarkdown, wsFolder } from './workspace.js';
import { scheduleBacklinks } from './wikilinks.js';

// ═══════════════════════════════════════════════════
// ÍNDICE DE LA CARPETA DE TRABAJO
// ═══════════════════════════════════════════════════
// Lista de archivos .md con título y enlaces salientes. Alimenta la paleta de comandos
// (buscar archivos), los [[wikilinks]] y el panel de retroenlaces. Se construye en segundo
// plano al abrir la carpeta y se actualiza al guardar.
S.wsIndex = null;            // { id, files: Map<ruta, entrada>, ready: Promise }
export const WSI_MAX_FILES = 1500;
export const WSI_MAX_BYTES = 1_000_000;

export function extractLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) out.push({ kind: 'wiki', target: m[1].trim() });
  for (const m of text.matchAll(/\]\(([^)\s]+\.(?:md|markdown))(?:#[^)]*)?\)/gi)) {
    let t = m[1]; try { t = decodeURI(t); } catch (e) { /* tal cual */ }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) out.push({ kind: 'md', target: t });
  }
  return out;
}

export function indexEntry(segs, text) {
  const meta = docMeta(text);
  return { segs, path: segs.join('/'), name: stripMdExt(segs[segs.length - 1]), title: meta.title || '', links: extractLinks(text) };
}

export function buildWorkspaceIndex() {
  if (!wsFolder) { S.wsIndex = null; return; }
  const id = wsFolder.id;
  const files = new Map();
  const state = { stop: false };
  const ready = (async () => {
    let n = 0;
    await walkMarkdown(wsFolder.root, [], async (f, segs) => {
      if (!wsFolder || wsFolder.id !== id) { state.stop = true; return; }
      if (++n > WSI_MAX_FILES) { state.stop = true; return; }
      try {
        const { text, size } = await f.read();
        files.set(segs.join('/'), size > WSI_MAX_BYTES ? { segs, path: segs.join('/'), name: stripMdExt(segs[segs.length - 1]), title: '', links: [] } : indexEntry(segs, text));
      } catch (e) { /* ilegible: se omite */ }
    }, state);
  })();
  S.wsIndex = { id, files, ready };
  ready.then(() => { scheduleBacklinks(); updatePreview(); });   // los [[enlaces]] pueden marcarse como inexistentes
  return ready;
}

export function updateIndexEntry(segs, text) {
  if (S.wsIndex && segs) { S.wsIndex.files.set(segs.join('/'), indexEntry(segs, text)); scheduleBacklinks(); }
}

export const wsFileList = () => (S.wsIndex ? [...S.wsIndex.files.values()] : []);

// [[Nombre]] → entrada del índice: por nombre de archivo (sin extensión) o por ruta, sin distinguir mayúsculas
export function findWikiTarget(name) {
  const q = name.trim().toLowerCase().replace(/\.(md|markdown)$/, '');
  let best = null;
  for (const f of wsFileList()) {
    const full = f.path.toLowerCase().replace(/\.(md|markdown|mdx|txt)$/, '');
    if (full === q) return f;
    if (f.name.toLowerCase() === q || (f.title && f.title.toLowerCase() === q)) best = best || f;
  }
  return best;
}

// Archivos que enlazan a `segs` (con [[wikilink]] o con un enlace relativo)
export function backlinksFor(segs) {
  const me = segs.join('/').toLowerCase();
  const myName = stripMdExt(segs[segs.length - 1]).toLowerCase();
  const out = [];
  for (const f of wsFileList()) {
    if (f.path.toLowerCase() === me) continue;
    const hit = f.links.some(l => {
      if (l.kind === 'wiki') { const t = findWikiTarget(l.target); return t ? t.path.toLowerCase() === me : l.target.toLowerCase() === myName; }
      const r = resolveRelative(f.segs.slice(0, -1), l.target);
      return !!r && r.join('/').toLowerCase() === me;
    });
    if (hit) out.push(f);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'es'));
}

on('doc:saved', ({ tabId }) => { const t = S.tabs.find(x => x.id === tabId); if (t && t.relPath) updateIndexEntry(t.relPath, t.content); });