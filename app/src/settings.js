import { setSplashPreference, splashPreference } from './splash.js';
import { S } from './state.js';
import { setSyntaxHighlight, syntaxHighlightEnabled } from './render.js';
import { showToast } from './actions.js';

// ═══════════════════════════════════════════════════
// PANEL DE AJUSTES VISUALES
// ═══════════════════════════════════════════════════
export const FONT_OPTIONS = [
  { label: 'DM Sans',        value: "'DM Sans', sans-serif",         cat:'Sans' },
  { label: 'Inter',          value: "'Inter', sans-serif",           cat:'Sans' },
  { label: 'Lora',           value: "'Lora', Georgia, serif",        cat:'Serif' },
  { label: 'Source Serif',   value: "'Source Serif 4', Georgia, serif", cat:'Serif' },
  { label: 'Merriweather',   value: "'Merriweather', Georgia, serif", cat:'Serif' },
  { label: 'DM Mono',        value: "'DM Mono', monospace",          cat:'Mono' },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace",   cat:'Mono' },
  { label: 'Fira Code',      value: "'Fira Code', monospace",        cat:'Mono' },
];
export const ACCENT_OPTIONS = [
  { name:'Terracota', accent:'#CF6A4C', hover:'#D97855' },
  { name:'Coral',     accent:'#E8765A', hover:'#EE8770' },
  { name:'Ámbar',     accent:'#D9A04C', hover:'#E0AE5F' },
  { name:'Oro',       accent:'#C9A227', hover:'#D6B23A' },
  { name:'Verde',     accent:'#5FA37A', hover:'#6FB389' },
  { name:'Esmeralda', accent:'#3FA88A', hover:'#52B89A' },
  { name:'Teal',      accent:'#3DA5A5', hover:'#52B5B5' },
  { name:'Cielo',     accent:'#4FA3D9', hover:'#64B0E0' },
  { name:'Azul',      accent:'#5B8DEF', hover:'#6F9CF2' },
  { name:'Índigo',    accent:'#6C6CE5', hover:'#8080EA' },
  { name:'Púrpura',   accent:'#9B7BD4', hover:'#A98CDD' },
  { name:'Violeta',   accent:'#B265D4', hover:'#BE7CDD' },
  { name:'Rosa',      accent:'#D46A9B', hover:'#DD7FAA' },
  { name:'Frambuesa', accent:'#D9536B', hover:'#E0697E' },
  { name:'Grafito',   accent:'#8A8784', hover:'#9C9996' },
];
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: '#CF6A4C',
  syncScroll: true,
  previewEdit: true,
  syntaxHL: true,
  'font-editor': "'DM Mono', monospace",
  'font-preview': "'Lora', Georgia, serif",
  'editor-size': '14.5px',
  'preview-size': '16.5px',
  'editor-lh': '1.75',
  'preview-lh': '1.85',
  'preview-width': '720px',
};
export let settings = { ...DEFAULT_SETTINGS };

export function openSettings() {
  document.getElementById('settingsOverlay').classList.add('open');
  document.getElementById('settingsDrawer').classList.add('open');
  syncSettingsUI();
}
export function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
  document.getElementById('settingsDrawer').classList.remove('open');
}

export function toggleSplash() {
  const on = !splashPreference();
  setSplashPreference(on);
  document.getElementById('splashSwitch').classList.toggle('on', on);
  showToast(on ? '✦ Pantalla de carga activada' : '○ Pantalla de carga desactivada');
}
export function toggleSyncScroll() {
  S.syncScrollEnabled = !S.syncScrollEnabled;
  document.getElementById('syncSwitch').classList.toggle('on', S.syncScrollEnabled);
  settings.syncScroll = S.syncScrollEnabled;
  saveSettings();
  showToast(S.syncScrollEnabled ? '🔗 Sincronización activada' : '⛓ Sincronización desactivada');
}

export function toggleSyntaxHL() {
  setSyntaxHighlight(!syntaxHighlightEnabled);
  document.getElementById('hlSwitch').classList.toggle('on', syntaxHighlightEnabled);
  showToast(syntaxHighlightEnabled ? '🎨 Resaltado activado' : '○ Resaltado desactivado');
}

export function applySetting(key, value) {
  settings[key] = value;
  document.documentElement.style.setProperty('--' + key, value);
  saveSettings();
}

export function setTheme(theme) {
  settings.theme = theme;
  document.body.classList.toggle('light-theme', theme === 'light');
  document.getElementById('themeDark').classList.toggle('active', theme === 'dark');
  document.getElementById('themeLight').classList.toggle('active', theme === 'light');
  saveSettings();
}

// Oscurece un #rrggbb un porcentaje (para que el texto blanco sobre el acento siga siendo legible)
export function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return '#' + c(n >> 16 & 255) + c(n >> 8 & 255) + c(n & 255);
}
export function setAccent(accent, hover) {
  settings.accent = accent;
  const soft = hexToRgba(accent, 0.12);
  const glow = hexToRgba(accent, 0.25);
  const sel  = hexToRgba(accent, 0.3);
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-hover', hover || accent);
  root.setProperty('--accent-strong', darken(accent, 0.24));   // fondo de botones con texto blanco
  root.setProperty('--accent-soft', soft);
  root.setProperty('--accent-glow', glow);
  root.setProperty('--selection', sel);
  renderAccentSwatches();
  saveSettings();
}

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

export function renderAccentSwatches() {
  const cont = document.getElementById('accentSwatches');
  cont.innerHTML = '';
  ACCENT_OPTIONS.forEach(opt => {
    const sw = document.createElement('div');
    sw.className = 'accent-sw' + (opt.accent === settings.accent ? ' active' : '');
    sw.style.background = opt.accent;
    sw.title = opt.name;
    sw.onclick = () => setAccent(opt.accent, opt.hover);
    cont.appendChild(sw);
  });
}

export function buildFontPicker(pickerId) {
  const picker = document.getElementById(pickerId);
  const targetKey = picker.dataset.target;
  picker.innerHTML = '';

  const trigger = document.createElement('div');
  trigger.className = 'font-picker-trigger';
  const current = FONT_OPTIONS.find(f => f.value === settings[targetKey]) || FONT_OPTIONS[0];
  trigger.innerHTML = `<span class="trig-label" style="font-family:${current.value}">${current.label}</span><span class="chev">▼</span>`;
  picker.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'font-picker-menu';
  let lastCat = null;
  FONT_OPTIONS.forEach(f => {
    if (f.cat !== lastCat) {
      const c = document.createElement('div');
      c.className = 'font-cat';
      c.textContent = f.cat;
      menu.appendChild(c);
      lastCat = f.cat;
    }
    const opt = document.createElement('div');
    opt.className = 'font-opt' + (f.value === settings[targetKey] ? ' active' : '');
    opt.innerHTML = `<span class="fo-name">${f.label}</span><span class="fo-sample" style="font-family:${f.value}">Aa Bb Cc 123</span>`;
    opt.onclick = (e) => {
      e.stopPropagation();
      applySetting(targetKey, f.value);
      trigger.querySelector('.trig-label').textContent = f.label;
      trigger.querySelector('.trig-label').style.fontFamily = f.value;
      menu.querySelectorAll('.font-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      picker.classList.remove('open');
    };
    menu.appendChild(opt);
  });
  picker.appendChild(menu);

  trigger.onclick = (e) => {
    e.stopPropagation();
    // cierra otros pickers abiertos
    document.querySelectorAll('.font-picker.open').forEach(p => { if (p !== picker) p.classList.remove('open'); });
    picker.classList.toggle('open');
  };
}

export function buildFontPickers() {
  buildFontPicker('fontPickerEditor');
  buildFontPicker('fontPickerPreview');
}

// Cerrar pickers al clicar fuera
document.addEventListener('click', () => {
  document.querySelectorAll('.font-picker.open').forEach(p => p.classList.remove('open'));
});

export function syncSettingsUI() {
  buildFontPickers();
  const set = (id, val, lbl) => {
    document.getElementById(id).value = parseFloat(val);
    if (lbl) document.getElementById(lbl).textContent = val;
  };
  set('setEditorSize', settings['editor-size'], 'valEditorSize');
  set('setEditorLh', settings['editor-lh'], 'valEditorLh');
  set('setPreviewSize', settings['preview-size'], 'valPreviewSize');
  set('setPreviewLh', settings['preview-lh'], 'valPreviewLh');
  set('setPreviewWidth', settings['preview-width'], 'valPreviewWidth');
  setTheme(settings.theme);
  renderAccentSwatches();
  document.getElementById('syncSwitch').classList.toggle('on', S.syncScrollEnabled);
  document.getElementById('hlSwitch').classList.toggle('on', syntaxHighlightEnabled);
  document.getElementById('peSwitch').classList.toggle('on', settings.previewEdit !== false);
  document.getElementById('splashSwitch').classList.toggle('on', splashPreference());
}

export function applyAllSettings() {
  const root = document.documentElement.style;
  ['font-editor','font-preview','editor-size','preview-size','editor-lh','preview-lh','preview-width']
    .forEach(k => root.setProperty('--' + k, settings[k]));
  document.body.classList.toggle('light-theme', settings.theme === 'light');
  S.syncScrollEnabled = settings.syncScroll !== false;
  setSyntaxHighlight(settings.syntaxHL !== false);
  const ao = ACCENT_OPTIONS.find(a => a.accent === settings.accent) || ACCENT_OPTIONS[0];
  setAccent(ao.accent, ao.hover);
}

export function saveSettings() {
  try { localStorage.setItem('claudemd_settings', JSON.stringify(settings)); } catch(e) {}
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem('claudemd_settings');
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // Tipografías que ya no se incluyen (versiones anteriores): vuelven a la de por defecto
    ['font-editor', 'font-preview'].forEach(k => {
      if (!FONT_OPTIONS.some(f => f.value === settings[k])) settings[k] = DEFAULT_SETTINGS[k];
    });
  } catch(e) {}
}

export function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  applyAllSettings();
  syncSettingsUI();
  saveSettings();
  showToast('↺ Apariencia restablecida');
}
