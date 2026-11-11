import { parseMarkdown } from './markdown.js';
import { editor } from './state.js';
import { escHtml, getActiveTab } from './tabs.js';
import { showToast } from './actions.js';
import { enhancePreview } from './enhance.js';
import { flushPreviewEdits } from './preview-edit.js';

// ═══════════════════════════════════════════════════
// EXPORTACIONES (HTML autocontenido, PDF, texto plano)
// ═══════════════════════════════════════════════════
export const EXPORT_CSS = `
  :root{--accent:#CF6A4C;}
  *{box-sizing:border-box;}
  body{margin:0;background:#fff;color:#23201d;font-family:Georgia,'Times New Roman',serif;
    font-size:18px;line-height:1.75;padding:48px 24px;}
  .doc{max-width:760px;margin:0 auto;}
  h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.6em 0 .6em;font-weight:600;}
  h1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:.2em;}
  h2{font-size:1.5em;} h3{font-size:1.25em;}
  p{margin:0 0 1em;}
  a{color:var(--accent);}
  code{font-family:'SF Mono',Consolas,monospace;font-size:.88em;background:#f3efe9;padding:.15em .4em;border-radius:4px;}
  pre{background:#f6f2ec;border:1px solid #e6ddd0;border-radius:8px;padding:16px;overflow:auto;}
  pre code{background:none;padding:0;}
  blockquote{border-left:3px solid var(--accent);margin:1em 0;padding:.4em 1em;color:#5c544c;background:#faf7f2;}
  blockquote:not(.callout){font-style:italic;}
  .callout-title{font-family:system-ui,sans-serif;font-weight:600;font-size:.85em;margin-bottom:.3em;}
  .callout-note{border-color:#4a7bd8;} .callout-tip{border-color:#3f8a5f;} .callout-important{border-color:#8461c4;}
  .callout-warning{border-color:#c98a2e;} .callout-caution{border-color:#d0503c;}
  ul,ol{padding-left:1.6em;margin:0 0 1em;} li{margin:.3em 0;}
  table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.95em;}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;} th{background:#f3efe9;font-weight:600;}
  hr{border:none;border-top:1px solid #ddd;margin:2em 0;}
  img{max-width:100%;height:auto;}
  input[type=checkbox]{margin-right:6px;}
  .frontmatter{margin:0 0 1.6em;padding:10px 14px;background:#faf7f2;border:1px solid #e6ddd0;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;}
  .fm-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#938a7e;margin-bottom:6px;}
  .frontmatter dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0;} .frontmatter dt{color:#b5472b;font-family:monospace;} .frontmatter dd{margin:0;}
  .fm-chip{display:inline-block;margin:0 6px 4px 0;padding:0 8px;border-radius:10px;background:#efe9df;font-size:13px;}
  .math-block{text-align:center;margin:1em 0;overflow-x:auto;} .mermaid-block{text-align:center;margin:1.2em 0;} .mermaid-block svg{max-width:100%;height:auto;}
  .hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag{color:#b5472b;}
  .hljs-string,.hljs-regexp,.hljs-addition{color:#3f7d3a;}
  .hljs-number,.hljs-variable,.hljs-selector-id,.hljs-selector-class{color:#a0670f;}
  .hljs-comment,.hljs-quote,.hljs-meta{color:#938a7e;font-style:italic;}
  .hljs-title,.hljs-section,.hljs-name{color:#2a6fa8;} .hljs-attr,.hljs-attribute,.hljs-property{color:#7b4fa0;}
  .hljs-type,.hljs-built_in{color:#8a6d1a;} .hljs-symbol,.hljs-bullet,.hljs-link{color:#2f7a52;}
  @media print{
    body{padding:0;font-size:12pt;} .doc{max-width:none;}
    pre,table,blockquote,.frontmatter,.mermaid-block{break-inside:avoid;} h1,h2,h3{break-after:avoid;}
    pre{white-space:pre-wrap;} a{color:inherit;text-decoration:none;}
  }
`;

// Las imágenes locales llegan como blob: URL → se incrustan como data: URI para que el HTML sea autónomo
export async function inlineBlobImages(root) {
  await Promise.all([...root.querySelectorAll('img[src^="blob:"]')].map(async img => {
    try {
      const blob = await (await fetch(img.src)).blob();
      img.src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    } catch (e) { /* se deja como está */ }
  }));
}

export let _katexCssInline = null;
export async function katexCssInline() {
  if (_katexCssInline) return _katexCssInline;
  if (window.__vendorInline && window.__vendorInline['vendor/katex.min.css']) return (_katexCssInline = window.__vendorInline['vendor/katex.min.css']);
  let css = await (await fetch('vendor/katex.min.css')).text();
  const fonts = [...new Set([...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map(m => m[1]))];
  for (const f of fonts) {
    const buf = new Uint8Array(await (await fetch('vendor/' + f)).arrayBuffer());
    let bin = ''; buf.forEach(b => { bin += String.fromCharCode(b); });
    css = css.split(`url(${f})`).join(`url(data:font/woff2;base64,${btoa(bin)})`);
  }
  return (_katexCssInline = css);
}

// Opciones de exportación (las elige el diálogo «Exportar…» y se recuerdan)
export const EXPORT_DEFAULTS = { paper: 'A4', margin: 'normal', font: 'serif', size: 17, pageNumbers: true };
export function loadExportOpts() {
  try { return { ...EXPORT_DEFAULTS, ...JSON.parse(localStorage.getItem('claudemd_export') || '{}') }; } catch (e) { return { ...EXPORT_DEFAULTS }; }
}
export function saveExportOpts(o) { try { localStorage.setItem('claudemd_export', JSON.stringify(o)); } catch (e) { /* ignorar */ } }

export function exportPageCss(o) {
  const margin = { narrow: '12mm', normal: '20mm', wide: '28mm' }[o.margin] || '20mm';
  const fam = o.font === 'sans' ? "system-ui,'Segoe UI',Helvetica,Arial,sans-serif" : "Georgia,'Times New Roman',serif";
  return `body{font-family:${fam};font-size:${+o.size || 17}px;}
@page{size:${o.paper === 'Letter' ? 'Letter' : 'A4'};margin:${margin};${o.pageNumbers ? "@bottom-center{content:counter(page) ' / ' counter(pages);font:10px system-ui,sans-serif;color:#888;}" : ''}}`;
}

export async function buildExportHTML(opts) {
  const o = opts || loadExportOpts();
  flushPreviewEdits();
  const tab = getActiveTab();
  const title = tab?.name || 'documento';
  const root = document.createElement('div');
  root.innerHTML = parseMarkdown(editor.value, { plain: true });
  await enhancePreview(root, tab, { export: true });
  root.querySelectorAll('.code-copy').forEach(b => b.remove());
  await inlineBlobImages(root);
  const extra = root.querySelector('.katex') ? await katexCssInline().catch(() => '') : '';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#CF6A4C';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>${EXPORT_CSS.replace('--accent:#CF6A4C', '--accent:' + accent)}${extra}${exportPageCss(o)}</style></head>
<body><div class="doc">${root.innerHTML}</div></body></html>`;
}

export function saveBlobAs(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportHTML() {
  if (!editor.value.trim()) { showToast('Nada que exportar'); return; }
  const name = (getActiveTab()?.name || 'documento') + '.html';
  saveBlobAs(new Blob([await buildExportHTML()], { type: 'text/html;charset=utf-8' }), name);
  showToast('✓ Exportado como ' + name);
}

export async function exportPDF() {
  if (!editor.value.trim()) { showToast('Nada que exportar'); return; }
  const html = await buildExportHTML();
  const name = (getActiveTab()?.name || 'documento') + '.pdf';
  // Imprime el HTML autónomo desde un iframe oculto → "Guardar como PDF"
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { showToast('No se pudo abrir la impresión'); }
      setTimeout(() => frame.remove(), 120000);
    }, 300);
  };
  document.body.appendChild(frame);
  showToast('📑 Abriendo diálogo de impresión → Guardar como PDF');
}

export function exportTXT() {
  flushPreviewEdits();
  if (!editor.value.trim()) { showToast('Nada que exportar'); return; }
  const tab = getActiveTab();
  const name = (tab?.name || 'documento') + '.txt';
  // Texto plano legible: renderiza y extrae el texto visible (sin marcas markdown)
  const tmp = document.createElement('div');
  tmp.innerHTML = parseMarkdown(editor.value, { plain: true });
  // Inserta saltos tras bloques para que el texto plano respire
  tmp.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,tr').forEach(el => {
    el.appendChild(document.createTextNode('\n'));
  });
  const text = tmp.textContent.replace(/\n{3,}/g, '\n\n').trim();
  saveBlobAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  showToast('✓ Exportado como ' + name);
}
