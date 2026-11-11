import { parseFrontMatter } from './frontmatter.ts';
import { S } from './state.js';
import { canOpenFiles, deserializeRef } from './fs.js';
import { renderRecents } from './home.js';

// ═══════════════════════════════════════════════════
// PERSISTENCIA EN IndexedDB: recientes y archivo de cada pestaña
// ═══════════════════════════════════════════════════
// Los FileSystemHandle se pueden guardar en IndexedDB (no en localStorage). Los permisos del
// navegador caducan entre sesiones: se vuelven a pedir con un clic (ref.permission('read', true)).
export const IDB_NAME = 'claudemd';
export const IDB_VERSION = 3;
export const RECENTS_MAX = 12;
export const recentsSupported = 'indexedDB' in window && canOpenFiles;

export function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recents')) db.createObjectStore('recents', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('versions')) db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }).createIndex('key', 'key');
      if (!db.objectStoreNames.contains('tabrefs')) db.createObjectStore('tabrefs', { keyPath: 'tabId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Ejecuta fn(store) dentro de una transacción y resuelve con el resultado de la petición
export async function idb(storeName, mode, fn) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

// ── Recientes (archivos y carpetas) ──
export async function listRecents() {
  if (!recentsSupported) return [];
  try {
    const all = (await idb('recents', 'readonly', s => s.getAll())) || [];
    return all.map(r => ({ ...r, ref: deserializeRef(r.ref || { backend: 'fsa', kind: 'file', handle: r.handle }) }))
              .filter(r => r.ref)
              .sort((a, b) => b.openedAt - a.openedAt);
  } catch (e) {
    console.warn('Recientes no disponibles:', e);
    return [];
  }
}

export async function addRecent(ref, meta) {
  if (!recentsSupported || !ref) return;
  try {
    const all = await listRecents();
    let existing = null;
    for (const r of all) if (r.ref.kind === ref.kind && await r.ref.isSame(ref)) { existing = r; break; }
    const record = { kind: ref.kind, name: ref.name, ref: ref.serialize(), openedAt: Date.now(), meta: meta || (existing && existing.meta) || null };
    if (existing) record.id = existing.id;
    await idb('recents', 'readwrite', s => s.put(record));
    const extra = (await listRecents()).slice(RECENTS_MAX);
    for (const r of extra) await idb('recents', 'readwrite', s => s.delete(r.id));
  } catch (e) {
    console.warn('No se pudo guardar en recientes:', e);
  }
  if (typeof renderRecents === 'function') renderRecents();
}

export async function removeRecent(id) {
  try { await idb('recents', 'readwrite', s => s.delete(id)); } catch (e) {}
  renderRecents();
}

export async function clearRecents() {
  if (!confirm('¿Vaciar la lista de recientes? Los archivos no se borran.')) return;
  try { await idb('recents', 'readwrite', s => s.clear()); } catch (e) {}
  renderRecents();
}

// ── Archivo asociado a cada pestaña (sobrevive a recargas) ──
export let _tabRefsSig = '';
export async function persistTabRefs() {
  if (!recentsSupported) return;
  const rows = S.tabs.filter(t => t.file).map(t => ({
    tabId: t.id, ref: t.file.serialize(), relPath: t.relPath, diskMtime: t.diskMtime,
  }));
  const sig = rows.map(r => `${r.tabId}|${r.ref.name}|${r.ref.path || ''}|${r.relPath}|${r.diskMtime}`).join(';');
  if (sig === _tabRefsSig) return;
  _tabRefsSig = sig;
  try {
    await idb('tabrefs', 'readwrite', s => s.clear());
    for (const r of rows) await idb('tabrefs', 'readwrite', s => s.put(r));
  } catch (e) { console.warn('No se pudieron guardar los archivos de las pestañas:', e); }
}

export async function restoreTabRefs() {
  if (!recentsSupported) return;
  try {
    const rows = (await idb('tabrefs', 'readonly', s => s.getAll())) || [];
    for (const r of rows) {
      const tab = S.tabs.find(t => t.id === r.tabId);
      const ref = deserializeRef(r.ref);
      if (tab && ref) { tab.file = ref; tab.relPath = r.relPath || null; tab.diskMtime = r.diskMtime || null; }
    }
    _tabRefsSig = '';
  } catch (e) { console.warn('No se pudieron restaurar los archivos de las pestañas:', e); }
}

// Título y extracto del documento: se guardan con el reciente para pintar las tarjetas del inicio
export function docMeta(text) {
  const fm = parseFrontMatter(text);
  const body = fm && fm.body !== undefined ? fm.body : text;
  const h = body.match(/^#\s+(.+)$/m);
  const title = (fm && fm.data && typeof fm.data.name === 'string' && fm.data.name) || (h && h[1].trim()) || '';
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: title.slice(0, 80), excerpt: plain.slice(0, 180) };
}
