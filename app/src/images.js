import { S, editor, preview } from './state.js';
import { getActiveTab } from './tabs.js';
import { saveToUndo } from './history.js';
import { showToast } from './actions.js';
import { dropOverlay } from './import.js';
import { _resourceCache, resourceKey, wsFolder } from './workspace.js';
import { pvBlock } from './preview-edit.js';
import { insertBlockAfter } from './blocks.js';

// ═══════════════════════════════════════════════════
// IMÁGENES: pegar, soltar o elegir → se guardan junto al documento
// ═══════════════════════════════════════════════════
// Con una carpeta abierta, la imagen se escribe en «assets/» (dentro de la carpeta del
// documento) y se inserta ![](assets/nombre.png). Sin carpeta se incrusta como data: URI si es
// pequeña; si no, se pide abrir la carpeta. El Markdown queda con rutas relativas normales.
export const IMG_MAX_INLINE = 160 * 1024;
export const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

export const isImageFile = f => f && /^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/.test(f.type);

export function imageFileName(file) {
  const ext = IMG_EXT[file.type] || 'png';
  const base = (file.name && !/^image\.(png|jpe?g)$/i.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return (base || 'imagen-' + stamp) + '.' + ext;
}

export function blobToDataUri(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

// Devuelve la ruta que se debe escribir en el Markdown, o null si no se pudo
export async function storeImage(file) {
  const tab = getActiveTab();
  if (wsFolder && tab && tab.relPath) {
    if (!(await wsFolder.root.permission('readwrite', true))) { showToast('⚠ Sin permiso de escritura en la carpeta'); return null; }
    const docDir = tab.relPath.slice(0, -1);
    const dir = await wsFolder.root.ensureDirAt([...docDir, 'assets']);
    let name = imageFileName(file);
    for (let n = 1; await dir.exists(name); n++) name = name.replace(/(-\d+)?(\.[^.]+)$/, `-${n}$2`);
    await dir.writeFile(name, file);
    _resourceCache.delete(resourceKey({ key: 'w' + wsFolder.id }, [...docDir, 'assets', name]));
    return 'assets/' + encodeURI(name);
  }
  if (file.size <= IMG_MAX_INLINE) return blobToDataUri(file);
  showToast('🖼 Para guardar imágenes grandes abre la carpeta del documento (Archivo → Abrir carpeta)');
  return null;
}

export const imageAlt = file => (file.name ? file.name.replace(/\.[^.]+$/, '') : 'imagen').replace(/[\[\]]/g, '');

export async function insertImagesInPreview(files, blk) {
  let last = blk;
  for (const f of files) {
    const path = await storeImage(f);
    if (!path) continue;
    insertBlockAfter(last, `![${imageAlt(f)}](${path})`, { select: false });
    // insertBlockAfter repinta: el nuevo bloque es el siguiente al que había
    const blocks = [...preview.querySelectorAll('.md-blk')];
    last = blocks.find(b => b.querySelector('img') && +b.dataset.s > +blk.dataset.s) || last;
  }
}

export async function insertImageFromPicker(blk) {
  if (!window.showOpenFilePicker) { showToast('Tu navegador no permite elegir imágenes desde aquí: pega o arrastra una'); return; }
  try {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'Imágenes', accept: { 'image/*': Object.keys(IMG_EXT).map(t => '.' + IMG_EXT[t]) } }] });
    await insertImagesInPreview([await h.getFile()], blk);
  } catch (e) { if (e.name !== 'AbortError') showToast('No se pudo insertar la imagen: ' + e.message); }
}

// ── Vista previa: pegar y soltar ──
preview.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
  if (!files.length) return;
  const blk = pvBlock(e.target);
  if (!blk) return;
  e.preventDefault(); e.stopImmediatePropagation();
  insertImagesInPreview(files, blk);
}, true);

preview.addEventListener('drop', e => {
  const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
  if (!files.length || !document.body.classList.contains('pv-edit')) return;
  e.preventDefault(); e.stopPropagation();
  S.dragCounter = 0; dropOverlay.classList.remove('active');
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.md-blk');
  const blk = over || [...preview.querySelectorAll('.md-blk')].pop();
  if (blk) insertImagesInPreview(files, blk);
}, true);

// ── Editor de texto: pegar y soltar insertan el Markdown en el cursor ──
export async function insertImagesInEditor(files) {
  const parts = [];
  for (const f of files) { const p = await storeImage(f); if (p) parts.push(`![${imageAlt(f)}](${p})`); }
  if (!parts.length) return;
  const s = editor.selectionStart, v = editor.value;
  const text = (s > 0 && v[s - 1] !== '\n' ? '\n\n' : '') + parts.join('\n\n') + '\n';
  saveToUndo();
  editor.value = v.slice(0, s) + text + v.slice(editor.selectionEnd);
  editor.setSelectionRange(s + text.length, s + text.length);
  editor.dispatchEvent(new Event('input'));
}
editor.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
  if (files.length) { e.preventDefault(); insertImagesInEditor(files); }
});
editor.addEventListener('drop', e => {
  const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
  if (!files.length) return;
  e.preventDefault(); e.stopPropagation();
  S.dragCounter = 0; dropOverlay.classList.remove('active');
  insertImagesInEditor(files);
});
