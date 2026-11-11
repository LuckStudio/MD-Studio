// Build de la app web (npm run build):
//  1. app/sw-manifest.js        → versión (hash) y lista de archivos del service worker en desarrollo.
//  2. dist/web/                 → versión de producción: un solo app.js minificado (esbuild) + estáticos,
//                                 con su propio sw-manifest.js. Es lo que publica el workflow de Pages.
//  3. dist/claude-md-editor.html → un solo archivo (doble clic, sin servidor): TODO dentro, también
//                                 fuentes, Mermaid, KaTeX y fflate.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const DIST = join(ROOT, 'dist');
const WEB = join(DIST, 'web');

const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (base, p) => relative(base, p).split('\\').join('/');
const read = p => readFileSync(p, 'utf8');
const b64 = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;

// Lista de precache y versión (hash del contenido: si algo cambia, cambia la versión)
const NO_PRECACHE = new Set(['sw.js', 'sw-manifest.js', 'vendor/mermaid.min.js', 'vendor/katex.min.js', 'vendor/katex.min.css', 'vendor/fflate.min.js']);
function writeSwManifest(dir) {
  const all = walk(dir).map(p => rel(dir, p)).filter(f => f !== 'sw-manifest.js' && !f.endsWith('.map')).sort();
  const hash = createHash('sha1');
  for (const f of all) { hash.update(f); hash.update(readFileSync(join(dir, f))); }
  const version = hash.digest('hex').slice(0, 10);
  const shell = ['./', ...all.filter(f => !NO_PRECACHE.has(f) && !f.startsWith('vendor/fonts/'))];
  writeFileSync(join(dir, 'sw-manifest.js'), `// Generado por tools/build.mjs — no editar\nself.__VERSION__ = '${version}';\nself.__SHELL__ = ${JSON.stringify(shell, null, 1)};\n`);
  return { version, count: shell.length };
}

// ── 1. Desarrollo (módulos sin empaquetar) ──
let r = writeSwManifest(APP);
console.log(`dev    · sw-manifest OK · versión ${r.version} · ${r.count} archivos precacheados`);

// ── 2. Producción: bundle minificado + estáticos ──
rmSync(DIST, { recursive: true, force: true });
mkdirSync(WEB, { recursive: true });
await build({
  entryPoints: [join(APP, 'src/main.js')], bundle: true, minify: true, sourcemap: true, format: 'iife',
  target: 'es2022', outfile: join(WEB, 'app.js'), legalComments: 'none', logLevel: 'warning',
});
for (const d of ['css', 'fonts', 'icons', 'screenshots', 'vendor']) cpSync(join(APP, d), join(WEB, d), { recursive: true, filter: s => !s.endsWith('.map') });
for (const f of ['manifest.webmanifest', 'sw.js', 'boot-guard.js']) cpSync(join(APP, f), join(WEB, f));
let html = read(join(APP, 'index.html'));
html = html.replace('<script type="module" src="src/main.js"></script>', '<script defer src="app.js"></script>');
writeFileSync(join(WEB, 'index.html'), html);
r = writeSwManifest(WEB);
const kb = Math.round(statSync(join(WEB, 'app.js')).size / 1024);
console.log(`web    · dist/web OK · app.js ${kb} KB · versión ${r.version} · ${r.count} archivos precacheados`);

// ── 3. Un solo archivo ──
let single = html;
single = single.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
               .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '');
single = single.replace('href="icons/icon.svg"', () => `href="${b64(join(APP, 'icons/icon.svg'), 'image/svg+xml')}"`);
single = single.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g, (_, href) => {
  let css = read(join(APP, href));
  if (href === 'css/fonts.css') css = css.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (__, f) => `url(${b64(join(APP, 'fonts', f), 'font/woff2')})`);
  return `<style>/* ${href} */\n${css}</style>`;
});
const safeInline = js => js.replace(/<\/(script)/gi, '<\\/$1');
single = single.replace(/\s*<script src="boot-guard.js"><\/script>/, '');
single = single.replace(/<script src="(vendor\/[^"]+)"><\/script>/g, (_, src) => `<script>/* ${src} */\n${safeInline(read(join(APP, src)))}</script>`);

// Librerías de carga perezosa: se guardan como texto y enhance.js las convierte en Blob al usarlas
let katexCss = read(join(APP, 'vendor/katex.min.css'));
katexCss = katexCss.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, f) => `url(${b64(join(APP, 'vendor', f), 'font/woff2')})`);
const lazy = {
  'vendor/mermaid.min.js': read(join(APP, 'vendor/mermaid.min.js')),
  'vendor/katex.min.js': read(join(APP, 'vendor/katex.min.js')),
  'vendor/katex.min.css': katexCss,
  'vendor/fflate.min.js': read(join(APP, 'vendor/fflate.min.js')),
};
const inlineVendor = `<script>window.__vendorInline = ${JSON.stringify(lazy).replace(/<\//g, '<\\/')};</script>\n`;
// Funciones de reemplazo: el código de Mermaid y del bundle contiene secuencias $& y $' que replace() interpretaría
const first = '<script>/* vendor/purify.min.js';
single = single.replace(first, () => inlineVendor + first);
single = single.replace('<script defer src="app.js"></script>', () => `<script>${safeInline(read(join(WEB, 'app.js')))}</script>`);

const out = join(DIST, 'claude-md-editor.html');
writeFileSync(out, single);
console.log(`single · dist/claude-md-editor.html OK (${Math.round(statSync(out).size / 1024)} KB)`);
