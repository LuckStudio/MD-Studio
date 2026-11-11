# MD Studio · Propuestas de mejora

Documento de trabajo para decidir y desarrollar lo siguiente. Cada propuesta indica **qué** es, **por qué** merece la pena, **cómo** se haría con la base actual (módulos concretos), **cómo se prueba**, el **esfuerzo** (S ≈ medio día · M ≈ 1–2 días · L ≈ una semana o más) y los **riesgos**. Al final hay un orden recomendado por oleadas y las decisiones que necesito de ti.

Convenciones de la base de código (para que cualquier propuesta encaje): módulos ES en `app/src`, estado compartido en `S` (`state.js`), eventos tipados en `events.ts`, acciones del marcado solo vía `data-action` + lista cerrada `ACTIONS` (`dispatch.js`), TypeScript solo en núcleos puros, movimiento ≤ 300 ms con `prefers-reduced-motion` (ver `motion.css`) y cada funcionalidad con su prueba Playwright (+ axe si añade pantalla).

---

## A. Edición (el corazón del producto)

### A1 · Arrastrar y soltar bloques · M · prioridad alta
- **Qué**: un asa `⋮⋮` junto al «+» de cada bloque; arrastrarla reordena el bloque con una línea guía y animación de asentamiento. Teclado: `Alt+↑/↓` (ya existe «Subir/Bajar bloque» en el menú contextual).
- **Por qué**: reordenar secciones es lo que más se hace al estructurar un documento y hoy exige cortar y pegar.
- **Cómo**: `blockops.moveBlock(blk, dir)` ya intercambia cuerpos conservando separaciones; generalizarlo a `moveBlockTo(blk, index)`. Asa en `blocks.js` (junto a `blkPlus`), eventos `pointerdown/move/up` con `setPointerCapture`; la línea guía es un elemento absoluto reposicionado con `transform`. Autodesplazamiento al acercarse a los bordes.
- **Pruebas**: arrastre simulado con `page.mouse`, verificar el Markdown resultante y que Ctrl+Z lo deshace en un solo paso; axe sobre el asa (`aria-label`, accesible por teclado con `Alt+↑/↓`).
- **Riesgos**: bloques de solo lectura (`data-ro`), tablas y listas largas; con `contenteditable` hay que cancelar la selección nativa durante el arrastre.

### A2 · Selección de varios bloques · M
- **Qué**: `Mayús+clic` o arrastre en el margen selecciona varios bloques; el menú contextual y las teclas (borrar, duplicar, convertir, mover) actúan sobre todos.
- **Cómo**: conjunto `S.blockSel` de `[s,e)`; `blockops.js` recibe listas; el resaltado usa la misma clase que `.blk-flash`. `info(blk)` ya valida que el bloque no cambió.
- **Pruebas**: convertir tres párrafos en una lista de tareas con un clic; deshacer en un paso.

### A3 · Pegado inteligente · S
- **Qué**: al pegar HTML (web, Word, Notion) se convierte a Markdown limpio; al pegar una URL sobre texto seleccionado se crea el enlace; al pegar una tabla de Excel/Sheets se crea una tabla Markdown; un aviso discreto «Pegado como texto plano · Deshacer» permite revertir.
- **Cómo**: `turndown` ya está en el proyecto para la edición de bloques; añadir reglas (tablas GFM, `<br>`, listas anidadas) y un único manejador `paste` en `preview-edit.js` y otro en `editor.js` con la misma función pura (nuevo `paste-core.ts`, tipado y testeable sin DOM).
- **Pruebas**: tabla de ejemplos HTML → Markdown esperado (unitaria sobre el núcleo) + pegado real en Playwright con `clipboardData`.

### A4 · Autocompletado de `[[wikilinks]]` y de rutas · S
- **Qué**: al escribir `[[` aparece una lista de documentos de la carpeta abierta (filtrado difuso, con el título del documento); `](` ofrece rutas relativas e imágenes.
- **Cómo**: `wsindex.js` ya indexa; reutilizar el popover del menú `/` (`blocks.js`) con otro proveedor de elementos. La paleta tiene el filtro difuso (`commands.js`): extraerlo a `fuzzy.js`.
- **Pruebas**: escribir `[[no`, elegir con Intro y comprobar el Markdown; crear el archivo si no existe (ya soportado).

### A5 · Editor visual de front matter · M
- **Qué**: sobre el documento, un panel plegable con formulario (nombre, descripción, `allowed-tools`…) y validación inmediata para `SKILL.md`, `CLAUDE.md`, agentes y comandos; para otros archivos, pares clave-valor libres.
- **Cómo**: `frontmatter.ts` ya valida; añadir `serialize()` estable (conserva orden y comentarios) y un componente de formulario generado desde el mismo esquema que usa `claude.js`. Los cambios escriben solo el bloque `---` del texto fuente.
- **Riesgos**: YAML con comentarios o anclas: si no se puede reescribir sin pérdida, el panel se ofrece en solo lectura con enlace «Editar en el código».

### A6 · Modo enfoque de bloque («máquina de escribir») · S
- **Qué**: atenúa todos los bloques menos el actual y mantiene la línea de escritura centrada (opción en Ver). Combina con el modo Zen existente.
- **Cómo**: clase en `#preview` + `:has(.md-blk:focus-within)`/atributo en el bloque activo; el centrado usa `scrollIntoView({block:'center'})` suave en `selectionchange` (con `reducedMotion()` instantáneo).

### A7 · Tablas: ordenar, importar y pegar CSV · M
- **Qué**: «Ordenar por esta columna» (A→Z, Z→A, numérico), importar CSV/TSV a tabla, copiar tabla como CSV, anchura de columna automática en el Markdown.
- **Cómo**: `tables.js` ya tiene operaciones por fila/columna y submenús en `contextmenus.js`; añadir `sortColumn(table, col, dir, mode)` y `fromCsv()` en un núcleo puro `table-core.ts`.

### A8 · Imágenes avanzadas · M
- **Qué**: redimensionar arrastrando una esquina (se guarda como `![alt](ruta){width=320}` o HTML con `width`), alineación, texto alternativo obligatorio con aviso, **comprimir al insertar** (máx. 1600 px, WebP/JPEG a calidad configurable) y limpieza de imágenes huérfanas de `assets/`.
- **Riesgos**: la sintaxis `{width=}` no es CommonMark; documentar que se exporta como `<img width>` y mantener el Markdown estándar como opción por defecto.

### A9 · Corrector ortográfico y de estilo · M
- **Qué**: subrayado ortográfico en la vista previa editable con el idioma del documento (`lang` del front matter) y avisos suaves de estilo (frases > 40 palabras, voz pasiva frecuente, repeticiones).
- **Cómo**: el corrector nativo ya funciona en `contenteditable` (`spellcheck` + `lang`); lo propio sería la capa de estilo: puro, local y sin red (nada sale del equipo, coherente con el resto del producto).

### A10 · Snippets con variables · M
- **Qué**: «Insertar plantilla» ya existe; añadir variables (`{{fecha}}`, `{{titulo}}`, `{{cursor}}`) y saltos con `Tab` entre campos, además de alias de teclado (`;reu` → plantilla de acta).
- **Cómo**: `templates.js` guarda texto plano: pasar a `{nombre, cuerpo, alias}` con migración, y un pequeño expansor en el manejador de teclas del `/`.

---

## B. Organización y navegación

### B1 · Mover secciones desde el índice · M
- **Qué**: en el panel de índice, arrastrar un título mueve la sección entera (hasta el siguiente título del mismo nivel o superior); botones `←/→` cambian el nivel de la sección.
- **Cómo**: núcleo puro `outline-core.ts` (dado el texto, devuelve `[{nivel, s, e}]`); reutilizar el arrastre de A1.

### B2 · Etiquetas, backlinks enriquecidos y vista de grafo · M–L
- **Qué**: `#etiquetas` indexadas, panel de enlaces entrantes con el fragmento de contexto, y una vista de grafo opcional (canvas 2D, sin dependencias) de la carpeta.
- **Cómo**: `wsindex.js` extrae etiquetas y enlaces en la misma pasada; el grafo es una simulación de fuerzas simple en un `Worker` (ver D1). Entrada desde la paleta («Ver grafo»).

### B3 · Tablero de tareas de la carpeta · M
- **Qué**: agrega todos los `- [ ]` de la carpeta en una vista con filtros (archivo, etiqueta, vencimiento `📅 2026-12-01`) y permite marcarlos sin abrir el archivo (cambia el `[ ]` en el texto fuente).
- **Cómo**: el índice ya lee todos los archivos; escritura atómica por archivo con comprobación de `mtime` (como `watch.js`).

### B4 · Pestañas: anclar, agrupar y reabrir cerrada · S
- **Qué**: `Ctrl+Mayús+T` reabre la última pestaña cerrada; clic derecho → «Anclar pestaña» (se hace más estrecha y no se cierra con «Cerrar las demás»); grupos de color.
- **Cómo**: el menú contextual de pestañas existe (`contextmenus.js`); guardar una pila `S.closedTabs` (máx. 10) con el contenido y la referencia al archivo.

### B5 · Varias carpetas de trabajo · M
- **Qué**: añadir más de una carpeta al explorador (por ejemplo, el proyecto y el vault de notas) con búsqueda conjunta.
- **Cómo**: `S.workspace` pasa a lista; `wsindex.js` indexa por raíz; recientes ya guardan `FileSystemDirectoryHandle` en IndexedDB.

### B6 · Paleta de comandos 2.0 · M
- **Qué**: acciones con argumentos (`> convertir en título 2`), historial de acciones recientes arriba, atajos mostrados a la derecha y «repetir última acción».
- **Cómo**: `commands.js` es una lista plana; añadir `{ args, run(arg) }`, ranking con frecuencia de uso (localStorage) y `Ctrl+Mayús+P` para repetir.

---

## C. Salida, compartir y publicar

### C1 · Presentación desde Markdown · M
- **Qué**: `---` entre diapositivas (o cada `##`), modo presentación a pantalla completa con notas del orador (`Note:`), transiciones y exportación a HTML autónomo y PDF.
- **Cómo**: reutilizar el exportador HTML (`exportdlg.js`) con una plantilla de diapositivas y el mismo motor de movimiento. El tutorial y los fundidos entre pantallas ya demuestran el lenguaje visual.

### C2 · EPUB y exportación de bloque como imagen · M
- **Qué**: EPUB 3 a partir de los títulos; «Copiar bloque como imagen» (tabla, código, diagrama Mermaid) para pegar en presentaciones.
- **Cómo**: `fflate` ya está para DOCX/enlaces; EPUB es un ZIP con `content.opf` y XHTML. La imagen sale de un `<canvas>` o SVG serializado (`foreignObject`) con los estilos incrustados.

### C3 · Publicar y compartir · S (depende de tu decisión)
- **Qué**: publicar la PWA en GitHub Pages (el workflow ya existe y compila `dist/web`) y, opcionalmente, «Compartir como Gist».
- **Estado**: pendiente de tu OK; no se ha subido nada. Hace falta repositorio remoto, HTTPS (Pages lo da) y revisar `manifest.webmanifest`/`sw.js` con la ruta base definitiva.

### C4 · Co-edición entre dos personas sin servidor · L
- **Qué**: sesión compartida por enlace con WebRTC (par a par) y fusión de cambios con un CRDT ligero (Yjs o Automerge, ≈ 40–90 KB cargados bajo demanda).
- **Riesgos**: señalización (necesita un servidor mínimo o intercambio manual del código), conflictos con el modelo de bloques de `preview-edit.js`. Recomiendo no empezar por aquí.

---

## D. Plataforma, rendimiento y robustez

### D1 · Render en un Web Worker · L
- **Qué**: `parseMarkdownBlocks`, el índice de la carpeta, el grafo y el recuento de tokens pasan a un worker para que documentos de varios MB no bloqueen la escritura.
- **Cómo**: los núcleos puros (TS) ya no tocan el DOM; el saneado (DOMPurify) se queda en el hilo principal. Medir antes con `tests/perf.spec.mjs` (hoy ≈ 110 ms en 300 KB).

### D2 · Firefox y Safari de primera clase · M
- **Qué**: sin File System Access API, la app usa descargas/`<input type=file>`; ofrecer un **modo OPFS** (carpeta privada del origen) como «espacio de trabajo interno» con importar/exportar ZIP.
- **Cómo**: `fs.js` ya abstrae `FsaFile/FsaDir`; añadir `OpfsDir` con la misma interfaz y ejecutar la suite también en Firefox y WebKit (`playwright.config.mjs`, proyectos adicionales).

### D3 · Copias de seguridad y recuperación · S
- **Qué**: exportar/importar **todo** (pestañas, versiones, ajustes, plantillas) como un `.zip`; recordatorio mensual; recuperación de la sesión tras un fallo con el último estado válido.
- **Cómo**: el historial de versiones vive en IndexedDB (`versions.js`); un solo manifiesto JSON + los `.md`.

### D4 · Diagnóstico exportable · S
- **Qué**: «Copiar información de diagnóstico» (versión, navegador, capacidades, últimos errores, tamaño de datos) para soporte, sin ningún dato del contenido.
- **Cómo**: ya hay captura de errores en el arranque (`boot-guard.js`); anillo de 50 eventos en memoria.

### D5 · Integración continua y presupuesto de rendimiento · S
- **Qué**: en cada commit, `npm test` + Lighthouse con umbrales (rendimiento ≥ 95, JS inicial ≤ 200 KB) y comparación de tamaños de `dist/`.
- **Cómo**: ampliar el workflow de Pages con un trabajo de verificación; el bundle actual de la app son ≈ 230 KB sin comprimir.

---

## E. Experiencia, animación y marca

### E1 · Tutorial «hazlo tú» · M · prioridad alta
- **Qué**: tras el vídeo animado, un modo práctica sobre un documento de ejemplo con 6 retos guiados (escribe `/`, convierte un bloque con clic derecho, inserta una fila…), cada uno con comprobación automática y confeti sutil al completar.
- **Cómo**: `tutorial.js` ya tiene el motor de escenas; los retos usan los eventos de `events.ts` (`doc:rendered`, acciones de bloque) para validar. Sin bloquear: «Saltar reto» siempre visible.
- **Pruebas**: un test por reto con el flujo correcto y uno con el incorrecto (la pista no desaparece).

### E2 · Transiciones compartidas (View Transitions API) · S
- **Qué**: el paso Inicio → documento y el cambio de vista usan `document.startViewTransition` (con la píldora del selector y la pestaña como elementos con nombre) y caen a las animaciones actuales donde no exista.
- **Riesgos**: no mezclar con el menú contextual abierto; respetar `reducedMotion()`.

### E3 · Más micro-interacciones pensadas · S
- Contador de palabras que «rueda» al cambiar (≤ 200 ms), casilla de tarea con trazo animado, chevron del árbol que rota, resaltado de la coincidencia al saltar desde la búsqueda, «onda» en el botón Guardar al confirmar, y esqueletos de carga en el panel de enlaces entrantes.
- **Regla**: solo `opacity/transform`, ≤ 300 ms, nada decorativo que retrase una acción.

### E4 · Temas y personalización · S
- **Qué**: sepia, alto contraste, y **color de acento** elegible (con comprobación automática de contraste AA que ajusta el tono si no llega); anchura de lectura y tipografías ya son ajustables.
- **Cómo**: los tokens están centralizados en `base.css`/`tokens.css`; derivar `--accent-text/--accent-strong` del acento elegido con el mismo cálculo que usa el validador de contraste de los tests.

### E5 · Móvil y táctil · M
- **Qué**: barra inferior de formato sobre el teclado virtual, gestos (deslizar entre pestañas), el panel `/` anclado arriba del teclado y menú contextual con pulsación larga (`contextmenu` ya se dispara en Android; en iOS requiere `touchstart` temporizado).
- **Cómo**: `visualViewport` para ubicar barras sobre el teclado; pruebas con `resize_window` móvil y emulación táctil.

### E6 · Sonido en la aplicación · S
- **Qué**: los efectos del tutorial (clic, tecla, éxito) pasan a ser opcionales en la propia aplicación (confirmar guardado, completar una tarea, exportar), desactivados por defecto y con volumen propio en Apariencia.
- **Cómo**: `tutorial-audio.js` ya sintetiza todo con Web Audio; extraer los efectos a un módulo `sfx.js` compartido.

---

## F. Calidad de la base

### F1 · Regresión visual del tutorial y del inicio · S
- Una captura por escena del tutorial (con `animations: 'disabled'` y `seeking`) para detectar cambios de interfaz que dejen el vídeo desactualizado.

### F2 · Mantener el tutorial sincronizado con la interfaz · S
- Prueba que recorre las escenas y comprueba que cada etiqueta citada («Convertir en», «Insertar fila debajo», «Exportar»…) existe en la interfaz real (`contextmenus.js`, `exportdlg.js`). Si alguien renombra una acción, el test avisa de que hay que actualizar el tutorial.

### F3 · Migrar más módulos a TypeScript · M
- Siguientes candidatos por ser puros: `blockops` (separar la lógica de texto de la del DOM), `wsindex`, `tables` (núcleo), `templates`. Beneficio: pruebas unitarias rápidas sin navegador.

---

## Orden recomendado

| Oleada | Contenido | Resultado visible |
|---|---|---|
| **1 · Pulir lo nuevo** (≈ 3–4 días) | A1 arrastrar bloques · A3 pegado inteligente · A4 autocompletado `[[` · B4 pestañas · E1 «hazlo tú» · F2 | Editar es todavía más fluido y el aprendizaje es práctico |
| **2 · Productividad** (≈ 1 semana) | A2 multiselección · B1 mover secciones · B6 paleta 2.0 · A10 snippets · A7 tablas · E3 micro-interacciones | Para documentos largos y uso diario |
| **3 · Alcance** (≈ 1–2 semanas) | C1 presentaciones · C2 EPUB/imagen · D2 Firefox/Safari + OPFS · D3 copias · E4 temas · E5 móvil | Funciona en más sitios y sale a más formatos |
| **4 · Ambicioso** | B2 grafo · B3 tablero de tareas · D1 worker · C4 co-edición | Solo si hay demanda real |

## Decisiones que necesito de ti

1. **Publicación (C3)**: ¿subimos a GitHub Pages ya, o sigues probándola en local? Hasta que lo digas no se publica nada.
2. **Prioridad de la oleada 1**: ¿empiezo por arrastrar bloques (A1) o por el tutorial «hazlo tú» (E1)?
3. **Navegadores (D2)**: ¿necesitas que funcione en Firefox/Safari, o basta Chrome/Edge (hoy es lo único que se prueba)?
4. **Enlaces en el editor**: en modo edición un clic coloca el cursor y `Ctrl+clic` abre el enlace (como en los editores de código). ¿Prefieres otra convención (por ejemplo, abrir con un clic cuando la vista previa no es editable)?
5. **Pantalla de carga**: ¿se queda activada por defecto (se puede quitar en Apariencia) o prefieres que solo salga la primera vez del día?
