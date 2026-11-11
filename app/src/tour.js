import { escHtml, getActiveTab } from './tabs.js';
import { setView } from './view.js';
import { hideHome, isPristineTab, openExampleTab } from './home.js';

// ═══════════════════════════════════════════════════
// RECORRIDO GUIADO (primer uso)
// ═══════════════════════════════════════════════════
// Cuatro pasos con foco sobre el elemento real de la interfaz. Se puede lanzar siempre desde
// el inicio o la paleta de comandos; la tarjeta del inicio desaparece al verlo o descartarlo.
export const TOUR_KEY = 'claudemd_tour';
export function tourSeen() { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { return true; } }
export function markTourSeen() { try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignorar */ } }
export function dismissTour() { markTourSeen(); const t = document.getElementById('homeTour'); if (t) t.hidden = true; }

export const TOUR_STEPS = [
  { target: '#v-preview', title: 'Tres formas de ver el documento',
    text: 'Editor, vista dividida y «Solo previsualización». En esta última escribes directamente sobre el documento, como en un procesador de texto.' },
  { target: '#preview .md-blk', title: 'Haz clic y escribe',
    text: 'Selecciona texto para abrir la barra de formato. Escribe «# » o «- » al empezar una línea para crear títulos y listas.' },
  { target: '#filesToggleBtn', title: 'Trabaja con carpetas',
    text: 'Abre una carpeta para navegar por tus .md, buscar en todos a la vez y ver imágenes y enlaces relativos.' },
  { target: '#menubar .menu-logo', title: 'Todo a un atajo de distancia',
    text: 'Ctrl+K abre la paleta de comandos (archivos, títulos y acciones). Este logo te lleva siempre al inicio.' },
];

export let _tour = null;

export function startTour() {
  if (_tour) return;
  hideHome();
  if (!getActiveTab() || isPristineTab(getActiveTab())) openExampleTab();
  setView('preview');
  markTourSeen();
  const spot = document.createElement('div'); spot.className = 'tour-spot';
  const pop = document.createElement('div');
  pop.className = 'tour-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false'); pop.setAttribute('aria-label', 'Recorrido');
  document.body.append(spot, pop);
  _tour = { i: 0, spot, pop };
  document.addEventListener('keydown', tourKeys, true);
  window.addEventListener('resize', placeTour);
  // La vista previa se repinta de forma asíncrona: se espera a que exista el primer bloque
  setTimeout(() => showTourStep(0), 250);
}

export function showTourStep(i) {
  if (!_tour) return;
  const step = TOUR_STEPS[i];
  _tour.i = i;
  const last = i === TOUR_STEPS.length - 1;
  _tour.pop.innerHTML = `
    <div class="tour-step">Paso ${i + 1} de ${TOUR_STEPS.length}</div>
    <h3>${escHtml(step.title)}</h3>
    <p>${escHtml(step.text)}</p>
    <div class="tour-actions">
      <button class="tour-skip" data-tour="skip">Saltar</button>
      <span class="tour-dots" aria-hidden="true">${TOUR_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      ${i > 0 ? '<button class="tour-btn" data-tour="prev">Anterior</button>' : ''}
      <button class="tour-btn primary" data-tour="next">${last ? 'Terminar' : 'Siguiente'}</button>
    </div>`;
  _tour.pop.querySelectorAll('[data-tour]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.tour;
    if (a === 'skip') endTour(); else if (a === 'prev') showTourStep(i - 1); else if (last) endTour(); else showTourStep(i + 1);
  }));
  const target = document.querySelector(step.target);
  if (target) target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  placeTour();
  _tour.pop.querySelector('.tour-btn.primary').focus({ preventScroll: true });
}

export function placeTour() {
  if (!_tour) return;
  const step = TOUR_STEPS[_tour.i];
  const t = document.querySelector(step.target);
  const spot = _tour.spot, pop = _tour.pop;
  const pad = 6;
  const r = t ? t.getBoundingClientRect() : { left: innerWidth / 2 - 60, top: innerHeight / 3, width: 120, height: 40, bottom: innerHeight / 3 + 40 };
  Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const below = r.bottom + pad + 14 + ph < innerHeight;
  const top = below ? r.bottom + pad + 14 : Math.max(12, r.top - pad - 14 - ph);
  const left = Math.max(12, Math.min(innerWidth - pw - 12, r.left + r.width / 2 - pw / 2));
  pop.style.top = top + 'px'; pop.style.left = left + 'px';
}

export function tourKeys(e) {
  if (!_tour) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (_tour.i < TOUR_STEPS.length - 1) showTourStep(_tour.i + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (_tour.i > 0) showTourStep(_tour.i - 1); }
}

export function endTour() {
  if (!_tour) return;
  _tour.spot.remove(); _tour.pop.remove();
  document.removeEventListener('keydown', tourKeys, true);
  window.removeEventListener('resize', placeTour);
  _tour = null;
  const t = document.getElementById('homeTour'); if (t) t.hidden = true;
}
