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

// Botones «Instalar como aplicación» (inicio, barra superior, menú Archivo, paleta). Se ven siempre,
// salvo si la app ya corre instalada. Si el navegador dio el aviso de instalación (Chrome/Edge) se
// lanza directamente; si no (Safari, Firefox, o Chrome que aún no lo ofrece) se abre una guía por navegador.
export let deferredInstallPrompt = null;

export const isInstalled = () =>
  (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches) ||
  navigator.standalone === true;

export function setInstallVisible(on) {
  document.querySelectorAll('.install-menu-item').forEach(el => { el.hidden = !on; });
}
setInstallVisible(!isInstalled());

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
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') setInstallVisible(false);
    return;
  }
  openInstallHelp();
}

function installSteps() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return { name: 'Safari (iPhone / iPad)', steps: ['Pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba).', 'Elige <b>Añadir a pantalla de inicio</b>.', 'Confirma con <b>Añadir</b>.'] };
  if (/Firefox\//.test(ua)) return { name: 'Firefox', steps: ['Firefox no permite instalar aplicaciones web en escritorio.', 'Abre MD Studio en <b>Chrome</b> o <b>Edge</b> para instalarla.', 'En Android, Firefox sí: menú ⋮ → <b>Instalar</b>.'] };
  if (/Edg\//.test(ua)) return { name: 'Microsoft Edge', steps: ['Abre el menú <b>⋯</b> arriba a la derecha.', 'Ve a <b>Aplicaciones</b> → <b>Instalar este sitio como una aplicación</b>.', 'Confirma con <b>Instalar</b>.'] };
  if (/Android/.test(ua)) return { name: 'Chrome (Android)', steps: ['Abre el menú <b>⋮</b>.', 'Pulsa <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b>).', 'Confirma con <b>Instalar</b>.'] };
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return { name: 'Safari (Mac)', steps: ['Menú <b>Archivo</b> → <b>Añadir al Dock…</b> (Safari 17 o posterior).', 'Confirma con <b>Añadir</b>.'] };
  return { name: 'Chrome', steps: ['Busca el icono de <b>instalar</b> a la derecha de la barra de direcciones.', 'Si no aparece: menú <b>⋮</b> → <b>Guardar y compartir</b> → <b>Instalar MD Studio…</b>', 'Confirma con <b>Instalar</b>.'] };
}

export function openInstallHelp() {
  const { name, steps } = installSteps();
  const secure = window.isSecureContext && location.protocol.startsWith('http');
  document.getElementById('installBody').innerHTML = secure
    ? `<p>Tu navegador no ha ofrecido el aviso automático. Instálala a mano en <b>${name}</b>:</p>
       <ol class="install-steps">${steps.map(t => `<li>${t}</li>`).join('')}</ol>
       <p class="install-note">Una vez instalada se abre como una aplicación más, con tus archivos .md y también sin conexión.</p>`
    : '<p>Para instalarla hay que abrir MD Studio desde una dirección <b>https://</b> (o <b>localhost</b>), no desde un archivo local.</p>';
  document.getElementById('installOverlay').classList.add('open');
}
export function closeInstallHelp() { document.getElementById('installOverlay').classList.remove('open'); }

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
