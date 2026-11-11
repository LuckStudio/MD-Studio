// Service worker: cachea la app para uso sin conexión y recibe archivos compartidos.
// sw-manifest.js lo genera `npm run build` (versión = hash del contenido, lista de archivos).
importScripts('sw-manifest.js');
const CACHE_VERSION = 'claudemd-' + self.__VERSION__;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(self.__SHELL__)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('claudemd-') && k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Compartir hacia la app (manifest → share_target): se guardan los archivos y se abre la app
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const files = (await req.formData()).getAll('files').filter(f => f && f.name);
      const cache = await caches.open('share-inbox');
      await Promise.all(files.map((f, i) => cache.put(
        new Request(new URL(`shared/${Date.now()}-${i}`, self.registration.scope).href),
        new Response(f, { headers: { 'X-Name': encodeURIComponent(f.name) } }))));
      return Response.redirect(new URL('index.html?share=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Red primero (se ven los cambios al momento); sin conexión, caché.
  // ignoreSearch: index.html?launch=file usa la misma entrada que index.html
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
