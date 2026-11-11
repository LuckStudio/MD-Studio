// ═══════════════════════════════════════════════════
// PANTALLA DE CARGA: solo el icono y la barra de progreso
// ═══════════════════════════════════════════════════
// El marcado (#splash) está en index.html y se ve desde el primer pintado. La barra avanza mientras
// arranca la aplicación; cuando está lista y la barra ha llegado al final, la pantalla se desvanece.
import { reducedMotion } from './motion.js';

const SPLASH_MS = 1300;          // duración mínima (la barra llega al 100 % justo entonces)
const SPLASH_SHORT_MS = 600;     // visitas siguientes en la misma sesión
const FADE_MS = 450;

const el = document.getElementById('splash');
const started = performance.now();
let finishing = false;

const splashEnabled = () => {
  if (!el) return false;
  if (window.__NO_SPLASH__) return false;
  try { if (localStorage.getItem('claudemd_splash') === '0') return false; } catch (e) { /* ignorar */ }
  return true;
};

export function setSplashPreference(on) { try { localStorage.setItem('claudemd_splash', on ? '1' : '0'); } catch (e) { /* ignorar */ } }
export function splashPreference() { try { return localStorage.getItem('claudemd_splash') !== '0'; } catch (e) { return true; } }

function removeSplash() {
  if (el) el.remove();
  document.documentElement.classList.remove('splashing');
}

// La app avisa de que ya está lista: se espera lo que falte de la barra y se desvanece
export function finishSplash() {
  if (!el || finishing) return;
  finishing = true;
  const total = splashShort ? SPLASH_SHORT_MS : SPLASH_MS;
  const wait = Math.max(0, total - (performance.now() - started));
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(removeSplash, FADE_MS + 40);
  }, wait);
}

const splashShort = (() => { try { return sessionStorage.getItem('claudemd_splash_seen') === '1'; } catch (e) { return false; } })();

if (!splashEnabled()) { if (el) el.remove(); }
else {
  try { sessionStorage.setItem('claudemd_splash_seen', '1'); } catch (e) { /* ignorar */ }
  document.documentElement.classList.add('splashing');
  const bar = el.querySelector('.splash-bar i');
  if (bar && !reducedMotion()) bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: splashShort ? SPLASH_SHORT_MS : SPLASH_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
}
// Seguridad: si algo impide que la app avise (error al arrancar), la pantalla no se queda para siempre
setTimeout(() => { if (el && el.isConnected) finishSplash(); }, 9000);
