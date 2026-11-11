// Servidor de desarrollo: sirve app/ sin caché (los cambios se ven al recargar).
// Uso: npm run serve   (puerto 8765, o PORT=xxxx)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

// --prod sirve dist/web (el bundle de producción); por defecto app/ con los módulos sin empaquetar
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, process.argv.includes('--prod') ? 'dist/web' : 'app');
const PORT = Number(process.env.PORT) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(APP, p));
    if (!file.startsWith(APP)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('no file');
    // Los módulos .ts se transpilan al vuelo (el navegador no entiende TypeScript)
    if (extname(file) === '.ts') {
      const { code } = await transform(await readFile(file, 'utf8'), { loader: 'ts', target: 'es2022', sourcefile: p });
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(code);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
