import { S } from './state.js';
import { createTab, renderTabs, switchTab } from './tabs.js';
import { showToast } from './actions.js';
import { setView } from './view.js';

// ═══════════════════════════════════════════════════
// PLANTILLAS INCORPORADAS (archivos de Claude Code)
// ═══════════════════════════════════════════════════
export const BUILTIN_TEMPLATES = [
  {
    id: 'claude-md', icon: '📘', name: 'CLAUDE.md del proyecto', file: 'CLAUDE',
    content: `# Nombre del proyecto

Una o dos frases: qué es y para quién.

## Comandos

- Instalar: \`npm install\`
- Desarrollo: \`npm run dev\`
- Tests: \`npm test\`
- Build: \`npm run build\`

## Arquitectura

- \`src/\` — código de la aplicación
- \`tests/\` — pruebas

## Convenciones

- Estilo de código y nombres.
- Cómo se escriben los commits y las ramas.

## Cosas a evitar

- Lo que Claude no debe tocar o hacer en este repositorio.
`,
  },
  {
    id: 'skill', icon: '🧩', name: 'Skill (SKILL.md)', file: 'SKILL',
    content: `---
name: nombre-de-la-skill
description: Qué hace la skill y cuándo debe usarla Claude. Incluye las palabras que diría el usuario ("crea un informe", "revisa este PDF").
---

# Nombre de la skill

## Cuándo usarla

- Situación 1
- Situación 2

## Instrucciones

1. Primer paso.
2. Segundo paso.
3. Comprueba el resultado antes de darlo por terminado.

## Ejemplos

**Entrada:** …

**Resultado esperado:** …
`,
  },
  {
    id: 'agent', icon: '🤖', name: 'Agente (subagent)', file: 'revisor',
    content: `---
name: revisor-de-codigo
description: Revisa cambios de código en busca de errores y problemas de seguridad. Úsalo de forma proactiva después de modificar código.
tools: Read, Grep, Glob
model: sonnet
---

Eres un revisor de código senior.

Al ser invocado:

1. Lee los cambios recientes.
2. Busca errores de lógica, casos límite sin tratar y problemas de seguridad.
3. Responde con una lista ordenada por gravedad, indicando archivo y línea.
`,
  },
  {
    id: 'command', icon: '⌨', name: 'Comando slash', file: 'comando',
    content: `---
description: Qué hace este comando
argument-hint: [argumento]
allowed-tools: Bash(git status:*), Bash(git diff:*)
---

Haz lo siguiente con $ARGUMENTS:

1. …
2. …
`,
  },
];

export function newFromTemplate(id) {
  const t = BUILTIN_TEMPLATES.find(x => x.id === id);
  if (!t) return;
  const tab = createTab(t.file, t.content);
  tab.savedContent = '';   // aún no existe en disco: figura como "sin guardar"
  tab.modified = true;
  renderTabs();
  switchTab(tab.id);
  setView(S.currentView === 'preview' ? 'split' : S.currentView);
  showToast('✓ Plantilla: ' + t.name);
}
