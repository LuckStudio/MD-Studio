import { on } from './events.ts';
import { parseFrontMatter } from './frontmatter.ts';
import { editor } from './state.js';
import { escAttr, escHtml, getActiveTab } from './tabs.js';
import { estimateTokens } from './stats.js';

// ═══════════════════════════════════════════════════
// ARCHIVOS DE CLAUDE: detección, validación y presupuesto de tokens
// ═══════════════════════════════════════════════════
// Detecta SKILL.md, agentes, comandos y CLAUDE.md por nombre/ruta, valida su
// front matter y calcula cuántos tokens ocupa cada sección.

export const CLAUDE_KIND_LABEL = {
  skill: 'Skill', agent: 'Agente', command: 'Comando', 'claude-md': 'CLAUDE.md',
};
export const KNOWN_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch',
  'Task', 'Agent', 'TodoWrite', 'NotebookEdit', 'NotebookRead', 'BashOutput', 'KillShell', 'ExitPlanMode', 'Skill', 'SlashCommand']);
export const KNOWN_MODELS = new Set(['sonnet', 'opus', 'haiku', 'inherit', 'fable']);
export const TOKEN_WARN = { 'claude-md': 3000, skill: 5000, agent: 3000, command: 2000 };

export function claudeFileInfo(tab) {
  if (!tab) return null;
  const fname = tab.file ? tab.file.name : tab.name + '.md';
  const dirs = tab.relPath ? tab.relPath.slice(0, -1) : (tab.file && tab.file.path ? tab.file.path.split(/[\\/]/).slice(0, -1) : []);
  const lower = dirs.map(d => d.toLowerCase());
  let kind = null;
  if (/^skill\.md$/i.test(fname)) kind = 'skill';
  else if (/^(claude|claude\.local|agents)\.md$/i.test(fname)) kind = 'claude-md';
  else if (lower.includes('agents')) kind = 'agent';
  else if (lower.includes('commands')) kind = 'command';
  return kind ? { kind, fname, folder: dirs[dirs.length - 1] || null } : null;
}

// Tokens por sección (encabezados # y ##), ignorando "#" dentro de bloques de código
export function sectionTokens(md) {
  const fm = parseFrontMatter(md);
  const lines = (fm && fm.body !== undefined ? fm.body : md).split('\n');
  const sections = [];
  let cur = { title: '(inicio)', lines: [] }, fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const h = !fence && l.match(/^(#{1,2})\s+(.*)$/);
    if (h) { sections.push(cur); cur = { title: h[2].trim(), lines: [l] }; } else cur.lines.push(l);
  }
  sections.push(cur);
  const rows = sections.map(s => ({ title: s.title, tokens: estimateTokens(s.lines.join('\n').trim()) })).filter(r => r.tokens > 1);
  if (fm && fm.raw) rows.unshift({ title: '(front matter)', tokens: estimateTokens(fm.raw) });
  return rows;
}

export const isKebab = s => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

// Devuelve { info, issues:[{level:'error'|'warn'|'info', msg}], total, sections }
export function lintClaudeFile(tab, text) {
  const info = claudeFileInfo(tab);
  if (!info) return null;
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const fm = parseFrontMatter(text);
  const total = estimateTokens(text);
  const lineCount = text.split('\n').length;

  if (fm && fm.error) add('error', 'El front matter empieza con --- pero no se cierra (falta la segunda línea ---).');
  const d = fm && fm.data ? fm.data : null;
  const str = k => (d && typeof d[k] === 'string' ? d[k].trim() : '');

  if (info.kind === 'skill' || info.kind === 'agent') {
    if (!d) add('error', 'Falta el front matter (bloque --- al inicio) con name y description.');
    else {
      const name = str('name');
      if (!name) add('error', 'Falta el campo "name".');
      else {
        if (!isKebab(name)) add('error', `"name" debe ir en minúsculas, números y guiones (ej. mi-skill): "${name}".`);
        if (name.length > 64) add('error', `"name" supera los 64 caracteres (${name.length}).`);
        if (info.kind === 'skill' && /claude|anthropic/i.test(name)) add('error', '"name" no puede contener las palabras reservadas "claude" o "anthropic".');
        if (info.kind === 'skill' && info.folder && info.folder !== name) add('warn', `El nombre de la carpeta ("${info.folder}") no coincide con "name" ("${name}").`);
      }
      const desc = str('description');
      if (!desc) add('error', 'Falta el campo "description": es lo que Claude usa para decidir cuándo activarlo.');
      else {
        if (desc.length > 1024) add('error', `"description" supera los 1024 caracteres (${desc.length}).`);
        if (/<[a-z/][^>]*>/i.test(desc)) add('error', '"description" no puede contener etiquetas XML/HTML.');
        if (desc.length < 40) add('warn', '"description" es muy corta: indica qué hace y cuándo usarlo.');
        if (!/\b(cuando|cuándo|usa|úsa|when|use|si el usuario|siempre que)\b/i.test(desc)) add('info', 'Conviene que "description" diga también CUÁNDO usarlo.');
      }
    }
    if (info.kind === 'skill' && lineCount > 500) add('warn', `SKILL.md tiene ${lineCount} líneas: mueve el detalle a archivos de referencia (se recomienda < 500).`);
  }

  if (info.kind === 'agent' && d) {
    const tools = Array.isArray(d.tools) ? d.tools : str('tools') ? str('tools').split(',').map(s => s.trim()) : [];
    const unknown = tools.filter(t => t && !KNOWN_TOOLS.has(t.replace(/\(.*$/, '')) && !t.startsWith('mcp__'));
    if (unknown.length) add('warn', 'Herramientas no reconocidas en "tools": ' + unknown.join(', '));
    const model = str('model');
    if (model && !KNOWN_MODELS.has(model) && !/^claude-/.test(model)) add('warn', `"model" desconocido: "${model}" (sonnet, opus, haiku, inherit o un ID completo).`);
    if (!tools.length) add('info', 'Sin "tools": el agente heredará todas las herramientas.');
  }

  if (info.kind === 'command') {
    if (!d || !str('description')) add('warn', 'Un comando debería tener "description" en el front matter (aparece en el menú de "/").');
    if (d && !/\$ARGUMENTS|\$\d/.test(text) && d['argument-hint']) add('info', 'Define "argument-hint" pero el texto no usa $ARGUMENTS ni $1…');
  }

  if (info.kind === 'claude-md') {
    if (lineCount > 200) add('warn', `CLAUDE.md tiene ${lineCount} líneas. Los archivos largos se siguen peor: considera dividirlos o importar con @ruta.`);
    if (!/^#{1,2}\s/m.test(text)) add('info', 'Sin encabezados: organiza el contenido en secciones cortas.');
  }

  const warnAt = TOKEN_WARN[info.kind];
  if (warnAt && total > warnAt) add('warn', `Ocupa ~${total} tokens (aviso a partir de ${warnAt}). Se carga en el contexto: recorta lo que no sea imprescindible.`);

  const sections = sectionTokens(text);
  const big = sections.slice().sort((a, b) => b.tokens - a.tokens)[0];
  if (big && sections.length > 2 && big.tokens / total > 0.45 && total > 600) add('info', `La sección «${big.title}» concentra el ${Math.round(big.tokens / total * 100)} % de los tokens.`);

  return { info, issues, total, sections, lineCount };
}

// ── Estado en la barra inferior ──
export let _claudeLast = null;
export function updateClaudeStatus() {
  const el = document.getElementById('claudeStatus');
  const tab = getActiveTab();
  const res = tab ? lintClaudeFile(tab, editor.value) : null;
  _claudeLast = res;
  if (!res) { el.hidden = true; return; }
  const err = res.issues.filter(i => i.level === 'error').length;
  const warn = res.issues.filter(i => i.level === 'warn').length;
  el.hidden = false;
  el.className = 'status-item status-claude ' + (err ? 'err' : warn ? 'warn' : 'ok');
  el.textContent = `${CLAUDE_KIND_LABEL[res.info.kind]}: ` + (err ? `✕ ${err} error${err > 1 ? 'es' : ''}` : warn ? `⚠ ${warn} aviso${warn > 1 ? 's' : ''}` : '✓ válido');
}

export function showClaudeCheck() {
  updateClaudeStatus();
  const res = _claudeLast;
  const body = document.getElementById('claudeBody');
  if (!res) {
    body.innerHTML = '<p class="cl-none">Este documento no parece un archivo de Claude.<br>Se reconocen <b>SKILL.md</b>, <b>CLAUDE.md</b>, y los archivos dentro de carpetas <b>agents/</b> y <b>commands/</b>.</p>';
  } else {
    const icon = { error: '✕', warn: '⚠', info: 'ℹ' };
    const list = res.issues.length
      ? res.issues.map(i => `<li class="cl-${i.level}"><span>${icon[i.level]}</span><span>${escHtml(i.msg)}</span></li>`).join('')
      : '<li class="cl-ok"><span>✓</span><span>Todo en orden.</span></li>';
    const max = Math.max(...res.sections.map(s => s.tokens), 1);
    const rows = res.sections.slice().sort((a, b) => b.tokens - a.tokens).slice(0, 12).map(s =>
      `<div class="cl-row"><span class="cl-title" title="${escAttr(s.title)}">${escHtml(s.title)}</span>
         <span class="cl-bar"><i style="width:${Math.max(2, Math.round(s.tokens / max * 100))}%"></i></span>
         <span class="cl-tok">${s.tokens}</span></div>`).join('');
    body.innerHTML = `
      <div class="cl-head"><b>${CLAUDE_KIND_LABEL[res.info.kind]}</b> · ${escHtml(res.info.fname)} · ~${res.total} tokens · ${res.lineCount} líneas</div>
      <ul class="cl-issues">${list}</ul>
      <div class="cl-sub">Tokens por sección</div>${rows}`;
  }
  document.getElementById('claudeOverlay').classList.add('open');
}
export function closeClaudeCheck() { document.getElementById('claudeOverlay').classList.remove('open'); }

on('doc:rendered', updateClaudeStatus);