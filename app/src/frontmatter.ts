import { escHtml } from './tabs.js';

// ═══════════════════════════════════════════════════
// FRONT MATTER YAML (subconjunto suficiente para skills, agentes y comandos)
// ═══════════════════════════════════════════════════
// Soporta: clave: valor · cadenas entrecomilladas · bloques | y > · listas
// ("- x" y "[a, b]") · mapas anidados de un nivel. No es un parser YAML completo.

export type YamlValue = string | string[] | Record<string, string>;
export interface FrontMatter { data: Record<string, YamlValue>; keys: string[]; body: string; lineCount: number; raw: string; error?: undefined }
export interface FrontMatterError { error: 'sin-cierre' }

export function unquoteYaml(v: string): string {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
      (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    const q = v[0];
    v = v.slice(1, -1);
    return q === '"' ? v.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : v.replace(/''/g, "'");
  }
  return v;
}

export function parseInlineList(v: string): string[] {
  const inner = v.trim().slice(1, -1);
  return inner.trim() ? inner.split(',').map(unquoteYaml) : [];
}

// Devuelve null si el texto no empieza con front matter. Si empieza pero no cierra:
// { error: 'sin-cierre' }. Si no: { data, keys, body, lineCount, raw }.
export function parseFrontMatter(md: string): FrontMatter | FrontMatterError | null {
  const text = md.replace(/^﻿/, '');
  if (!/^---[ \t]*\r?\n/.test(text)) return null;
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) { end = i; break; }
  }
  const firstContent = lines.slice(1, end < 0 ? lines.length : end).find(l => l.trim());
  if (firstContent === undefined || !/^[A-Za-z_][\w-]*\s*:/.test(firstContent)) {
    return end < 0 ? null : (firstContent === undefined ? { data: {}, keys: [], body: lines.slice(end + 1).join('\n'), lineCount: end + 1, raw: '' } : null);
  }
  if (end < 0) return { error: 'sin-cierre' };

  const block = lines.slice(1, end);
  const data: Record<string, YamlValue> = {};
  const keys: string[] = [];
  let i = 0;
  const indentOf = (l: string): number => l.match(/^ */)![0].length;
  while (i < block.length) {
    const line = block[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/);
    if (!m || indentOf(line) > 0) { i++; continue; }
    const key = m[1];
    const sv = m[2].trim();
    let val: YamlValue = sv;
    i++;
    // Recoge las líneas hijas (con sangría o elementos de lista "- ")
    const child: string[] = [];
    while (i < block.length && (!block[i].trim() || indentOf(block[i]) > 0 || /^-\s/.test(block[i]))) {
      child.push(block[i]); i++;
    }
    while (child.length && !child[child.length - 1].trim()) child.pop();

    if (/^[|>][+-]?$/.test(sv)) {
      const lit = sv[0] === '|';
      const ind = Math.min(...child.filter(l => l.trim()).map(indentOf), 999);
      const rows = child.map(l => l.slice(Math.min(ind, indentOf(l))));
      val = lit ? rows.join('\n') : rows.join(' ').replace(/\s+/g, ' ').trim();
    } else if (sv.startsWith('[') && sv.endsWith(']')) {
      val = parseInlineList(sv);
    } else if (sv === '' && child.length) {
      const items = child.filter(l => l.trim());
      if (items.every(l => /^\s*-\s/.test(l))) {
        val = items.map(l => unquoteYaml(l.replace(/^\s*-\s+/, '')));
      } else {
        const obj: Record<string, string> = {};
        items.forEach(l => { const mm = l.trim().match(/^([\w.-]+)\s*:\s*(.*)$/); if (mm) obj[mm[1]] = unquoteYaml(mm[2]); });
        val = obj;
      }
    } else if (child.length) {
      // escalar plano en varias líneas
      val = unquoteYaml([sv, ...child.map(l => l.trim())].filter(Boolean).join(' '));
    } else {
      val = unquoteYaml(sv);
    }
    if (!(key in data)) keys.push(key);
    data[key] = val;
  }
  return { data, keys, body: lines.slice(end + 1).join('\n'), lineCount: end + 1, raw: block.join('\n') };
}

export function frontMatterCardHTML(fm: FrontMatter | FrontMatterError | null): string {
  if (!fm || !('keys' in fm) || !fm.keys.length) return '';
  const fmt = (v: YamlValue): string => {
    if (Array.isArray(v)) return v.map(x => `<span class="fm-chip">${escHtml(String(x))}</span>`).join('');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `<span class="fm-chip">${escHtml(k)}: ${escHtml(String(x))}</span>`).join('');
    return escHtml(String(v));
  };
  const rows = fm.keys.map(k => `<dt>${escHtml(k)}</dt><dd>${fmt(fm.data[k])}</dd>`).join('');
  return `<aside class="frontmatter"><div class="fm-title">Metadatos</div><dl>${rows}</dl></aside>`;
}
