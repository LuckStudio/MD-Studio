import { editor } from './state.js';

// ═══════════════════════════════════════════════════
// TOKEN ESTIMATION (aproximación al tokenizador de Claude)
// ═══════════════════════════════════════════════════
export function estimateTokens(text) {
  if (!text) return 0;
  // Heurística mixta: combina conteo por caracteres y por "piezas".
  // Para texto natural ES/EN, los tokenizadores BPE producen ~1 token cada
  // ~3.7 caracteres. La puntuación, símbolos y saltos de línea suelen ser
  // tokens propios, así que los contamos aparte para mayor fidelidad.
  const chars = text.length;
  const byChars = chars / 3.7;
  // Piezas: palabras + signos de puntuación/símbolos sueltos
  const pieces = (text.match(/[\w\u00C0-\u017F]+|[^\s\w]/g) || []).length;
  const byPieces = pieces * 1.3;
  // Media ponderada de ambas estimaciones
  return Math.max(1, Math.round((byChars + byPieces) / 2));
}

// ═══════════════════════════════════════════════════
// ESTADÍSTICAS DEL DOCUMENTO
// ═══════════════════════════════════════════════════
export function computeStats(text) {
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Frases: separadas por . ! ? … (evita contar abreviaturas obvias no es perfecto)
  const sentences = (text.match(/[^.!?…]+[.!?…]+/g) || []).filter(s => /\w/.test(s)).length || (words ? 1 : 0);
  // Párrafos: bloques separados por línea en blanco
  const paragraphs = text.split(/\n\s*\n/).filter(b => b.trim()).length;
  const lines = text.split('\n').length;
  const tokens = estimateTokens(text);

  // Estructura markdown (ignora dentro de bloques de código)
  let inFence = false;
  let headings = 0, codeBlocks = 0, listItems = 0, links = 0, tables = 0;
  text.split('\n').forEach(line => {
    if (/^\s*```/.test(line)) { if (!inFence) codeBlocks++; inFence = !inFence; return; }
    if (inFence) return;
    if (/^\s*#{1,6}\s+/.test(line)) headings++;
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) listItems++;
    if (/^\s*\|.*\|/.test(line)) tables++;
    links += (line.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  });

  const avgWordsPerSentence = sentences ? (words / sentences) : 0;
  const avgCharsPerWord = words ? (charsNoSpace / words) : 0;
  // Tiempo de lectura (~200 palabras/min) y de habla (~130 ppm)
  const readMin = words / 200;
  const speakMin = words / 130;

  // Índice de legibilidad simple (adaptado): frases largas + palabras largas = más difícil
  // Escala 0-100, mayor = más fácil de leer
  let readability = 100 - (avgWordsPerSentence * 1.5) - (avgCharsPerWord * 5);
  readability = Math.max(0, Math.min(100, Math.round(readability)));

  return { chars, charsNoSpace, words, sentences, paragraphs, lines, tokens,
    headings, codeBlocks, listItems, links, tables,
    avgWordsPerSentence, avgCharsPerWord, readMin, speakMin, readability };
}

export function fmtTime(min) {
  if (min < 1/60) return '0s';
  const totalSec = Math.round(min * 60);
  if (totalSec < 60) return totalSec + 's';
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return s ? `${m} min ${s}s` : `${m} min`;
}

export function readabilityLabel(score) {
  if (score >= 75) return 'Muy fácil de leer';
  if (score >= 55) return 'Fácil';
  if (score >= 40) return 'Moderado';
  if (score >= 25) return 'Algo denso';
  return 'Denso / técnico';
}

export function openStats() {
  const s = computeStats(editor.value);
  const row = (label, value, accent) =>
    `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value${accent?' accent':''}">${value}</span></div>`;
  let html = '';
  html += '<div class="stats-section-title">Volumen</div>';
  html += row('Palabras', s.words.toLocaleString('es'));
  html += row('Caracteres (con espacios)', s.chars.toLocaleString('es'));
  html += row('Caracteres (sin espacios)', s.charsNoSpace.toLocaleString('es'));
  html += row('Tokens estimados', '~' + s.tokens.toLocaleString('es'), true);
  html += row('Líneas', s.lines.toLocaleString('es'));

  html += '<div class="stats-section-title">Estructura</div>';
  html += row('Párrafos', s.paragraphs);
  html += row('Frases', s.sentences);
  html += row('Encabezados (secciones)', s.headings);
  html += row('Elementos de lista', s.listItems);
  html += row('Bloques de código', s.codeBlocks);
  html += row('Tablas (filas)', s.tables);
  html += row('Enlaces', s.links);

  html += '<div class="stats-section-title">Densidad y lectura</div>';
  html += row('Palabras por frase', s.avgWordsPerSentence.toFixed(1));
  html += row('Caracteres por palabra', s.avgCharsPerWord.toFixed(1));
  html += row('Tiempo de lectura', fmtTime(s.readMin));
  html += row('Tiempo en voz alta', fmtTime(s.speakMin));

  html += '<div class="stats-section-title">Legibilidad</div>';
  html += row('Índice', s.readability + ' / 100', true);
  html += `<div class="stat-bar"><div style="width:${s.readability}%"></div></div>`;
  html += `<div class="stat-hint">${readabilityLabel(s.readability)} — estimación orientativa basada en longitud de frases y palabras.</div>`;

  document.getElementById('statsBody').innerHTML = html;
  document.getElementById('statsOverlay').classList.add('open');
}

export function closeStats() {
  document.getElementById('statsOverlay').classList.remove('open');
}
