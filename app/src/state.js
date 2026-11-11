export const S = {};
// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
export const editor    = document.getElementById('editor');
export const preview   = document.getElementById('preview');
export const emptyState = document.getElementById('emptyState');
export const lineNums  = document.getElementById('lineNumbers');
export const wc        = document.getElementById('wc');
export const cc        = document.getElementById('cc');
export const tk        = document.getElementById('tk');
export const cursorPos = document.getElementById('cursorPos');

S.tabs = [];
S.activeTabId = null;
S.tabIdCounter = 0;
S.wordWrap = true;
S.previewEditing = false;
export let previewSyncTimer = null;
S.lsSaveTimer = null;
S.openMenuId = null;
S.currentView = 'split';
S.syncScrollEnabled = true;
