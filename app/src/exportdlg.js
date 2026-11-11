import { icon } from './icons.js';
import { parseMarkdown } from './markdown.js';
import { editor } from './state.js';
import { createTab, escHtml, getActiveTab, renderTabs, switchTab } from './tabs.js';
import { downloadMD } from './files.js';
import { exportHTML, exportPDF, exportTXT, inlineBlobImages, loadExportOpts, saveBlobAs, saveExportOpts } from './export.js';
import { showToast } from './actions.js';
import { enhancePreview } from './enhance.js';
import { flushPreviewEdits } from './preview-edit.js';
import { buildDocx } from './docx.js';

// ═══════════════════════════════════════════════════
// DIÁLOGO «EXPORTAR…»: PDF, HTML, Word, texto, Markdown y enlace para compartir
// ═══════════════════════════════════════════════════
export const EXPORT_FORMATS = [
  { id: 'pdf', icon: 'file-text', name: 'PDF', desc: 'Con tu tamaño de papel, márgenes y numeración. Se abre el diálogo de impresión: elige «Guardar como PDF».', opts: true },
  { id: 'html', icon: 'globe', name: 'Página web (.html)', desc: 'Un solo archivo con estilos, código resaltado, fórmulas y diagramas incrustados.', opts: true },
  { id: 'docx', icon: 'file-down', name: 'Word (.docx)', desc: 'Títulos, listas, tablas, enlaces, imágenes y diagramas, con estilos de Word.', opts: false },
  { id: 'txt', icon: 'file-text', name: 'Texto plano (.txt)', desc: 'Solo el texto visible, sin marcas Markdown.', opts: false },
  { id: 'md', icon: 'download', name: 'Markdown (.md)', desc: 'Descarga el documento tal cual.', opts: false },
  { id: 'link', icon: 'share-2', name: 'Enlace para compartir', desc: 'El documento va comprimido dentro del propio enlace: quien lo abra recibe una copia. No se sube a ningún servidor.', opts: false },
];
export let _exportSel = 'pdf';

export function openExport() {
  flushPreviewEdits();
  const o = loadExportOpts();
  document.getElementById('exPaper').value = o.paper;
  document.getElementById('exMargin').value = o.margin;
  document.getElementById('exFont').value = o.font;
  document.getElementById('exSize').value = o.size;
  document.getElementById('exSizeVal').textContent = o.size + ' px';
  document.getElementById('exNumbers').checked = !!o.pageNumbers;
  renderExportFormats();
  document.getElementById('exportOverlay').classList.add('open');
}
export function closeExport() { document.getElementById('exportOverlay').classList.remove('open'); }

export function renderExportFormats() {
  const box = document.getElementById('exFormats');
  box.innerHTML = '';
  EXPORT_FORMATS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'ex-format' + (f.id === _exportSel ? ' sel' : '');
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(f.id === _exportSel));
    b.innerHTML = `${icon(f.icon)}<span><b>${escHtml(f.name)}</b></span>`;
    b.addEventListener('click', () => { _exportSel = f.id; renderExportFormats(); });
    box.appendChild(b);
  });
  const f = EXPORT_FORMATS.find(x => x.id === _exportSel);
  document.getElementById('exDesc').textContent = f.desc;
  document.getElementById('exOptions').hidden = !f.opts;
  document.getElementById('exRun').textContent = f.id === 'link' ? 'Copiar enlace' : 'Exportar';
}

export function readExportForm() {
  return {
    paper: document.getElementById('exPaper').value, margin: document.getElementById('exMargin').value,
    font: document.getElementById('exFont').value, size: +document.getElementById('exSize').value,
    pageNumbers: document.getElementById('exNumbers').checked,
  };
}
document.getElementById('exSize').addEventListener('input', e => { document.getElementById('exSizeVal').textContent = e.target.value + ' px'; });

export async function runExport() {
  saveExportOpts(readExportForm());
  const id = _exportSel;
  closeExport();
  if (id === 'pdf') await exportPDF();
  else if (id === 'html') await exportHTML();
  else if (id === 'docx') await exportDOCX();
  else if (id === 'txt') exportTXT();
  else if (id === 'md') downloadMD();
  else if (id === 'link') await copyShareLink();
}

// Mismo árbol que el export a HTML: renderizado, con diagramas/fórmulas resueltos e imágenes incrustadas
export async function renderExportRoot() {
  const tab = getActiveTab();
  const root = document.createElement('div');
  root.innerHTML = parseMarkdown(editor.value, { plain: true });
  await enhancePreview(root, tab, { export: true });
  root.querySelectorAll('.code-copy').forEach(b => b.remove());
  await inlineBlobImages(root);
  return root;
}

export async function exportDOCX() {
  if (!editor.value.trim()) { showToast('Nada que exportar'); return; }
  flushPreviewEdits();
  showToast('Generando documento de Word…');
  try {
    const name = (getActiveTab()?.name || 'documento');
    const bytes = await buildDocx(await renderExportRoot(), name);
    saveBlobAs(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name + '.docx');
    showToast('✓ Exportado como ' + name + '.docx');
  } catch (e) { console.error(e); showToast('No se pudo generar el .docx: ' + e.message); }
}

// ── Enlace para compartir: deflate + base64url dentro del hash (no sale del navegador) ──
export const SHARE_PREFIX = '#share=';
export const toB64Url = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const fromB64Url = str => { const b = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

export async function pipeThrough(bytes, stream) {
  const w = stream.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
export async function buildShareLink(text) {
  const packed = await pipeThrough(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
  return location.origin + location.pathname + SHARE_PREFIX + toB64Url(packed);
}
export async function readShareHash(hash) {
  const bytes = await pipeThrough(fromB64Url(hash.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(bytes);
}

export async function copyShareLink() {
  flushPreviewEdits();
  const url = await buildShareLink(editor.value);
  try { await navigator.clipboard.writeText(url); } catch (e) { prompt('Copia el enlace:', url); return; }
  const kb = (url.length / 1024).toFixed(1);
  showToast(url.length > 32000 ? `⚠ Enlace copiado (${kb} KB): es largo y algunos programas lo cortarán` : `✓ Enlace copiado (${kb} KB)`);
}

// Al abrir la app con #share=…: se crea una pestaña con el documento recibido
export async function consumeShareHash() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return false;
  try {
    const text = await readShareHash(location.hash);
    const tab = createTab('compartido', text);
    tab.modified = true;
    renderTabs(); switchTab(tab.id);
    showToast('✓ Documento recibido por enlace (es una copia: se guarda en tu navegador)');
  } catch (e) { showToast('El enlace no es válido o está incompleto'); }
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}
window.addEventListener('hashchange', () => { consumeShareHash(); });   // enlace pegado en una pestaña ya abierta
