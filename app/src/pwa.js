import { showToast } from './actions.js';
import { loadFileAsTab } from './import.js';

// ═══════════════════════════════════════════════════
// APLICACIÓN INSTALABLE (PWA)
// ═══════════════════════════════════════════════════
// El service worker cachea la app para que funcione sin conexión.
// Solo se registra si la página se sirve por http(s); abierta como file://
// la app sigue funcionando, pero no se puede instalar.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW no registrado:', e));
  });
}

// Botón "Instalar como aplicación" (Chrome/Edge). Safari/iOS no emite este
// evento: allí se instala con Compartir → Añadir a pantalla de inicio.
export let deferredInstallPrompt = null;

export function setInstallVisible(on) {
  document.getElementById('installBtn').hidden = !on;
  document.querySelectorAll('.install-menu-item').forEach(el => { el.hidden = !on; });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setInstallVisible(true);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstallVisible(false);
  showToast('✓ MD Studio instalada como aplicación');
});

export async function installApp() {
  if (!deferredInstallPrompt) {
    showToast('Usa el menú del navegador → Instalar aplicación');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  setInstallVisible(false);
}

// ── Recibir archivos desde "Compartir" (Android / ChromeOS) ──
// El service worker guarda en la caché 'share-inbox' lo compartido hacia /share-target
// y redirige a ?share=1; aquí se recoge y se abre en pestañas.
export async function consumeSharedFiles() {
  try {
    const cache = await caches.open('share-inbox');
    const reqs = await cache.keys();
    for (const req of reqs) {
      const res = await cache.match(req);
      const name = decodeURIComponent(res.headers.get('X-Name') || 'compartido.md');
      loadFileAsTab(new File([await res.blob()], name, { type: 'text/markdown' }));
      await cache.delete(req);
    }
    if (!reqs.length) showToast('No había archivos compartidos');
  } catch (e) { console.warn('Compartir:', e); }
  history.replaceState(null, '', location.pathname);   // quita ?share=1
}
