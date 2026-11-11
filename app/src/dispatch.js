import { toggleSplash } from './settings.js';
import { closeActiveTab, closeTab, newTab } from './tabs.js';
import { downloadMD, openFile, openFolder, saveFile, saveFileAs } from './files.js';
import { exportHTML, exportPDF, exportTXT } from './export.js';
import { closeStats, openStats } from './stats.js';
import { redo, undo } from './history.js';
import { goToLine } from './editor.js';
import { closeFind, findNav, openFind, replaceAll, replaceOne, toggleFindOpt } from './find.js';
import { clearEditor, copyMD, insertBlock, insertHeading, showExample, wrap } from './actions.js';
import { setView, toggleTOC, toggleWordWrap, toggleZen } from './view.js';
import { handleFileImport, triggerImport } from './import.js';
import { closeMenu, toggleMenu } from './menu.js';
import { deleteTemplate, insertSnippetKey, insertTemplate, saveAsTemplate } from './commands.js';
import { applySetting, closeSettings, openSettings, resetSettings, setTheme, toggleSyncScroll, toggleSyntaxHL } from './settings.js';
import { clearRecents } from './recents.js';
import { closeFolder, toggleFiles } from './workspace.js';
import { closeBacklinks, showBacklinks } from './wikilinks.js';
import { togglePreviewEdit } from './preview-edit.js';
import { closeSrcDialog, saveSrcDialog } from './blocks.js';
import { conflictDiff, conflictKeep, conflictReload } from './watch.js';
import { newFromTemplate } from './templates.js';
import { closeDiff, saveFromDiff, showDiff } from './diff.js';
import { closeExport, openExport, runExport } from './exportdlg.js';
import { closeHistory, openHistory, restoreSelectedVersion } from './versions.js';
import { closeClaudeCheck, showClaudeCheck } from './claude.js';
import { toggleReader } from './reader.js';
import { dismissTour, startTour } from './tour.js';
import { startTutorial } from './tutorial.js';
import { hideHome, openExampleTab, pasteAsNewTab, showHome } from './home.js';
import { closeInstallHelp, installApp } from './pwa.js';

// ═══════════════════════════════════════════════════
// DESPACHO DE EVENTOS DECLARATIVOS
// ═══════════════════════════════════════════════════
// El marcado no lleva onclick/oninput: usa data-action="funcion" (+ data-args='[json]').
// Esto permite una CSP sin 'unsafe-inline' en scripts. Reglas de seguridad:
//  · solo se atienden elementos FUERA de la vista previa (el contenido del
//    Markdown es ajeno y nunca debe poder disparar acciones de la app);
//  · solo se llama a funciones del catálogo ACTIONS (lista cerrada).
export const ACTIONS = {
  // archivo / pestañas
  newTab, openFile, closeActiveTab, closeTab, saveFile, saveFileAs, downloadMD, copyMD,
  triggerImport, exportHTML, exportPDF, exportTXT, showExample, clearEditor,
  showHome, hideHome, openExampleTab, pasteAsNewTab, clearRecents, installApp, closeInstallHelp,
  openFolder, closeFolder, toggleFiles, showDiff, closeDiff, showClaudeCheck, closeClaudeCheck,
  newFromTemplate, saveFromDiff, conflictReload, conflictKeep, conflictDiff,
  // formato / insertar
  wrap, insertHeading, insertBlock, insertSnippetKey, saveAsTemplate, insertTemplate, deleteTemplate,
  // vista
  setView, toggleWordWrap, toggleZen, goToLine, openStats, closeStats, toggleTOC, toggleReader,
  // edición
  undo, redo, openFind, closeFind, findNav, toggleFindOpt, replaceOne, replaceAll,
  // menús y ajustes
  toggleMenu, closeMenu, openSettings, closeSettings, setTheme, resetSettings,
  toggleSyncScroll, toggleSyntaxHL, togglePreviewEdit, toggleSplash, startTour, startTutorial, dismissTour, closeSrcDialog, saveSrcDialog, openHistory, closeHistory, restoreSelectedVersion, showBacklinks, closeBacklinks, openExport, closeExport, runExport,
};

export function parseArgs(el) {
  if (!el.dataset.args) return [];
  try { const a = JSON.parse(el.dataset.args); return Array.isArray(a) ? a : [a]; }
  catch (e) { return []; }
}

document.addEventListener('click', e => {
  const t = e.target;
  if (!(t instanceof Element) || t.closest('#preview')) return;

  const overlay = t.closest('[data-overlay-close]');
  if (overlay && t === overlay) { ACTIONS[overlay.dataset.overlayClose]?.(); return; }

  const el = t.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) { console.warn('Acción desconocida:', el.dataset.action); return; }
  if (el.hasAttribute('data-stop')) e.stopPropagation();
  fn(...parseArgs(el));
  // Los elementos de un menú desplegable lo cierran tras ejecutarse
  if (el.closest('.menu-dd') && el.dataset.action !== 'toggleMenu') closeMenu();
});

document.addEventListener('input', e => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !el.dataset.setting) return;
  applySetting(el.dataset.setting, el.value + (el.dataset.unit || ''));
  const label = document.getElementById(el.dataset.label);
  if (label) label.textContent = el.value + (el.dataset.unit || '');
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.dataset.change === 'handleFileImport') handleFileImport(e);
});
