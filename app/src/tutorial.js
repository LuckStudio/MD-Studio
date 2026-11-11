// ═══════════════════════════════════════════════════
// TUTORIAL ANIMADO (tipo vídeo): el flujo completo de MD Studio, dentro de la propia herramienta
// ═══════════════════════════════════════════════════
// Una maqueta de la interfaz (960×600 lógicos, escalada al espacio disponible) con un cursor que
// se mueve, hace clic, abre menús y escribe. Cada escena es un guion de pasos con tiempo
// (`s.at(ms, fn)`) que se ejecutan con un reloj propio: así se puede pausar, cambiar la velocidad,
// saltar a cualquier escena y arrastrar la barra de posición (al saltar se reconstruye la escena y se
// aplican de golpe los pasos anteriores, sin transiciones). Usa los mismos colores y fuentes que la
// aplicación, de modo que respeta el tema claro/oscuro. Con «reducir movimiento» no se reproduce
// sola: enseña el fotograma final de cada escena y se avanza a mano.
import { reducedMotion } from './motion.js';
import { hideHome } from './home.js';
import { markTourSeen } from './tour.js';
import { createTutorialAudio, soundPreference, setSoundPreference } from './tutorial-audio.js';

const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const STAR = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 72 Q285.4 226.6 440 256 Q285.4 285.4 256 440 Q226.6 285.4 72 256 Q226.6 226.6 256 72 Z"/></svg>';

// ── Piezas de la maqueta ─────────────────────────────
const SIDE = [['h1', 'heading-1'], ['h2', 'heading-2'], ['b', 'bold'], ['i', 'italic'], ['ul', 'list'], ['check', 'list-checks'], ['table', 'table'], ['quote', 'quote'], ['code', 'code']];
const TREE = [['plan', 'plan.md'], ['api', 'api.md'], ['notas', 'notas.md']];

function win(o = {}) {
  const { view = 'preview', files = false, tabs = ['plan.md'], active = 0, ed = '', doc = '', side = true, saved = 'Guardado' } = o;
  return `<div class="tv-win" data-view="${view}" data-files="${files ? 1 : 0}">
    <div class="tv-bar">
      <span class="tv-logo">${ic('sparkles')} MD Studio</span>
      <span class="tv-m">Archivo</span><span class="tv-m">Formato</span><span class="tv-m">Ver</span><span class="tv-m">Editar</span>
      <span class="tv-grow"></span>
      <span class="tv-ftog" id="ftog">${ic('panel-left')}</span>
      <span class="tv-seg"><i data-v="editor">${ic('code')}</i><i data-v="split">${ic('columns-2')}</i><i data-v="preview">${ic('eye')}</i></span>
    </div>
    <div class="tv-tabs" id="tabs">${tabs.map((t, i) => `<span class="tv-tab${i === active ? ' on' : ''}">${ic('file-text')} ${t}</span>`).join('')}</div>
    <div class="tv-main">
      <aside class="tv-files"><div class="tv-ftree">
        <div class="tv-fh">${ic('folder-open')} docs</div>
        ${TREE.map(([k, n]) => `<div class="tv-fi" data-h data-f="${k}">${ic('file-text')} ${n}</div>`).join('')}
        <div class="tv-fh sub">${ic('folder')} img</div>
      </div></aside>
      ${side ? `<div class="tv-side" id="side">${SIDE.map(([k, i]) => `<span class="tv-sb" data-k="${k}">${ic(i)}</span>`).join('')}</div>` : ''}
      <section class="tv-ed"><pre>${ed}</pre></section>
      <section class="tv-pv"><div class="tv-doc" id="doc">${doc}</div><span class="tv-badge" id="badge">${ic('pencil')} Editable</span></section>
    </div>
    <div class="tv-status"><span class="tv-saved" id="saved">${ic('circle-check')} <i>${saved}</i></span><span>124 palabras</span><span class="tv-grow"></span><span>Markdown</span></div>
  </div>`;
}

const ED_PLAN = `<span class="m-h"># Plan del proyecto</span>\n\nEste plan reúne los **objetivos**\ndel trimestre.\n\n<span class="m-l">- Diseño</span>\n<span class="m-l">- Desarrollo</span>`;
const DOC_PLAN = `<h1>Plan del proyecto</h1><p>Este plan reúne los <b>objetivos</b> del trimestre.</p><ul><li>Diseño</li><li>Desarrollo</li></ul>`;

// Menú (contextual, barra «/»…) con elementos marcados como interactivos
function menu(id, items, cls = 'tv-cm') {
  const row = it => it === '-' ? '<div class="tv-sep"></div>'
    : `<div class="tv-ci ${it.cls || ''}" data-h ${it.k ? `data-k="${it.k}"` : ''}>${it.i ? ic(it.i) : '<span class="ph"></span>'}<span>${it.t}</span>${it.sub ? ic('chevron-right') + `<div class="tv-cs" id="${it.sub.id}">${it.sub.items.map(row).join('')}</div>` : ''}${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</div>`;
  return `<div class="${cls}" id="${id}">${items.map(row).join('')}</div>`;
}

const CTX_ITEMS = [
  { i: 'copy-plus', t: 'Duplicar bloque', cls: 'ci-dup' }, { i: 'arrow-up', t: 'Subir bloque' }, { i: 'arrow-down', t: 'Bajar bloque' }, '-',
  { i: 'pilcrow', t: 'Convertir en', cls: 'ci-conv', sub: { id: 'cs', items: [{ i: 'pilcrow', t: 'Párrafo' }, { i: 'heading-2', t: 'Título 2' }, { i: 'quote', t: 'Cita' }, { i: 'list', t: 'Lista con viñetas' }, { i: 'list-checks', t: 'Lista de tareas', k: 'task' }] } },
  { i: 'plus', t: 'Insertar debajo', sub: { id: 'cs2', items: [{ i: 'table', t: 'Tabla' }] } }, '-',
  { i: 'copy', t: 'Copiar Markdown' }, { i: 'trash-2', t: 'Eliminar bloque' },
];
const TABLE_ITEMS = [
  { i: 'rows-3', t: 'Insertar fila debajo', cls: 'ti-row' }, { i: 'columns-3', t: 'Insertar columna a la derecha' },
  { i: 'text-select', t: 'Alinear columna', cls: 'ti-align', sub: { id: 'ts', items: [{ t: 'A la izquierda' }, { t: 'Centrada' }, { t: 'A la derecha', k: 'right' }] } }, '-',
  { i: 'trash-2', t: 'Eliminar fila' }, { i: 'copy', t: 'Copiar tabla en Markdown' },
];

const dlg = (id, title, body, cls = '') => `<div class="tv-dlg ${cls}" id="${id}">${title ? `<div class="tv-dh">${title}</div>` : ''}${body}</div>`;

// ── Escenas ──────────────────────────────────────────
// build() devuelve el HTML de la escena; steps(s) programa lo que ocurre y cuándo.
const SCENES = [
  {
    id: 'welcome', name: 'Bienvenida', dur: 5500, title: 'Bienvenido a MD Studio',
    build: () => `<div class="tv-hero"><div class="tv-star" id="star">${STAR}</div><h4>MD Studio</h4><p>Edita Markdown como un documento</p>
      <div class="tv-chips">${['Vista previa editable', 'Carpetas y búsqueda', 'Clic derecho', 'Exportar'].map(t => `<span class="tv-chip">${t}</span>`).join('')}</div></div>`,
    steps(s) {
      s.cap(0, 'Un editor de Markdown que se escribe como un documento, sin salir de tu navegador.');
      s.cls(300, '#star', 'on');
      [0, 1, 2, 3].forEach(i => s.at(1300 + i * 330, c => { c.q('.tv-chips').children[i].classList.add('on'); c.sfx('pop'); }));
      s.cap(3500, 'En un minuto y medio ves el flujo completo. Puedes pausar, saltar de escena o repetirlo cuando quieras.');
    },
  },
  {
    id: 'open', name: 'Abrir', dur: 8200, title: 'Abre un archivo, una carpeta o empieza de cero',
    build: () => `<div class="tv-home"><div class="tv-hcards">
        <div class="tv-hc" id="hcFile" data-h>${ic('folder-open')}<b>Abrir archivo</b><small>Ctrl+O</small></div>
        <div class="tv-hc" data-h>${ic('folder')}<b>Abrir carpeta</b><small>Explorador y búsqueda</small></div>
        <div class="tv-hc" data-h>${ic('file-plus')}<b>Nuevo documento</b><small>Ctrl+N</small></div></div>
      <div class="tv-drop" id="drop">o arrastra archivos aquí</div>
      <div class="tv-fly" id="fly">${ic('file-text')} plan.md</div></div>`,
    steps(s) {
      s.cap(0, 'Todo empieza en el Inicio: abre un archivo, una carpeta entera o crea un documento nuevo.');
      s.go(900, '#hcFile'); s.click(1700, '#hcFile');
      s.cap(2300, 'También puedes arrastrar un .md desde el Explorador de archivos y soltarlo en cualquier parte.');
      s.sfx(3000, 'swish');
      s.at(3000, c => { const f = c.q('#fly'); f.style.left = '690px'; f.style.top = '60px'; f.classList.add('on'); });
      s.go(3000, '#fly', { dur: 600, dy: 4 });
      s.at(3700, c => { const f = c.q('#fly'); const d = c.q('#drop'); f.style.left = (d.offsetLeft + 340) + 'px'; f.style.top = (d.offsetTop + 22) + 'px'; });
      s.go(3700, '#drop', { dur: 900 });
      s.cls(4700, '#drop', 'hot'); s.sfx(4700, 'toggle');
      s.at(5300, c => c.swap(win({ view: 'preview', ed: ED_PLAN, doc: DOC_PLAN }), true));
      s.cap(5500, 'Se abre en una pestaña. Se guarda sola en el navegador y la sesión se recupera al volver.');
      s.go(5800, '#doc', { dur: 900, fx: .5, fy: .6 });
    },
  },
  {
    id: 'views', name: 'Vistas', dur: 9600, title: 'Tres vistas, y todas se pueden editar',
    build: () => win({ view: 'editor', ed: ED_PLAN, doc: DOC_PLAN }),
    steps(s) {
      s.cap(0, 'Editor: el Markdown tal cual, con resaltado de sintaxis.');
      s.go(1100, '[data-v=split]'); s.click(1800, '[data-v=split]');
      s.at(1850, c => c.view('split'));
      s.cap(1900, 'Dividida: el Markdown a la izquierda y el resultado en vivo a la derecha.');
      s.go(4600, '[data-v=preview]'); s.click(5300, '[data-v=preview]');
      s.at(5350, c => c.view('preview'));
      s.cap(5400, 'Solo vista previa: sin ver el código, escribes directamente sobre el documento.');
      s.cls(7000, '#badge', 'on'); s.sfx(7000, 'pop');
      s.cap(7000, 'Desde cualquier vista puedes editar la vista previa: lo que escribes llega al Markdown al instante.');
    },
  },
  {
    id: 'type', name: 'Escribir', dur: 10800, title: 'Escribe sobre el documento',
    build: () => win({ view: 'preview', side: false, ed: ED_PLAN, doc: `<h1>Plan del proyecto</h1><p>Este plan reúne los <span class="tv-w" id="w1">objetivos<span class="tv-fb" id="fb"><i data-b="b">${ic('bold')}</i><i>${ic('italic')}</i><i>${ic('strikethrough')}</i><i>${ic('link')}</i></span></span> del trimestre.</p>
      <div class="tv-line" id="ln"><span class="t"></span><span class="tv-caret"></span>${menu('sm', [
        { i: 'heading-1', t: 'Título 1', k: 'h1' }, { i: 'list', t: 'Lista con viñetas', k: 'ul' }, { i: 'table', t: 'Tabla', k: 'table', cls: 'ci-tab' }, { i: 'code', t: 'Bloque de código', k: 'code' }, { i: 'quote', t: 'Cita', k: 'quote' }], 'tv-cm tv-slash')}</div>` }),
    steps(s) {
      s.cap(0, 'Haz clic en cualquier punto del documento y escribe. Sin modos ni botones.');
      s.go(800, '#ln', { fx: .1 }); s.click(1500, '#ln'); s.cls(1500, '#ln', 'caret');
      s.type(2000, '#ln .t', '/ta', 1200);
      s.cls(2150, '#sm', 'on'); s.sfx(2150, 'pop');
      s.cam(900, '#ln', 1.45); s.cam(9000, null);
      s.cap(2150, 'Escribe «/» para abrir el menú de bloques: títulos, listas, tablas, código, citas, imágenes…');
      s.at(3250, c => { c.qa('#sm .tv-ci').forEach(e => { if (!e.classList.contains('ci-tab')) e.classList.add('hid'); }); c.q('.ci-tab').classList.add('hov'); });
      s.at(4300, c => c.key('Intro'));
      s.at(4450, c => {
        c.q('#sm').classList.remove('on');
        const ln = c.q('#ln'); ln.classList.remove('caret'); ln.innerHTML = `<table class="tv-t"><thead><tr><th>Tarea</th><th>Estado</th></tr></thead><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>`;
        ln.classList.add('tv-flash'); c.sfx('thock');
      });
      s.cap(4500, 'Intro, y aparece la tabla lista para rellenar. Con Tab saltas de celda.');
      s.go(6000, '#w1', { fx: .5 }); s.cls(6700, '#w1', 'sel'); s.cls(6700, '#fb', 'on'); s.sfx(6700, 'pop'); s.cam(5600, '#w1', 1.6);
      s.cap(6700, 'Selecciona texto y aparece la barra de formato: negrita, cursiva, tachado, enlace…');
      s.go(7500, '#fb [data-b]'); s.click(8100, '#fb [data-b]');
      s.at(8150, c => { c.q('#w1').classList.add('bold'); c.q('#fb').classList.remove('on'); c.sfx('toggle'); });
      s.cap(8200, 'Los atajos de siempre funcionan: Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+K…');
    },
  },
  {
    id: 'sidebar', name: 'Barra lateral', dur: 9800, title: 'La barra lateral, también en la vista previa',
    build: () => win({ view: 'preview', ed: ED_PLAN, doc: `<h1>Reunión</h1><div class="tv-blk" id="b1"><p>Ideas para la próxima semana</p></div><div class="tv-blk" id="b2"><p>Revisar el diseño</p><span class="tv-plus" id="plus">${ic('plus')}</span></div>` }),
    steps(s) {
      s.cap(0, 'La barra lateral inserta elementos con un clic. Ahora también funciona sobre la vista previa.');
      s.cls(200, '#side', 'pulse');
      s.go(1000, '#b1'); s.click(1600, '#b1');
      s.go(2300, '#side [data-k=h2]'); s.click(2900, '#side [data-k=h2]');
      s.at(2950, c => { const b = c.q('#b1'); b.innerHTML = '<h2>Ideas para la próxima semana</h2>'; b.classList.add('tv-flash'); c.sfx('thock'); });
      s.cap(3000, 'Un clic y el párrafo pasa a Título 2. El cursor no pierde su sitio.');
      s.go(3900, '#b2'); s.click(4400, '#b2');
      s.go(5000, '#side [data-k=check]'); s.click(5600, '#side [data-k=check]');
      s.at(5650, c => { const b = c.q('#b2'); b.firstElementChild.outerHTML = '<ul class="tv-tasks"><li><i></i>Revisar el diseño</li></ul>'; b.classList.add('tv-flash'); c.sfx('thock'); });
      s.cap(5700, 'Lista de tareas, tabla, cita, código, imagen… en la posición del cursor.');
      s.cap(7300, 'Y junto a cada bloque aparece un «+» para añadir uno nuevo justo debajo.');
      s.go(7300, '#b2', { fx: .02, fy: .5 }); s.cls(7500, '#plus', 'on'); s.sfx(7500, 'pop'); s.go(8200, '#plus'); s.click(8700, '#plus');
    },
  },
  {
    id: 'context', name: 'Clic derecho', dur: 12000, title: 'Panel propio con clic derecho',
    build: () => win({ view: 'preview', ed: ED_PLAN, doc: `<h1>Tareas</h1><div class="tv-blk" id="cb"><p>Preparar la presentación</p></div><div class="tv-blk"><p>Enviar el informe</p></div>` })
      + menu('cm', CTX_ITEMS),
    steps(s) {
      s.cap(0, 'Clic derecho en cualquier sitio abre un panel propio con las acciones de ese elemento.');
      s.go(900, '#cb'); s.click(1700, '#cb', { right: true }); s.at(1750, c => c.popAtCursor('#cm'));
      s.go(2600, '#cm .ci-conv'); s.cls(3100, '#cs', 'on'); s.sfx(3100, 'pop'); s.cam(1000, '#cb', 1.2); s.cam(10200, null);
      s.cap(3100, 'Convertir en…: título, cita, lista, tarea… sin tocar el Markdown a mano.');
      s.go(3800, '#cs [data-k=task]'); s.click(4500, '#cs [data-k=task]');
      s.at(4550, c => { c.q('#cm').classList.remove('on'); c.q('#cs').classList.remove('on'); const b = c.q('#cb'); b.innerHTML = '<ul class="tv-tasks"><li><i></i>Preparar la presentación</li></ul>'; b.classList.add('tv-flash'); c.sfx('thock'); });
      s.go(5500, '#cb'); s.click(6100, '#cb', { right: true }); s.at(6150, c => c.popAtCursor('#cm'));
      s.go(6900, '#cm .ci-dup'); s.click(7500, '#cm .ci-dup');
      s.at(7550, c => { c.q('#cm').classList.remove('on'); const b = c.q('#cb'); const n = b.cloneNode(true); n.removeAttribute('id'); n.classList.add('tv-flash'); b.after(n); c.sfx('thock'); });
      s.cap(7600, 'Duplicar, subir, bajar, copiar su Markdown o eliminar: cada bloque tiene su menú.');
      s.cap(9500, 'Hay menús para pestañas, carpetas, tablas, el índice y el editor. Con Mayús + clic derecho vuelve el del navegador.');
    },
  },
  {
    id: 'tables', name: 'Tablas', dur: 9000, title: 'Tablas sin pelearse con las barras',
    build: () => win({ view: 'preview', ed: ED_PLAN, doc: `<h1>Presupuesto</h1><table class="tv-t" id="tbl"><thead><tr><th>Concepto</th><th>Importe</th></tr></thead><tbody>
        <tr><td id="c1">Diseño</td><td id="c2">1.200 €</td></tr><tr><td>Desarrollo</td><td>3.400 €</td></tr><tr id="newrow" class="hid"><td>Pruebas</td><td>800 €</td></tr></tbody></table>` })
      + menu('tm', TABLE_ITEMS),
    steps(s) {
      s.cap(0, 'Las tablas se editan como en una hoja de cálculo; el clic derecho añade filas y columnas.');
      s.go(900, '#c1'); s.click(1600, '#c1', { right: true }); s.at(1650, c => c.popAtCursor('#tm'));
      s.go(2400, '#tm .ti-row'); s.click(3000, '#tm .ti-row');
      s.at(3050, c => { c.q('#tm').classList.remove('on'); const r = c.q('#newrow'); r.classList.remove('hid'); r.classList.add('tv-flash'); c.sfx('thock'); });
      s.cam(700, '#tbl', 1.3); s.cam(7700, null);
      s.cap(3100, 'Fila nueva al instante. Lo mismo con columnas, eliminar fila o copiar la tabla en Markdown.');
      s.go(4200, '#c2'); s.click(4800, '#c2', { right: true }); s.at(4850, c => c.popAtCursor('#tm'));
      s.go(5500, '#tm .ti-align'); s.cls(5900, '#ts', 'on'); s.sfx(5900, 'pop');
      s.go(6400, '#ts [data-k=right]'); s.click(7000, '#ts [data-k=right]');
      s.at(7050, c => { c.q('#tm').classList.remove('on'); c.q('#ts').classList.remove('on'); c.q('#tbl').classList.add('ar'); c.sfx('thock'); });
      s.cap(7100, 'Alinea la columna con un clic: se guarda en el Markdown como «--:».');
    },
  },
  {
    id: 'folder', name: 'Carpetas', dur: 10000, title: 'Carpetas, pestañas y Ctrl+K',
    build: () => win({ view: 'preview', tabs: ['plan.md'], ed: ED_PLAN, doc: DOC_PLAN })
      + dlg('pal', '', `<div class="tv-pq">${ic('search')}<span class="q"></span><span class="tv-caret"></span></div>`
        + `<div class="tv-pr" id="pr"><div class="tv-pi" data-h>${ic('file-text')}<span>plan.md</span><small>docs</small></div><div class="tv-pi act" data-h>${ic('file-text')}<span>notas.md</span><small>docs</small></div><div class="tv-pi" data-h>${ic('heading-2')}<span>Notas de la reunión</span><small>notas.md</small></div></div>`, 'tv-pal'),
    steps(s) {
      s.cap(0, 'Abre una carpeta entera: el panel lateral muestra tus .md, imágenes y subcarpetas.');
      s.go(900, '#ftog'); s.click(1500, '#ftog'); s.at(1550, c => { c.q('.tv-win').dataset.files = '1'; c.sfx('swish'); });
      s.go(2400, '[data-f=api]'); s.click(3000, '[data-f=api]');
      s.at(3050, c => {
        c.q('#tabs').insertAdjacentHTML('beforeend', `<span class="tv-tab on${c.seeking() ? '' : ' new'}">${ic('file-text')} api.md</span>`); c.q('#tabs').firstElementChild.classList.remove('on');
        const d = c.q('#doc'); d.innerHTML = '<h1>API</h1><p>Endpoints y ejemplos de uso.</p><pre class="tv-pre">GET /v1/docs</pre>'; d.classList.add('tv-flash'); c.sfx('thock');
      });
      s.cap(3100, 'Un clic abre el archivo en una pestaña nueva. Las pestañas con cambios se marcan con un punto.');
      s.at(4600, c => { c.key('Ctrl + K'); c.q('#pal').classList.add('on'); c.sfx('pop'); });
      s.cam(4800, '#pal', 1.2); s.cam(7300, null);
      s.cap(4650, 'Ctrl+K: la paleta salta a cualquier archivo, título o acción con solo escribir.');
      s.type(5200, '#pal .q', 'notas', 1000);
      s.at(7000, c => c.key('Intro'));
      s.at(7150, c => {
        c.q('#pal').classList.remove('on');
        c.q('#tabs').insertAdjacentHTML('beforeend', `<span class="tv-tab on${c.seeking() ? '' : ' new'}">${ic('file-text')} notas.md</span>`); [...c.q('#tabs').children].slice(0, -1).forEach(t => t.classList.remove('on'));
        const d = c.q('#doc'); d.innerHTML = '<h1>Notas de la reunión</h1><p>Ver también <a class="tv-a">[[plan]]</a> y <a class="tv-a">[[api]]</a>.</p>'; d.classList.add('tv-flash'); c.sfx('swish');
      });
      s.cap(7200, 'Los [[enlaces]] conectan tus notas, y desde cada una ves quién la enlaza. También hay búsqueda en todos los archivos.');
    },
  },
  {
    id: 'save', name: 'Guardar', dur: 8400, title: 'Se guarda solo, y con historial',
    build: () => win({ view: 'preview', ed: ED_PLAN, doc: DOC_PLAN, saved: 'Sin guardar' })
      + dlg('hist', `${ic('history')} Historial de versiones`, `<div class="tv-hbody"><div class="tv-vlist">
          <div class="vi act" data-h data-v="1"><b>Ahora</b><small>10:42 · 124 palabras</small></div><div class="vi" data-h data-v="2"><b>Hace 11 min</b><small>10:31 · 118 palabras</small></div><div class="vi" data-h data-v="3"><b>Ayer</b><small>18:05 · 90 palabras</small></div></div>
        <div class="tv-diff" id="diff"><div class="dl">  # Plan del proyecto</div><div class="dl del">- Este plan reúne los objetivos.</div><div class="dl add">+ Este plan reúne los **objetivos**</div><div class="dl add">+ del trimestre.</div><div class="dl">  - Diseño</div></div></div>
        <div class="tv-hfoot"><span class="tv-btn">Cerrar</span><span class="tv-btn pri" id="restore">Restaurar esta versión</span></div>`, 'tv-hist'),
    steps(s) {
      s.cap(0, 'Escribe con tranquilidad: el trabajo se guarda solo en el navegador. Con un archivo abierto, Ctrl+S lo guarda en el disco.');
      s.at(1200, c => { const e = c.q('#saved'); e.classList.add('dirty'); });
      s.at(2200, c => { const e = c.q('#saved'); e.classList.remove('dirty'); e.classList.add('busy'); e.querySelector('i').textContent = 'Guardando…'; });
      s.at(2900, c => { const e = c.q('#saved'); e.classList.remove('busy'); e.classList.add('ok'); e.querySelector('i').textContent = 'Guardado'; c.sfx('success'); });
      s.at(3500, c => { c.q('#hist').classList.add('on'); c.sfx('pop'); });
      s.cam(3700, '#hist', 1.2); s.cam(7400, null);
      s.cap(3550, 'Cada guardado deja una versión. Abre el historial para comparar con cualquiera y restaurarla.');
      s.go(4800, '#hist [data-v="2"]'); s.click(5400, '#hist [data-v="2"]');
      s.at(5450, c => { c.q('#diff').innerHTML = '<div class="dl">  # Plan del proyecto</div><div class="dl del">- Este plan reúne los objetivos.</div><div class="dl add">+ Este plan reúne los **objetivos**</div><div class="dl add">+ del trimestre.</div>'; c.q('#diff').classList.add('tv-flash'); });
      s.go(6500, '#restore'); s.click(7100, '#restore');
      s.cap(7150, 'Restaurar no destruye nada: la versión actual también queda en el historial.');
    },
  },
  {
    id: 'export', name: 'Exportar', dur: 8200, title: 'Exporta a donde lo necesites',
    build: () => win({ view: 'preview', ed: ED_PLAN, doc: DOC_PLAN })
      + dlg('exp', `${ic('share-2')} Exportar`, `<div class="tv-ebody"><div class="tv-elist">${[['pdf', 'file-text', 'PDF'], ['html', 'globe', 'Página web (.html)'], ['docx', 'file-down', 'Word (.docx)'], ['txt', 'file-text', 'Texto plano (.txt)'], ['md', 'download', 'Markdown (.md)'], ['link', 'share-2', 'Enlace para compartir']].map(([k, i, n], j) => `<div class="tv-ei${j === 1 ? ' act' : ''}" data-h data-f="${k}">${ic(i)}<span>${n}</span></div>`).join('')}</div>
        <div class="tv-eside"><p id="edesc">Un solo archivo con estilos, código resaltado, fórmulas y diagramas incrustados.</p><span class="tv-btn pri run" id="erun">Exportar</span></div></div>`, 'tv-exp')
      + '<div class="tv-toast" id="toast">✓ Exportado a PDF</div>',
    steps(s) {
      s.cap(0, 'Exporta a PDF, página web, Word, texto, Markdown o un enlace para compartir.');
      s.cls(500, '#exp', 'on'); s.sfx(500, 'pop'); s.cam(700, '#exp', 1.22); s.cam(5400, null);
      const pick = (t, k, desc) => { s.go(t, `[data-f=${k}]`); s.click(t + 600, `[data-f=${k}]`); s.at(t + 650, c => { c.qa('.tv-ei').forEach(e => e.classList.toggle('act', e.dataset.f === k)); c.q('#edesc').textContent = desc; }); };
      pick(1300, 'docx', 'Títulos, listas, tablas, enlaces, imágenes y diagramas, con estilos de Word.');
      pick(3000, 'pdf', 'Con tu tamaño de papel, márgenes y numeración. Se abre el diálogo de impresión: elige «Guardar como PDF».');
      s.go(4800, '#erun'); s.click(5400, '#erun');
      s.at(5450, c => { c.q('#exp').classList.remove('on'); c.q('#toast').classList.add('on'); c.sfx('success'); });
      s.cap(5500, 'Sin servidores: todo se genera en tu equipo. El enlace para compartir lleva el documento dentro de la propia dirección.');
    },
  },
  {
    id: 'end', name: 'Listo', dur: 7500, title: 'Ya conoces el flujo',
    build: () => `<div class="tv-hero end"><div class="tv-star on" id="star">${STAR}</div><h4>Listo para escribir</h4>
      <div class="tv-keys">${[['Ctrl + K', 'Paleta de comandos'], ['/', 'Menú de bloques'], ['Clic derecho', 'Acciones del elemento'], ['Ctrl + S', 'Guardar'], ['Ctrl + N', 'Documento nuevo'], ['Ctrl + Z', 'Deshacer']].map(([k, t]) => `<div class="tv-key2"><kbd>${k}</kbd><span>${t}</span></div>`).join('')}</div></div>`,
    steps(s) {
      s.cap(0, 'Abrir, escribir sobre la vista previa, «/», clic derecho, buscar y exportar: ese es todo el flujo.');
      [0, 1, 2, 3, 4, 5].forEach(i => s.at(500 + i * 280, c => { c.q('.tv-keys').children[i].classList.add('on'); c.sfx('pop'); }));
      s.cap(3200, 'Puedes volver a ver este tutorial desde el Inicio, el menú Archivo o la paleta de comandos.');
    },
  },
];

// Ritmo: el guion se escribió con tiempos «tranquilos»; TEMPO los acorta para que el vídeo sea más ágil.
const TEMPO = 0.8;
// Intensidad de la música por escena (0 = pad y arpegio · 3 = todas las capas)
const LEVEL = { welcome: 0, open: 1, views: 1, type: 2, sidebar: 2, context: 3, tables: 3, folder: 2, save: 2, export: 3, end: 3 };
const starts = []; let TOTAL = 0;
SCENES.forEach(sc => { sc.D = Math.round(sc.dur * TEMPO); sc.level = LEVEL[sc.id] ?? 1; starts.push(TOTAL); TOTAL += sc.D; });
export const tutorialTimeline = () => ({ starts: [...starts], durs: SCENES.map(sc => sc.D), total: TOTAL });
const fmt = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Convierte steps(s) en una lista ordenada de {t, fn}
function compile(sc) {
  if (sc._steps) return sc._steps;
  const list = [];
  const s = {
    at: (t, fn) => list.push({ t: Math.round(t * TEMPO), fn, n: list.length }),
    sfx: (t, name) => s.at(t, c => c.sfx(name)),
    cam: (t, sel, z, o) => s.at(t, c => c.cam(sel, z, o)),
    cap: (t, text) => s.at(t, c => c.cap(text)),
    cls: (t, sel, add, rem) => s.at(t, c => { const e = c.q(sel); if (!e) return; if (add) e.classList.add(add); if (rem) e.classList.remove(rem); }),
    go: (t, sel, o = {}) => { s.at(t, c => c.go(sel, { ...o, dur: (o.dur || 700) * TEMPO })); s.at(t + (o.dur || 700), c => c.hover(sel)); },
    click: (t, sel, o = {}) => s.at(t, c => c.click(sel, o)),
    type: (t, sel, text, dur) => { for (let i = 1; i <= text.length; i++) s.at(t + (i - 1) * dur / text.length, c => { const e = c.q(sel); if (e) e.textContent = text.slice(0, i); c.sfx('type'); }); },
  };
  sc.steps(s);
  list.sort((a, b) => a.t - b.t || a.n - b.n);
  return (sc._steps = list);
}

// ── Reproductor ──────────────────────────────────────
let T = null;

export function tutorialOpen() { return !!T; }
// Diagnóstico para pruebas: estado del audio sin necesidad de «oírlo»
export function tutorialAudioStats() { return T ? { ...T.audio.stats, muted: T.audio.muted } : null; }

// opts.render: modo grabación (tools/render-tutorial.mjs): diseño de vídeo 16:9 sin controles, sonido siempre activo
export function startTutorial(opts) {
  const render = !!(opts && opts.render === true);
  if (T) return;
  markTourSeen();
  const root = document.createElement('div');
  root.className = 'tut' + (render ? ' render' : ''); root.id = 'tutorial';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Tutorial animado de MD Studio');
  root.innerHTML = `<div class="tut-box">
    <div class="tut-head"><span class="tut-badge">${ic('clapperboard')} Tutorial</span><span class="tut-count" id="tutCount"></span>
      <button class="tut-x" data-tut="close" aria-label="Cerrar tutorial" title="Cerrar (Esc)">${ic('x')}</button></div>
    <div class="tut-vp" id="tutVp" aria-hidden="true"><div class="tut-fit" id="tutFit"><div class="tv-cam" id="tvCam"><div class="tv-scene" id="tvScene"></div>
      <div class="tv-cursor" id="tvCursor"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 2 L3 18 L7.4 14 L10.2 20.4 L13 19.2 L10.2 12.9 L16 12.9 Z" fill="#fff" stroke="#222" stroke-width="1.4" stroke-linejoin="round"/></svg></div></div></div></div>
    <div class="tut-cap" aria-live="polite"><h3 id="tutTitle"></h3><p id="tutText"></p></div>
    <div class="tut-ctl">
      <button class="tut-b" data-tut="prev" aria-label="Escena anterior" title="Escena anterior (←)">${ic('skip-back')}</button>
      <button class="tut-b main" id="tutPlay" data-tut="play" aria-label="Pausar" title="Reproducir / pausar (Espacio)"></button>
      <button class="tut-b" data-tut="next" aria-label="Escena siguiente" title="Escena siguiente (→)">${ic('skip-forward')}</button>
      <input class="tut-seek" id="tutSeek" type="range" min="0" max="${TOTAL}" step="100" value="0" aria-label="Posición del tutorial" />
      <span class="tut-time" id="tutTime"></span>
      <button class="tut-b" id="tutSound" data-tut="sound" aria-label="Silenciar sonido" aria-pressed="false" title="Sonido (M)"></button>
      <button class="tut-b speed" id="tutSpeed" data-tut="speed" aria-label="Velocidad de reproducción" title="Velocidad">1×</button>
    </div>
    <div class="tut-chaps" id="tutChaps" role="group" aria-label="Escenas">${SCENES.map((sc, i) => `<button class="tut-chap" data-tut="goto" data-i="${i}"><i>${i + 1}</i>${sc.name}</button>`).join('')}</div>
    <div class="tut-end" id="tutEnd" hidden><span>¿Listo?</span><button class="tut-btn" data-tut="replay">${ic('rotate-ccw')} Verlo de nuevo</button><button class="tut-btn primary" data-tut="done">Empezar a escribir</button></div>
  </div>`;
  document.body.appendChild(root);

  const $ = id => root.querySelector('#' + id);
  const fit = $('tutFit'), cam = $('tvCam'), sceneEl = $('tvScene'), cursor = $('tvCursor'), vp = $('tutVp');
  T = {
    root, fit, cam, sceneEl, cursor, vp, opener: document.activeElement,
    i: 0, t: 0, fired: 0, playing: false, speed: 1, k: 1, last: 0, raf: 0, cx: 480, cy: 300, ended: false,
    paused: [], dragging: false, reduced: reducedMotion(),
  };
  T.audio = createTutorialAudio({ muted: render ? false : !soundPreference() });
  const ctx = makeCtx();
  T.ctx = ctx;
  setSoundIcon();

  const fitSize = () => { T.k = vp.clientWidth / 960 || 1; fit.style.transform = `scale(${T.k})`; };
  T.ro = new ResizeObserver(fitSize); T.ro.observe(vp); fitSize();

  root.addEventListener('click', onClick);
  const seekEl = $('tutSeek');
  seekEl.addEventListener('input', e => { seekGlobal(+e.target.value); });
  seekEl.addEventListener('pointerdown', () => { T.dragging = true; });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKey, true);

  setPlayIcon();
  if (T.reduced) { enter(0, SCENES[0].D); T.audio.pause(); }
  else { enter(0, 0, true); play(); }
  if (!render) $('tutPlay').focus({ preventScroll: true });
  T.render = render;
  T.raf = requestAnimationFrame(tick);
}

function makeCtx() {
  const q = sel => T.sceneEl.querySelector(sel);
  const seeking = () => T.fit.classList.contains('seeking');
  const pos = (el, fx = .5, fy = .5) => {
    // Se mide respecto a la propia escena: así da igual la escala del reproductor y el zoom de la cámara
    const sr = T.sceneEl.getBoundingClientRect(), r = el.getBoundingClientRect(), u = (sr.width / 960) || 1;
    return { x: (r.left - sr.left + r.width * fx) / u, y: (r.top - sr.top + r.height * fy) / u };
  };
  const ctx = {
    seeking, q, qa: sel => [...T.sceneEl.querySelectorAll(sel)],
    cap(text) {
      const p = T.root.querySelector('#tutText');
      if (seeking()) { p.textContent = text; return; }
      // Aparece palabra a palabra (ritmo de subtítulo de vídeo)
      p.innerHTML = text.split(' ').map((w, i) => `<span class="w" style="--i:${Math.min(i, 26)}">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
    },
    go(sel, o = {}) {
      const el = q(sel); if (!el) return;
      const { x, y } = pos(el, o.fx ?? .5, o.fy ?? .5);
      T.cx = x + (o.dx || 0); T.cy = y + (o.dy || 0);
      T.cursor.style.setProperty('--d', (o.dur || 700) + 'ms');
      T.cursor.style.transform = `translate(${T.cx}px, ${T.cy}px)`;
      T.cursor.classList.add('on');
    },
    hover(sel) {
      const el = q(sel); const h = el && el.closest('[data-h]'); if (!h || !h.parentElement) return;
      h.parentElement.querySelectorAll(':scope > [data-h].hov').forEach(e => e.classList.remove('hov'));
      h.classList.add('hov');
    },
    click(sel, o = {}) {
      const el = sel && q(sel);
      if (!seeking()) {
        const r = document.createElement('span'); r.className = 'tv-ripple' + (o.right ? ' r' : '');
        r.style.left = T.cx + 'px'; r.style.top = T.cy + 'px';
        T.cam.appendChild(r); r.addEventListener('animationend', () => r.remove()); setTimeout(() => r.remove(), 1200);
        T.audio.sfx(o.right ? 'rclick' : 'click');
        T.cursor.classList.add('down'); setTimeout(() => T.cursor && T.cursor.classList.remove('down'), 160);
        if (el) { el.classList.add('tv-press'); setTimeout(() => el.classList.remove('tv-press'), 200); }
      }
    },
    key(label) {
      if (seeking()) return;
      T.audio.sfx('key');
      const k = document.createElement('div'); k.className = 'tv-keychip'; k.textContent = label;
      T.fit.appendChild(k); k.addEventListener('animationend', () => k.remove()); setTimeout(() => k.remove(), 1800);
    },
    view(v) { const w = q('.tv-win'); if (w) { w.dataset.view = v; if (!seeking()) T.audio.sfx('swish'); } },
    sfx(name) { if (!seeking()) T.audio.sfx(name); },
    // Cámara: acerca la maqueta al elemento (o vuelve al plano general con sel = null)
    cam(sel, z = 1.4) {
      const el = sel && q(sel);
      if (!el) { T.cam.style.transform = ''; return; }
      const { x, y } = pos(el);
      const tx = Math.min(0, Math.max(960 * (1 - z), 480 - x * z)), ty = Math.min(0, Math.max(600 * (1 - z), 300 - y * z));
      T.cam.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    },
    popAtCursor(sel) {
      const m = q(sel); if (!m) return;
      m.style.left = Math.min(T.cx + 6, 960 - 224 - 230) + 'px'; m.style.top = Math.min(T.cy + 6, 600 - 230) + 'px';
      m.classList.add('on'); if (!seeking()) T.audio.sfx('pop');
    },
    swap(html, fade) {
      T.sceneEl.innerHTML = html;
      if (fade && !seeking()) { T.audio.sfx('whoosh'); T.sceneEl.classList.remove('tv-in'); void T.sceneEl.offsetWidth; T.sceneEl.classList.add('tv-in'); }
    },
  };
  return ctx;
}

// Construye la escena i y la deja en el instante t. Con `smooth` arranca desde cero con transiciones
// (paso natural a la escena siguiente); si no, aplica de golpe todo lo anterior a t (saltos y arrastre).
function enter(i, t = 0, smooth = false) {
  const sc = SCENES[i], steps = compile(sc);
  T.i = i; T.ended = false;
  T.root.querySelector('#tutEnd').hidden = true;
  T.root.querySelector('#tutTitle').textContent = sc.title;
  T.root.querySelector('#tutText').textContent = '';
  T.fit.querySelectorAll('.tv-ripple, .tv-keychip, .tv-chapter, .tv-edge').forEach(e => e.remove());
  T.cam.style.transition = 'none'; T.cam.style.transform = ''; void T.cam.offsetWidth; T.cam.style.transition = '';
  T.audio.setIntensity(sc.level);
  if (smooth) {
    T.sceneEl.innerHTML = sc.build();
    T.sceneEl.classList.remove('tv-in'); void T.sceneEl.offsetWidth; T.sceneEl.classList.add('tv-in');
    if (i > 0) chapterCard(i);
    T.t = 0; T.fired = 0; fire();
  } else {
    T.fit.classList.add('seeking');
    T.sceneEl.innerHTML = sc.build(); T.sceneEl.classList.remove('tv-in');
    T.cursor.classList.remove('on');
    T.t = t; T.fired = 0; fire();
    void T.fit.offsetWidth;
    T.fit.classList.remove('seeking');
  }
  updateUI();
}

// Tarjeta de capítulo + borde que barre la pantalla al cambiar de escena
function chapterCard(i) {
  if (T.reduced) return;
  T.audio.sfx('whoosh');
  const edge = document.createElement('div'); edge.className = 'tv-edge';
  const card = document.createElement('div'); card.className = 'tv-chapter';
  card.innerHTML = `<i>${i + 1}</i><b>${SCENES[i].name}</b>`;
  T.fit.append(edge, card);
  edge.addEventListener('animationend', () => edge.remove()); card.addEventListener('animationend', () => card.remove());
  setTimeout(() => { edge.remove(); card.remove(); }, 2000);
}

function setSoundIcon() {
  const b = T.root.querySelector('#tutSound'), m = T.audio.muted;
  b.innerHTML = ic(m ? 'volume-x' : 'volume-2');
  b.setAttribute('aria-pressed', String(m)); b.setAttribute('aria-label', m ? 'Activar sonido' : 'Silenciar sonido');
}

function toggleSound() { T.audio.setMuted(!T.audio.muted); setSoundPreference(!T.audio.muted); setSoundIcon(); T.audio.sfx('toggle'); }

function fire() {
  const steps = compile(SCENES[T.i]);
  while (T.fired < steps.length && steps[T.fired].t <= T.t) {
    const st = steps[T.fired++];
    try { st.fn(T.ctx); } catch (e) { console.warn('Tutorial: paso fallido', e); }
  }
}

function tick(now) {
  if (!T) return;
  T.raf = requestAnimationFrame(tick);
  if (!T.playing) { T.last = now; return; }
  const dt = Math.min(100, now - T.last) * T.speed; T.last = now;
  T.t += dt; fire();
  const sc = SCENES[T.i];
  if (T.t >= sc.D) {
    if (T.i < SCENES.length - 1) enter(T.i + 1, 0, true);
    else { T.t = sc.D; finish(); }
  }
  updateUI();
}

function finish() {
  T.playing = false; T.ended = true; setPaused(false); T.audio.sfx('success'); T.audio.fadeOut(1.4);
  if (T.render) window.__tutorialDone = true;
  T.root.querySelector('#tutEnd').hidden = false;
  setPlayIcon(); updateUI();
}

function setPaused(p) {
  if (p) { T.paused = T.fit.getAnimations({ subtree: true }).filter(a => a.playState === 'running'); T.paused.forEach(a => a.pause()); }
  else { T.paused.forEach(a => { try { if (a.playState === 'paused') a.play(); } catch (e) { /* ignorar */ } }); T.paused = []; }
}

function play() { if (T.ended) { restart(); return; } T.playing = true; T.last = performance.now(); setPaused(false); T.audio.resume(); setPlayIcon(); }
function pause() { T.playing = false; setPaused(true); T.audio.pause(); setPlayIcon(); }
function restart() { T.audio.setMuted(T.audio.muted); T.audio.resume(); enter(0, 0, true); T.playing = true; T.last = performance.now(); setPlayIcon(); }

function setPlayIcon() {
  const b = T.root.querySelector('#tutPlay');
  const label = T.ended ? 'Ver de nuevo' : T.playing ? 'Pausar' : 'Reproducir';
  b.innerHTML = ic(T.ended ? 'rotate-cw' : T.playing ? 'pause' : 'play');
  b.setAttribute('aria-label', label); b.dataset.state = T.ended ? 'ended' : T.playing ? 'playing' : 'paused';
}

function seekGlobal(g) {
  g = Math.max(0, Math.min(TOTAL - 1, g));
  let i = starts.length - 1; while (starts[i] > g) i--;
  enter(i, g - starts[i], false);
  setPaused(false);
}

function gotoScene(i, smooth) {
  i = Math.max(0, Math.min(SCENES.length - 1, i));
  if (T.reduced) { enter(i, SCENES[i].D); return; }
  enter(i, 0, !!smooth);
  if (T.playing) T.last = performance.now();
}

function updateUI() {
  const sc = SCENES[T.i], g = starts[T.i] + Math.min(T.t, sc.D);
  const seek = T.root.querySelector('#tutSeek');
  if (!T.dragging) seek.value = g;
  seek.setAttribute('aria-valuetext', `${fmt(g)} de ${fmt(TOTAL)} · ${sc.name}`);
  T.root.querySelector('#tutTime').textContent = `${fmt(g)} / ${fmt(TOTAL)}`;
  T.root.querySelector('#tutCount').textContent = `${T.i + 1} / ${SCENES.length} · ${sc.name}`;
  T.root.querySelectorAll('.tut-chap').forEach((b, i) => { if (i === T.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  const pct = (g / TOTAL * 100).toFixed(2) + '%';
  seek.style.setProperty('--p', pct);
  T.root.style.setProperty('--prog', pct);
}

const SPEEDS = [1, 1.5, 2, 0.75];
function onClick(e) {
  const b = e.target.closest('[data-tut]'); if (!b) return;
  const a = b.dataset.tut;
  if (a === 'close' || a === 'done') endTutorial(a === 'done');
  else if (a === 'play') { if (T.playing) pause(); else play(); }
  else if (a === 'prev') gotoScene(T.t > 2500 ? T.i : T.i - 1, false);
  else if (a === 'next') { if (T.i < SCENES.length - 1) gotoScene(T.i + 1, false); else { enter(T.i, SCENES[T.i].D); finish(); } }
  else if (a === 'goto') { gotoScene(+b.dataset.i, false); if (!T.reduced && !T.playing) play(); }
  else if (a === 'sound') toggleSound();
  else if (a === 'replay') { if (T.reduced) { enter(0, SCENES[0].D); } else restart(); }
  else if (a === 'speed') {
    T.speed = SPEEDS[(SPEEDS.indexOf(T.speed) + 1) % SPEEDS.length];
    b.textContent = T.speed + '×'; b.setAttribute('aria-label', `Velocidad de reproducción: ${T.speed}×`);
    T.fit.style.setProperty('--tv', T.speed); T.audio.setSpeed(T.speed);
  }
}

function onPointerUp() { if (T) T.dragging = false; }

function onKey(e) {
  if (!T) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTutorial(false); return; }
  if (e.key === 'Tab') {   // el foco se queda dentro del diálogo
    const f = [...T.root.querySelectorAll('button, input')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!T.root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  const onControl = e.target.closest && e.target.closest('button, input');
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !(e.target.type === 'range')) { toggleSound(); return; }
  if ((e.key === ' ' || e.key === 'k') && !onControl) { e.preventDefault(); if (T.playing) pause(); else play(); }
  else if (e.key === 'ArrowRight' && !(e.target.type === 'range')) { e.preventDefault(); if (T.i < SCENES.length - 1) gotoScene(T.i + 1, false); }
  else if (e.key === 'ArrowLeft' && !(e.target.type === 'range')) { e.preventDefault(); gotoScene(T.t > 2500 ? T.i : T.i - 1, false); }
  // Mientras el tutorial está abierto, los atajos de la aplicación no deben actuar sobre el documento
  if (e.ctrlKey || e.metaKey) e.stopPropagation();
}

export function endTutorial(start = false) {
  if (!T) return;
  cancelAnimationFrame(T.raf); T.ro.disconnect();
  window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerup', onPointerUp);
  T.audio.close();
  const { root, opener } = T; T = null;
  root.classList.add('leaving');
  const done = () => root.remove();
  if (reducedMotion()) done(); else { root.addEventListener('animationend', done, { once: true }); setTimeout(done, 400); }
  if (start) hideHome();
  else if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
}
