// Copia las librerías de node_modules a app/vendor y app/fonts, y genera app/css/fonts.css.
// Se ejecuta con `npm run vendor`. El resultado se versiona: así la app no necesita
// node_modules para ejecutarse ni para publicarse.
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(ROOT, 'node_modules');
const APP = join(ROOT, 'app');

function copy(from, to) {
  const src = join(NM, from);
  if (!existsSync(src)) throw new Error(`Falta ${from}: ejecuta npm install`);
  mkdirSync(dirname(join(APP, to)), { recursive: true });
  cpSync(src, join(APP, to));
}

// ── Librerías de render ──
rmSync(join(APP, 'vendor/fonts'), { recursive: true, force: true });
copy('dompurify/dist/purify.min.js', 'vendor/purify.min.js');
copy('@highlightjs/cdn-assets/highlight.min.js', 'vendor/highlight.min.js');
copy('@highlightjs/cdn-assets/styles/github-dark.min.css', 'vendor/hljs-dark.min.css');
copy('@highlightjs/cdn-assets/styles/github.min.css', 'vendor/hljs-light.min.css');
copy('mermaid/dist/mermaid.min.js', 'vendor/mermaid.min.js');
copy('katex/dist/katex.min.js', 'vendor/katex.min.js');
copy('fflate/umd/index.js', 'vendor/fflate.min.js');

// marked, turndown y turndown-plugin-gfm viven en app/vendor y se versionan tal cual.
// KaTeX: solo woff2 (todos los navegadores actuales) y CSS sin las variantes woff/ttf
let katexCss = readFileSync(join(NM, 'katex/dist/katex.min.css'), 'utf8');
katexCss = katexCss.replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
                   .replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
writeFileSync(join(APP, 'vendor/katex.min.css'), katexCss);
for (const f of readdirSync(join(NM, 'katex/dist/fonts')).filter(f => f.endsWith('.woff2'))) {
  copy(`katex/dist/fonts/${f}`, `vendor/fonts/${f}`);
}

// ── Tipografías (solo subconjunto latin: cubre español) ──
const FONTS = [
  { pkg: 'lora', family: 'Lora', faces: [[400, 'normal'], [400, 'italic'], [600, 'normal']] },
  { pkg: 'merriweather', family: 'Merriweather', faces: [[400, 'normal'], [700, 'normal']] },
  { pkg: 'source-serif-4', family: 'Source Serif 4', faces: [[400, 'normal'], [600, 'normal']] },
  { pkg: 'dm-sans', family: 'DM Sans', faces: [[400, 'normal'], [500, 'normal']] },
  { pkg: 'inter', family: 'Inter', faces: [[400, 'normal'], [500, 'normal'], [600, 'normal']] },
  { pkg: 'dm-mono', family: 'DM Mono', faces: [[400, 'normal'], [500, 'normal']] },
  { pkg: 'jetbrains-mono', family: 'JetBrains Mono', faces: [[400, 'normal'], [500, 'normal']] },
  { pkg: 'fira-code', family: 'Fira Code', faces: [[400, 'normal'], [500, 'normal']] },
];
rmSync(join(APP, 'fonts'), { recursive: true, force: true });
let css = '/* Generado por tools/vendor.mjs — no editar a mano */\n';
for (const { pkg, family, faces } of FONTS) {
  for (const [weight, style] of faces) {
    const file = `${pkg}-latin-${weight}-${style}.woff2`;
    copy(`@fontsource/${pkg}/files/${file}`, `fonts/${file}`);
    css += `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;` +
           `src:url(../fonts/${file}) format('woff2');}\n`;
  }
}
writeFileSync(join(APP, 'css/fonts.css'), css);
console.log('vendor OK');

// ── Iconos: sprite SVG inline (lucide-static, licencia ISC) ──
// Se escribe dentro de app/index.html entre <!--sprite:start--> y <!--sprite:end-->.
// Para usar un icono nuevo: añadir su nombre aquí y `npm run vendor`; en el HTML: <svg class="ic"><use href="#i-nombre"/></svg>
const ICONS = ['file-plus', 'folder-open', 'folder', 'save', 'download', 'globe', 'file-text', 'copy', 'upload', 'trash-2', 'house',
  'sparkles', 'link', 'image', 'list', 'list-checks', 'table', 'columns-2', 'pencil', 'eye', 'book-open', 'focus', 'chart-column',
  'undo-2', 'redo-2', 'search', 'panel-left', 'quote', 'layout-template', 'moon', 'sun', 'rotate-ccw', 'git-compare', 'code',
  'check', 'triangle-alert', 'book', 'puzzle', 'bot', 'terminal', 'history', 'info', 'lightbulb', 'circle-alert', 'octagon-x',
  'pencil-line', 'lock', 'x', 'plus', 'chevron-right', 'chevron-down', 'command', 'settings-2', 'file', 'clipboard-paste',
  'share-2', 'bold', 'italic', 'strikethrough', 'list-ordered', 'minus', 'pilcrow', 'heading-1', 'heading-2', 'heading-3',
  'refresh-cw', 'circle-check', 'arrow-left', 'palette', 'monitor', 'keyboard', 'image-plus', 'rows-3', 'columns-3',
  'file-down', 'link-2', 'workflow', 'sigma', 'square-pen', 'files', 'panel-right-open', 'square-code', 'trash', 'unlock-keyhole', 'arrow-up', 'arrow-down', 'scissors', 'external-link', 'copy-plus', 'text-select', 'folder-plus', 'file-code', 'eraser', 'mouse-pointer-click', 'play', 'pause', 'chevron-left', 'skip-forward', 'skip-back', 'clapperboard', 'gauge', 'rotate-cw', 'volume-2', 'volume-x'];
const symbols = ICONS.map(n => {
  const svg = readFileSync(join(NM, 'lucide-static/icons', n + '.svg'), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
  return `<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`;
}).join('');
const indexPath = join(APP, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const block = `<!--sprite:start--><svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${symbols}</defs></svg><!--sprite:end-->`;
html = /<!--sprite:start-->[\s\S]*<!--sprite:end-->/.test(html)
  ? html.replace(/<!--sprite:start-->[\s\S]*<!--sprite:end-->/, () => block)
  : html.replace('<body>', () => `<body>\n${block}`);
writeFileSync(indexPath, html);
console.log(`sprite OK · ${ICONS.length} iconos`);

// ── Iconos de los avisos (> [!NOTE]…): se dibujan con CSS (máscara), porque DOMPurify no deja pasar <svg><use> ──
const CALLOUT_ICONS = { note: 'info', tip: 'lightbulb', important: 'circle-alert', warning: 'triangle-alert', caution: 'octagon-x' };
let ccss = '/* Generado por tools/vendor.mjs — no editar a mano */\n.callout-title::before { content: ""; display: inline-block; width: 1.1em; height: 1.1em; margin-right: .45em; vertical-align: -0.2em; background: currentColor; -webkit-mask: var(--co-icon) center / contain no-repeat; mask: var(--co-icon) center / contain no-repeat; }\n';
for (const [kind, name] of Object.entries(CALLOUT_ICONS)) {
  const inner = readFileSync(join(NM, 'lucide-static/icons', name + '.svg'), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${inner.replace(/"/g, "'")}</svg>`;
  ccss += `.callout-${kind} .callout-title { --co-icon: url("data:image/svg+xml,${encodeURIComponent(svg)}"); }\n`;
}
writeFileSync(join(APP, 'css/callout-icons.css'), ccss);
console.log('callout-icons OK');

