import { S, editor } from './state.js';
import { getActiveTab } from './tabs.js';
import { persistTabRefs } from './recents.js';

// ═══════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════
export function saveToLS() {
  try {
    const cur = getActiveTab();
    if (cur) cur.content = editor.value;
    const state = {
      tabs: S.tabs.map(t => ({
        id: t.id, name: t.name, content: t.content,
        savedContent: t.savedContent, modified: t.modified
      })),
      activeTabId: S.activeTabId,
      tabIdCounter: S.tabIdCounter,
      wordWrap: S.wordWrap,
      currentView: S.currentView
    };
    localStorage.setItem('claudemd_v3', JSON.stringify(state));
    _lastLsSave = Date.now();
    updateLsStatus();
    persistTabRefs();
  } catch(e) { console.warn('LS save error:', e); }
}

// Indicador de autoguardado con tiempo relativo
export let _lastLsSave = null;
export function updateLsStatus() {
  const el = document.getElementById('lsStatus');
  if (!el) return;
  if (!_lastLsSave) { el.textContent = '💾 Autoguardado'; return; }
  const secs = Math.round((Date.now() - _lastLsSave) / 1000);
  let txt;
  if (secs < 3) txt = '💾 Guardado ahora';
  else if (secs < 60) txt = `💾 Guardado hace ${secs}s`;
  else { const m = Math.floor(secs/60); txt = `💾 Guardado hace ${m} min`; }
  el.textContent = txt;
}
// Refresca el texto relativo cada 15s
setInterval(updateLsStatus, 15000);

export function debouncedSaveToLS() {
  clearTimeout(S.lsSaveTimer);
  S.lsSaveTimer = setTimeout(saveToLS, 600);
}

export function loadFromLS() {
  try {
    const raw = localStorage.getItem('claudemd_v3');
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (!state.tabs || !state.tabs.length) return false;
    S.tabs = state.tabs.map(t => ({
      ...t,
      undoStack: [t.content],
      redoStack: [],
      file: null, relPath: null, diskMtime: null
    }));
    S.tabIdCounter = state.tabIdCounter || S.tabs.length;
    S.activeTabId = null;
    S.wordWrap = state.wordWrap !== undefined ? state.wordWrap : true;
    S.currentView = state.currentView || 'split';
    const toActivate = S.tabs.find(t => t.id === state.activeTabId) || S.tabs[0];
    if (toActivate) S.activeTabId = toActivate.id;
    return true;
  } catch(e) {
    return false;
  }
}
