import { finishSplash } from './splash.js';
import './icons.js';
import './motion.js';
import './frontmatter.ts';
import './markdown.js';
import './state.js';
import './fs.js';
import './tabs.js';
import './storage.js';
import './files.js';
import './export.js';
import './stats.js';
import './render.js';
import './preview-sync.js';
import './history.js';
import './editor.js';
import './find.js';
import './actions.js';
import './view.js';
import './import.js';
import './menu.js';
import './commands.js';
import './example.js';
import './settings.js';
import './recents.js';
import './workspace.js';
import './wsindex.js';
import './enhance.js';
import './wikilinks.js';
import './preview-edit.js';
import './blocks.js';
import './tables.js';
import './images.js';
import './watch.js';
import './templates.js';
import './diff.js';
import './docx.js';
import './exportdlg.js';
import './versions.js';
import './claude.js';
import './reader.js';
import './tour.js';
import './tutorial.js';
import './home.js';
import './pwa.js';
import './a11y.js';
import './splash.js';
import './ctxmenu.js';
import './blockops.js';
import './contextmenus.js';
import './dispatch.js';
import { S, editor } from './state.js';
import { createTab, getActiveTab, renderTabs } from './tabs.js';
import { loadFromLS } from './storage.js';
import { updatePreview } from './render.js';
import { updateCursor, updateModifiedIndicator } from './editor.js';
import { showToast } from './actions.js';
import { applyWordWrap, setView } from './view.js';
import { loadTemplates, renderTemplateFlyout } from './commands.js';
import { initialMD } from './example.js';
import { applyAllSettings, loadSettings } from './settings.js';
import { restoreTabRefs } from './recents.js';
import { checkExternalChanges } from './watch.js';
import { consumeShareHash } from './exportdlg.js';
import { hideHome, showHome } from './home.js';
import { consumeSharedFiles } from './pwa.js';

import * as ALL from './_all.js';

// Puente para pruebas y depuración: con window.__EXPOSE_APP__ (lo pone Playwright con addInitScript) todas las
// exportaciones se vuelven globales, con enlace vivo (un getter por nombre). En uso normal no hace nada.
if (window.__EXPOSE_APP__) {
  for (const k of Object.keys(ALL)) Object.defineProperty(globalThis, k, { get: () => ALL[k], configurable: true });
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
export async function init() {
  window.__appBooted = true;   // lo comprueba boot-guard.js
  loadSettings();
  applyAllSettings();
  loadTemplates();
  renderTemplateFlyout();

  const restored = loadFromLS();
  if (restored && S.tabs.length > 0) {
    const tab = getActiveTab() || S.tabs[0];
    editor.value = tab.content;
    renderTabs();
    S.activeTabId = tab.id;
    renderTabs();
    await restoreTabRefs();   // vuelve a asociar cada pestaña con su archivo en disco
    showToast('✓ Sesión restaurada');
  } else {
    const tab = createTab('documento', initialMD);
    tab.savedContent = initialMD;
    tab.modified = false;
    S.activeTabId = tab.id;
    editor.value = initialMD;
    renderTabs();
  }
  applyWordWrap();
  setView(S.currentView);
  updatePreview();
  updateCursor();
  updateModifiedIndicator();
  editor.focus();

  // Si el sistema operativo ha lanzado la app con un archivo (?launch=file) o se ha
  // compartido contenido hacia ella (?share=1), no se muestra el inicio.
  const params = new URLSearchParams(location.search);
  if (params.get('share') === '1') consumeSharedFiles();
  const sharedByLink = await consumeShareHash();
  const launched = params.get('launch') === 'file' || params.get('share') === '1' || sharedByLink;
  if (launched) hideHome(); else showHome();
  document.documentElement.classList.remove('booting');   // la interfaz ya está lista: se muestra de una vez
  finishSplash();   // la pantalla de carga se desvanece cuando termina su animación
  checkExternalChanges();
}

init();
