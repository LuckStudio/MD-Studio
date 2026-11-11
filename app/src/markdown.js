import { frontMatterCardHTML, parseFrontMatter } from './frontmatter.ts';
import { resolveRelative } from './fs.js';
import { escAttr, escHtml } from './tabs.js';

// ═══════════════════════════════════════════════════
// MARKDOWN → HTML (marked + extensiones + DOMPurify)
// ═══════════════════════════════════════════════════
// Orden: front matter → marked (código resaltado, mermaid, matemáticas) →
// transformaciones DOM (ids, callouts, enlaces) → DOMPurify (siempre lo último).
// Lo que no se puede resolver de forma síncrona (Mermaid, KaTeX, imágenes
// relativas) lo completa después enhancePreview() (ver enhance.js).

export const CALLOUTS = {
  NOTE:      { label: 'Nota',        icon: 'ℹ' },
  TIP:       { label: 'Consejo',     icon: '💡' },
  IMPORTANT: { label: 'Importante',  icon: '❗' },
  WARNING:   { label: 'Aviso',       icon: '⚠' },
  CAUTION:   { label: 'Precaución',  icon: '⛔' },
};

export function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^\w\sÀ-ÿ-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const MD_LANG_ALIASES = { js: 'javascript', ts: 'typescript', sh: 'bash', shell: 'bash', zsh: 'bash',
  yml: 'yaml', py: 'python', md: 'markdown', html: 'xml', vue: 'xml', ps1: 'powershell', ps: 'powershell' };

export function highlightCode(code, lang) {
  lang = (lang || '').toLowerCase();
  lang = MD_LANG_ALIASES[lang] || lang;
  if (window.hljs && lang && hljs.getLanguage(lang)) {
    try { return { html: hljs.highlight(code, { language: lang, ignoreIllegals: true }).value, lang }; } catch (e) {}
  }
  return { html: escHtml(code), lang };
}

if (window.marked) {
  marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });
  marked.use({
    renderer: {
      code(code, infostring) {
        const lang = (infostring || '').match(/^\S*/)[0];
        if (lang.toLowerCase() === 'mermaid') {
          return `<div class="mermaid-block"><pre class="mermaid-src">${escHtml(code)}</pre></div>\n`;
        }
        const h = highlightCode(code, lang);
        const cls = h.lang ? ` class="hljs language-${escAttr(h.lang)}"` : ' class="hljs"';
        return `<pre${lang ? ` data-lang="${escAttr(lang)}"` : ''}><code${cls}>${h.html.replace(/\n$/, '')}</code></pre>\n`;
      },
    },
    extensions: [
      {   // $$ ... $$ (bloque)
        name: 'mathBlock', level: 'block',
        start(src) { const m = src.match(/^\$\$/m); return m ? m.index : undefined; },
        tokenizer(src) {
          const m = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$[ \t]*(?:\n|$)/.exec(src);
          if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
        },
        renderer(t) { return `<div class="math-block" data-tex="${escAttr(t.text)}">$$${escHtml(t.text)}$$</div>\n`; },
      },
      {   // $ ... $ (en línea): sin espacios pegados a los delimitadores y sin dígito tras el cierre
        name: 'mathInline', level: 'inline',
        start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i; },
        tokenizer(src) {
          const m = /^\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(src);
          if (m) return { type: 'mathInline', raw: m[0], text: m[1] };
        },
        renderer(t) { return `<span class="math-inline" data-tex="${escAttr(t.text)}">$${escHtml(t.text)}$</span>`; },
      },
      {   // [[Documento]], [[Documento#sección]], [[Documento|texto]] (enlaces entre archivos de la carpeta)
        name: 'wikilink', level: 'inline',
        start(src) { const i = src.indexOf('[['); return i < 0 ? undefined : i; },
        tokenizer(src) {
          const m = /^\[\[([^\]|#\n]+)(?:#([^\]|\n]*))?(?:\|([^\]\n]*))?\]\]/.exec(src);
          if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), anchor: (m[2] || '').trim(), label: (m[3] || '').trim() };
        },
        renderer(t) {
          const label = t.label || t.target + (t.anchor ? ' › ' + t.anchor : '');
          return `<a href="#" class="wikilink" data-wiki="${escAttr(t.target)}" data-anchor="${escAttr(t.anchor)}">${escHtml(label)}</a>`;
        },
      },
    ],
  });
}

// Lista cerrada: nada que pueda disparar acciones de la app (ver dispatch.js)
export const PURIFY_CONFIG = {
  ADD_ATTR: ['target', 'data-tex', 'data-lang', 'data-callout', 'data-rel-src', 'data-s', 'data-e', 'data-ro', 'data-wiki', 'data-anchor'],
  FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'script'],
  FORBID_ATTR: ['data-action', 'data-args', 'data-stop', 'data-setting', 'data-change', 'data-overlay-close'],
};

export function sanitizeHTML(html) {
  if (window.DOMPurify) return DOMPurify.sanitize(html, PURIFY_CONFIG);
  // Sin DOMPurify no se muestra HTML crudo: se escapa todo
  return '<p>' + escHtml(html.replace(/<[^>]+>/g, '')) + '</p>';
}

export function applyCallouts(root) {
  root.querySelectorAll('blockquote').forEach(bq => {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P') return;
    const first = p.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = first.nodeValue.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*/i);
    if (!m) return;
    const kind = m[1].toUpperCase();
    first.nodeValue = first.nodeValue.slice(m[0].length);
    if (!first.nodeValue && first.nextSibling && first.nextSibling.nodeName === 'BR') first.nextSibling.remove();
    if (!first.nodeValue) first.remove();
    bq.classList.add('callout', 'callout-' + kind.toLowerCase());
    bq.setAttribute('data-callout', kind);
    const title = document.createElement('div');
    title.className = 'callout-title';
    title.textContent = CALLOUTS[kind].label;   // el icono lo pone el CSS (callout-icons.css)
    bq.insertBefore(title, bq.firstChild);
    if (!p.textContent.trim() && !p.querySelector('img,code')) p.remove();
  });
}

// Renderizado por bloques: cada bloque (párrafo, título, lista…) se envuelve en <div class="md-blk" data-s data-e>
// con su posición en el texto fuente. Es lo que permite editar la vista previa: al cambiar un bloque
// solo se reescribe SU trozo del Markdown y el resto del documento queda intacto.
// Fragmento sin envoltorios (pegar, texto plano): ya saneado
export function renderMdFragment(text) {
  return sanitizeHTML(marked.parse(text));
}

// HTML de un fragmento: ids en títulos, enlaces externos, imágenes relativas, avisos y, siempre
// al final, DOMPurify. DOMParser crea un documento inerte: no carga imágenes ni ejecuta
// manejadores aunque el Markdown traiga <img onerror=…>. Un <div> suelto SÍ lo haría antes de sanear.
export function transformDom(tmp) {
  tmp.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { if (!h.id) h.id = slugify(h.textContent); });
  tmp.querySelectorAll('a[href]').forEach(a => {
    if (a.getAttribute('href').startsWith('#')) return;   // anclas internas: se resuelven en la propia vista
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  // Imágenes con ruta relativa: no se piden al servidor de la app; enhancePreview() las resuelve
  // contra la carpeta del documento (ver enhance.js / workspace.js)
  tmp.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (resolveRelative([], src)) { img.setAttribute('data-rel-src', src); img.removeAttribute('src'); }
  });
  tmp.querySelectorAll('input[type=checkbox]').forEach(c => {
    const li = c.closest('li');
    c.setAttribute('aria-label', (li ? li.textContent.trim().slice(0, 80) : '') || 'Casilla de tarea');
  });
  applyCallouts(tmp);
}

export function transformAndSanitize(html) {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  transformDom(doc.body);
  return sanitizeHTML(doc.body.innerHTML);
}

// Varios bloques de una vez (primer pintado de un documento largo): un solo análisis y un solo saneado.
// Cada bloque va en su propio <div>; solo se usa con bloques cuyo HTML está equilibrado (no 'html' en bruto).
export function sanitizeBatch(htmls) {
  const doc = new DOMParser().parseFromString('<body>' + htmls.map(h => '<div>' + h + '</div>').join('') + '</body>', 'text/html');
  transformDom(doc.body);
  if (!window.DOMPurify) return htmls.map(h => sanitizeHTML(h));
  const clean = DOMPurify.sanitize(doc.body, { ...PURIFY_CONFIG, RETURN_DOM: true });
  const kids = [...clean.children];
  if (kids.length !== htmls.length) return htmls.map(h => transformAndSanitize(h));   // algo raro: se hace uno a uno
  return kids.map(k => k.innerHTML);
}

// Caché por bloque: un bloque con el mismo texto fuente da siempre el mismo HTML, así que al teclear
// solo se vuelve a procesar el bloque tocado (marked + resaltado + saneado de los demás se saltan).
export const _blkCache = new Map();
export const BLK_CACHE_MAX = 12000;

// Devuelve { card, blocks:[{ s, e, ro, html }] } con las posiciones [s,e) en el texto fuente
export function parseMarkdownBlocks(md) {
  if (!md || !md.trim()) return { card: '', blocks: [] };
  const fm = parseFrontMatter(md);
  const body = fm && fm.body !== undefined ? fm.body : md;
  const base = md.length - body.length;
  const card = fm && fm.keys ? transformAndSanitize(frontMatterCardHTML(fm)) : '';
  const tokens = marked.lexer(body);
  if (_blkCache.size > BLK_CACHE_MAX) _blkCache.clear();
  // 1) HTML crudo de cada token; los que no están en caché se saneán juntos si son muchos
  const keys = tokens.map(t => t.type + ' ' + (t.lang || '') + ' ' + t.raw);
  const misses = [];
  tokens.forEach((t, i) => { if (!_blkCache.has(keys[i]) && !misses.some(m => m.key === keys[i])) misses.push({ key: keys[i], t, raw: marked.parser([t]) }); });
  const batchable = misses.filter(m => m.t.type !== 'html');
  if (batchable.length >= 8) {
    const out = sanitizeBatch(batchable.map(m => m.raw));
    batchable.forEach((m, i) => _blkCache.set(m.key, out[i]));
  }
  misses.forEach(m => { if (!_blkCache.has(m.key)) _blkCache.set(m.key, transformAndSanitize(m.raw)); });
  // 2) posiciones en el texto fuente
  const blocks = [];
  let pos = 0, consistent = true;
  tokens.forEach((t, i) => {
    const html = _blkCache.get(keys[i]);
    // indexOf tolera los tokens que marked consume sin emitir (definiciones de enlaces [x]: url)
    const s = consistent ? body.indexOf(t.raw, pos) : -1;
    if (s < 0) consistent = false;    // p. ej. tabuladores que marked normaliza: el resto queda de solo lectura
    else pos = s + t.raw.length;
    if (!html.trim()) return;
    const ro = !consistent || t.type === 'html' || t.type === 'mathBlock' || (t.type === 'code' && /^mermaid/i.test(t.lang || ''));
    blocks.push({ s: base + Math.max(s, 0), e: base + Math.max(s, 0) + t.raw.length, ro, html });
  });
  return { card, blocks };
}

// opts.plain: sin envoltorios de bloque (exportaciones y vistas previas sueltas)
export function parseMarkdown(md, opts = {}) {
  if (!md || !md.trim()) return '';
  try {
    if (opts.plain) {
      const fm = parseFrontMatter(md);
      const body = fm && fm.body !== undefined ? fm.body : md;
      return transformAndSanitize((fm && fm.keys ? frontMatterCardHTML(fm) : '') + marked.parse(body));
    }
    const { card, blocks } = parseMarkdownBlocks(md);
    return card + blocks.map(b => `<div class="md-blk" data-s="${b.s}" data-e="${b.e}"${b.ro ? ' data-ro="1"' : ''}>${b.html}</div>`).join('\n');
  } catch (e) {
    return '<p>' + escHtml(md).replace(/\n/g, '<br/>') + '</p>';
  }
}

// ═══════════════════════════════════════════════════
// HTML → MARKDOWN (turndown + gfm, para la preview editable)
// ═══════════════════════════════════════════════════
export let _turndown = null;
export function getTurndown() {
  if (_turndown) return _turndown;
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: '',            // con breaks:true un salto de línea simple ya es <br>
  });
  if (window.turndownPluginGfm) td.use(turndownPluginGfm.gfm);
  // Conserva el lenguaje de los bloques de código (data-lang o class language-x)
  td.addRule('fencedCodeLang', {
    filter: (node) => node.nodeName === 'PRE' && node.querySelector('code'),
    replacement: (content, node) => {
      const code = node.querySelector('code');
      const lang = node.getAttribute('data-lang') ||
        (code.className.match(/language-(\w+)/) || [,''])[1] || '';
      return '\n\n```' + lang + '\n' + code.textContent.replace(/\n$/, '') + '\n```\n\n';
    }
  });
  // Listas con "- " y un solo espacio (turndown usa tres): el Markdown editado se parece al original
  td.addRule('listItem1', {
    filter: 'li',
    replacement: (content, node, options) => {
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/^\[([ xX])\]\s+/, '[$1] ');
      const parent = node.parentNode;
      let prefix = options.bulletListMarker + ' ';
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const idx = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + idx : idx + 1) + '. ';
      }
      content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    }
  });
  // [[wikilinks]]: se devuelven a su forma original
  td.addRule('wikilink', {
    filter: n => n.nodeName === 'A' && n.getAttribute('data-wiki'),
    replacement: (content, n) => {
      const t = n.getAttribute('data-wiki'), a = n.getAttribute('data-anchor');
      const label = content.replace(/\\([\[\]])/g, '$1').trim();
      const dflt = t + (a ? ' › ' + a : '');
      return '[[' + t + (a ? '#' + a : '') + (label && label !== dflt ? '|' + label : '') + ']]';
    }
  });
  // Avisos > [!NOTE]: el título lo genera la vista previa, no es contenido
  td.addRule('callout', {
    filter: n => n.nodeName === 'BLOCKQUOTE' && n.getAttribute('data-callout'),
    replacement: (content, node) => {
      const inner = content.trim().split('\n').map(l => ('> ' + l).trimEnd()).join('\n');
      return '\n\n> [!' + node.getAttribute('data-callout') + ']\n' + inner + '\n\n';
    }
  });
  // Imágenes con ruta relativa: la vista previa usa un blob:, en el Markdown va la ruta original
  td.addRule('relImage', {
    filter: n => n.nodeName === 'IMG' && n.getAttribute('data-rel-src'),
    replacement: (c, n) => '![' + (n.getAttribute('alt') || '') + '](' + n.getAttribute('data-rel-src') + ')'
  });
  // Tachado con doble tilde
  td.addRule('strikethrough2', {
    filter: ['del', 's'],
    replacement: (content) => '~~' + content + '~~'
  });
  _turndown = td;
  return td;
}

export function htmlToMarkdown(container) {
  try {
    const td = getTurndown();
    let md = td.turndown(container.innerHTML);
    return md.replace(/\n{3,}/g, '\n\n').trim();
  } catch(e) {
    // Fallback: texto plano si turndown fallara
    return (container.textContent || '').trim();
  }
}
