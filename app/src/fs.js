// ═══════════════════════════════════════════════════
// CAPA DE ARCHIVOS (FileRef / DirRef)
// ═══════════════════════════════════════════════════
// Envoltorio sobre la File System Access API del navegador (Chrome, Edge…). El resto de la
// app solo habla con FileRef/DirRef, así que el origen de los archivos queda aislado aquí.
//
// FileRef: { kind:'file', backend, name, read(), readBlob(), write(text), stat(), isSame(o),
//            permission(mode,ask), serialize() }   read/stat → { text|blob, mtime, size }
// DirRef : { kind:'dir',  backend, name, list(), fileAt(segs), dirAt(segs), isSame(o), permission(), serialize() }

export const hasFsa = !!(window.showOpenFilePicker && window.showDirectoryPicker);
export const canOpenFiles = hasFsa;
export const MD_EXT = /\.(md|markdown|mdx|txt)$/i;

export function stripMdExt(name) { return name.replace(/\.(md|markdown|mdx|txt)$/i, ''); }

// ── Rutas relativas ──
// Resuelve href contra una carpeta base (array de segmentos). Devuelve segmentos
// o null si sale de la raíz o no es una ruta local.
export function resolveRelative(baseSegs, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null;
  let p = href.split('#')[0].split('?')[0];
  try { p = decodeURIComponent(p); } catch (e) {}
  if (!p) return null;
  const segs = p.startsWith('/') ? [] : [...baseSegs];
  for (const s of p.split(/[\\/]/)) {
    if (!s || s === '.') continue;
    if (s === '..') { if (!segs.length) return null; segs.pop(); } else segs.push(s);
  }
  return segs.length ? segs : null;
}

// ═══ FSA ═══
export class FsaFile {
  constructor(handle) { this.handle = handle; this.kind = 'file'; this.backend = 'fsa'; this.name = handle.name; }
  async read() { const f = await this.handle.getFile(); return { text: await f.text(), mtime: f.lastModified, size: f.size }; }
  async readBlob() { const f = await this.handle.getFile(); return { blob: f, mtime: f.lastModified, size: f.size }; }
  async stat() { const f = await this.handle.getFile(); return { mtime: f.lastModified, size: f.size }; }
  async write(text) {
    const w = await this.handle.createWritable();
    await w.write(text); await w.close();
    return (await this.stat()).mtime;
  }
  async isSame(o) { return o && o.backend === 'fsa' && o.kind === 'file' && this.handle.isSameEntry(o.handle).catch(() => false); }
  async permission(mode = 'read', ask = false) {
    const opts = { mode };
    if ((await this.handle.queryPermission(opts)) === 'granted') return true;
    return ask && (await this.handle.requestPermission(opts)) === 'granted';
  }
  serialize() { return { backend: 'fsa', kind: 'file', name: this.name, handle: this.handle }; }
}

export class FsaDir {
  constructor(handle) { this.handle = handle; this.kind = 'dir'; this.backend = 'fsa'; this.name = handle.name; }
  async list() {
    const out = [];
    for await (const [name, h] of this.handle.entries()) out.push({ name, kind: h.kind === 'directory' ? 'dir' : 'file' });
    return out;
  }
  async dirAt(segs) {
    let h = this.handle;
    for (const s of segs) h = await h.getDirectoryHandle(s);
    return new FsaDir(h);
  }
  async fileAt(segs) {
    let h = this.handle;
    for (const s of segs.slice(0, -1)) h = await h.getDirectoryHandle(s);
    return new FsaFile(await h.getFileHandle(segs[segs.length - 1]));
  }
  // Crea (si hace falta) la ruta de carpetas y devuelve la última
  async ensureDirAt(segs) {
    let h = this.handle;
    for (const s of segs) h = await h.getDirectoryHandle(s, { create: true });
    return new FsaDir(h);
  }
  async exists(name) {
    try { await this.handle.getFileHandle(name); return true; } catch (e) { return false; }
  }
  async writeFile(name, data) {
    const fh = await this.handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
    return new FsaFile(fh);
  }
  async isSame(o) { return o && o.backend === 'fsa' && o.kind === 'dir' && this.handle.isSameEntry(o.handle).catch(() => false); }
  async permission(mode = 'read', ask = false) {
    const opts = { mode };
    if ((await this.handle.queryPermission(opts)) === 'granted') return true;
    return ask && (await this.handle.requestPermission(opts)) === 'granted';
  }
  serialize() { return { backend: 'fsa', kind: 'dir', name: this.name, handle: this.handle }; }
}

export function wrapHandle(h) { return h.kind === 'directory' ? new FsaDir(h) : new FsaFile(h); }

// Reconstruye un FileRef/DirRef desde su forma guardada (IndexedDB)
export function deserializeRef(o) {
  if (!o) return null;
  if (o.backend === 'fsa' && o.handle) return o.kind === 'dir' ? new FsaDir(o.handle) : new FsaFile(o.handle);
  return null;
}

// ═══ Diálogos ═══
export async function pickFiles() {
  const hs = await window.showOpenFilePicker({
    multiple: true,
    types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] } }],
  });
  return hs.map(h => new FsaFile(h));
}

export async function pickFolder() {
  return new FsaDir(await window.showDirectoryPicker({ mode: 'readwrite' }));
}

export async function pickSaveFile(suggestedName) {
  const h = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
  });
  return new FsaFile(h);
}

// Convierte un archivo arrastrado en FileRef (Chrome/Edge: handle del DataTransferItem)
export async function refsFromDrop(dataTransfer) {
  const out = [];
  const items = Array.from(dataTransfer.items || []).filter(it => it.kind === 'file');
  if (items.length && 'getAsFileSystemHandle' in DataTransferItem.prototype) {
    // Todas las peticiones salen a la vez: los items dejan de ser válidos al acabar el evento
    const handles = await Promise.all(items.map(it => it.getAsFileSystemHandle()));
    handles.forEach(h => { if (h) out.push(wrapHandle(h)); });
  }
  return out;
}
