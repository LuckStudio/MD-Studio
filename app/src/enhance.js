import { preview } from './state.js';
import { updatePreview } from './render.js';
import { showToast } from './actions.js';
import { baseDirFor, cachedResourceUrl, resolveResourceUrl } from './workspace.js';
import { enhanceWikilinks } from './wikilinks.js';

// ═══════════════════════════════════════════════════
// COMPLEMENTOS DE LA VISTA PREVIA
// ═══════════════════════════════════════════════════
// Lo que no se puede resolver de forma síncrona en parseMarkdown(): imágenes con ruta
// relativa, fórmulas (KaTeX), diagramas (Mermaid) y botones de copiar. KaTeX y Mermaid
// pesan bastante y solo se cargan la primera vez que un documento los necesita.

// ── Carga perezosa de librerías ──
// En la versión de un solo archivo (dist/) el build deja el código en window.__vendorInline.
export const _vendorLoads = new Map();
export function loadVendor(path, kind) {
  if (_vendorLoads.has(path)) return _vendorLoads.get(path);
  const inline = window.__vendorInline && window.__vendorInline[path];
  const p = new Promise((resolve, reject) => {
    if (kind === 'css') {
      if (inline) { const st = document.createElement('style'); st.textContent = inline; document.head.appendChild(st); return resolve(); }
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = path; l.onload = () => resolve(); l.onerror = () => reject(new Error('No se pudo cargar ' + path));
      document.head.appendChild(l);
    } else {
      const s = document.createElement('script');
      s.src = inline ? URL.createObjectURL(new Blob([inline], { type: 'text/javascript' })) : path;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('No se pudo cargar ' + path));
      document.head.appendChild(s);
    }
  });
  _vendorLoads.set(path, p);
  p.catch(() => _vendorLoads.delete(path));
  return p;
}
export const ensureKatex = () => Promise.all([loadVendor('vendor/katex.min.css', 'css'), loadVendor('vendor/katex.min.js')]);
export const ensureMermaid = () => loadVendor('vendor/mermaid.min.js');

// ── Entrada principal ──
export let _enhanceToken = 0;
// opts.export: trabaja sobre un árbol aparte (exportación) sin invalidar el render en vivo
export async function enhancePreview(root, tab, opts = {}) {
  const token = opts.export ? 0 : ++_enhanceToken;
  const stale = opts.export ? () => false : () => token !== _enhanceToken;
  addCopyButtons(root);
  enhanceWikilinks(root);
  const jobs = [enhanceImages(root, tab), enhanceMath(root, stale), enhanceMermaid(root, stale)];
  await Promise.allSettled(jobs);
}

// ── Botones de copiar en bloques de código ──
export function addCopyButtons(root) {
  root.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector(':scope > .code-copy') || pre.closest('.mermaid-block')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'code-copy';
    b.setAttribute('aria-label', 'Copiar código');
    b.title = 'Copiar código';
    b.setAttribute('contenteditable', 'false');
    pre.appendChild(b);
  });
}
preview.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.code-copy');
  if (!b) return;
  e.stopPropagation();
  const code = b.parentElement.querySelector('code');
  navigator.clipboard.writeText(code ? code.textContent : '').then(() => {
    b.classList.add('copied');
    setTimeout(() => b.classList.remove('copied'), 1400);
  }).catch(() => showToast('No se pudo copiar'));
}, true);

// ── Imágenes con ruta relativa ──
export const _warnedImgTabs = new Set();
export async function enhanceImages(root, tab) {
  const imgs = [...root.querySelectorAll('img[data-rel-src]')];
  if (!imgs.length) return;
  let unresolved = 0;
  await Promise.all(imgs.map(async img => {
    const href = img.getAttribute('data-rel-src');
    const url = cachedResourceUrl(tab, href) || await resolveResourceUrl(tab, href);
    if (url) img.src = url;
    else { unresolved++; img.classList.add('img-unresolved'); img.title = 'No se encuentra: ' + href; }
  }));
  if (unresolved && tab && !_warnedImgTabs.has(tab.id) && !baseDirFor(tab)) {
    _warnedImgTabs.add(tab.id);
    showToast('🖼 Para ver las imágenes relativas abre la carpeta del documento (Archivo → Abrir carpeta)');
  }
}

// ── Fórmulas ──
export async function enhanceMath(root, stale) {
  const els = root.querySelectorAll('.math-inline[data-tex], .math-block[data-tex]');
  if (!els.length) return;
  if (!window.katex) { await ensureKatex(); if (stale()) return; }
  els.forEach(el => {
    if (el.querySelector('.katex')) return;   // ya dibujada (bloque reutilizado)
    try {
      katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('math-block'), throwOnError: false, output: 'htmlAndMathml' });
    } catch (e) { el.classList.add('math-error'); }
  });
}

// ── Mermaid ──
export const _mermaidCache = new Map();   // tema|código → svg
export let _mermaidQueue = Promise.resolve();
export let _mermaidSeq = 0;
export let _mermaidTheme = null;

export function mermaidTheme() { return document.body.classList.contains('light-theme') ? 'default' : 'dark'; }

export async function enhanceMermaid(root, stale) {
  const blocks = [...root.querySelectorAll('.mermaid-block')].filter(b => b.querySelector('.mermaid-src'));   // los ya dibujados no se tocan
  if (!blocks.length) return;
  const theme = mermaidTheme();
  const todo = [];
  for (const b of blocks) {
    const src = b.querySelector('.mermaid-src')?.textContent || '';
    const cached = _mermaidCache.get(theme + '|' + src);
    if (cached) b.innerHTML = cached; else todo.push([b, src]);
  }
  if (!todo.length) return;
  await ensureMermaid();
  if (stale()) return;
  if (_mermaidTheme !== theme) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit' });
    _mermaidTheme = theme;
  }
  for (const [b, src] of todo) {
    // Se serializa: Mermaid usa un único contenedor temporal en el DOM
    _mermaidQueue = _mermaidQueue.then(async () => {
      if (stale()) return;
      try {
        const { svg } = await mermaid.render('mmd-' + (++_mermaidSeq), src);
        _mermaidCache.set(theme + '|' + src, svg);
        if (_mermaidCache.size > 60) _mermaidCache.delete(_mermaidCache.keys().next().value);
        if (root.contains(b)) b.innerHTML = svg;
      } catch (e) {
        document.getElementById('dmmd-' + _mermaidSeq)?.remove();
        if (root.contains(b)) {
          b.classList.add('mermaid-error');
          const msg = document.createElement('div');
          msg.className = 'mermaid-error-msg';
          msg.textContent = 'Diagrama no válido: ' + String(e.message || e).split('\n')[0];
          b.prepend(msg);
        }
      }
    });
  }
  await _mermaidQueue;
}

// Al cambiar de tema, los diagramas se vuelven a dibujar con los colores adecuados
export const _themeObserver = new MutationObserver(() => {
  const blocks = [...preview.querySelectorAll('.md-blk')].filter(b => b.querySelector('.mermaid-block'));
  if (!blocks.length) return;
  blocks.forEach(b => { b._html = undefined; });   // se vuelven a crear para dibujar el diagrama con los colores del nuevo tema
  updatePreview();
});
_themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
