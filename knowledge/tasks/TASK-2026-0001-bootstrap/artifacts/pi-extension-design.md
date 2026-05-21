# Дизайн Pi Extension: aide-plan-mode

## Контекст

Pi philosophy: "No plan mode. Write plans to files, or build it with extensions."
aide реализуется именно как pi extension — не standalone tool, не отдельный агент.

## Цель

Создать extension `aide-plan-mode`, который:
1. Включает **plan mode** для брейншторма и генерации артефактов задачи.
2. Авто-переключается в **agent mode** для работы по спекам.
3. Работает в рамках единой pi-сессии с единым агентом.
4. Управляет `knowledge/` структурой проекта.

## Архитектура extension

```
.pi/extensions/aide-plan-mode/
├── index.ts              # Entry point: event hooks, commands, flags
├── plan-mode.ts          # Plan mode state machine, system prompt injection
├── agent-mode.ts         # Agent mode context assembly
├── task-tools.ts         # Custom tools: create_task, create_plan, create_sdd, finalize_plan
├── knowledge-io.ts       # Чтение/запись в knowledge/ (JSON primary, markdown derivative)
├── context-assembly.ts   # Сборка контекста агента из task + project knowledge
├── ui-widgets.ts         # TUI widgets: plan mode indicator, task status widget
└── package.json
```

## Режимы работы

### Plan Mode

**Триггер входа:**
- Команда `/plan [описание]`
- Flag `--plan` при запуске pi
- Пользователь явно просит "спланируй задачу" (heuristic в `input` event)

**Что происходит:**
1. Extension меняет system prompt через `before_agent_start`:
   - Убирает coding guidelines, добавляет planning guidelines.
   - Добавляет JSON schema task/plan/sdd в контекст.
   - Добавляет instruction: "Ты в plan mode. Цель — сформулировать задачу и создать артефакты. Не пиши код."
2. Активируются plan-mode tools: `create_task`, `create_plan`, `create_sdd`, `add_invariant`, `add_delivery_unit`.
3. UI: status line показывает `[PLAN MODE]`, widget отображает текущий этап планирования.
4. Агент ведёт брейншторм с оператором, собирая:
   - TASK-ID, краткое имя, описание
   - Инварианты
   - Delivery units
   - Границы и риски

**Триггер выхода (auto-switch):**
- Tool `finalize_plan` вызывается агентом.
- Extension:
  - Сохраняет все JSON артефакты в `knowledge/tasks/<TASK-ID>/`
  - Генерирует markdown derivative (task.md, plan.md, sdd.md) для operator read-only
  - Меняет system prompt обратно на agent mode
  - Отправляет `sendUserMessage` с follow-up: "Задача TASK-2026-XXXX сформулирована. Начинаю работу по плану."
  - Меняет UI: status line `[AGENT MODE]`, widget показывает активную задачу

### Agent Mode

**Триггер входа:**
- Auto-switch из plan mode
- Команда `/agent` или `/work`
- Пользователь даёт команду, которая распознаётся как agent task (heuristic)

**Что происходит:**
1. Extension собирает контекст агента через `context` event:
   - Текущая задача из `knowledge/tasks/<TASK-ID>/task.json`
   - Релевантные закрытые задачи (semantic search через embedding index)
   - Project knowledge: module maps, decisions, architecture
2. System prompt: coding guidelines + task context + relevant knowledge
3. Активируются agent-mode tools: `read_task`, `update_task_status`, `create_subtask`, `run_verification`, `git_commit_task`
4. Агент работает по спекам, обновляет `worklog.md`, двигая delivery units по статусной модели

### Heuristic Routing (автовыбор режима)

Extension анализирует `input` event:
- Ключевые слова plan mode: "спланируй", "обсудим", "брейншторм", "формулировка", "требования"
- Ключевые слова agent mode: "сделай", "реализуй", "исправь", "напиши", "рефакторинг"
- Если неоднозначно — STOP, спросить оператора: `1` — plan mode, `2` — agent mode

## Custom Tools

### Plan Mode Tools

| Tool | Описание | Параметры |
|------|----------|-----------|
| `create_task` | Создать task.json | task_id, slug, title, description, invariants[], priority |
| `create_plan` | Создать plan.json | task_id, steps[], risks[], checkpoints[] |
| `create_sdd` | Создать sdd.json | task_id, architecture, invariant_set, implementation_phases[] |
| `add_invariant` | Добавить инвариант к задаче | task_id, inv_id, description, verification_method |
| `add_delivery_unit` | Добавить delivery unit | task_id, du_id, purpose, base_branch |
| `finalize_plan` | Завершить plan mode, переключиться в agent mode | task_id, confirm |

### Agent Mode Tools

| Tool | Описание | Параметры |
|------|----------|-----------|
| `read_task` | Прочитать task.json + связанные артефакты | task_id, include_closed, include_subtasks |
| `update_task_status` | Обновить статус задачи или delivery unit | task_id, status, du_id? |
| `create_subtask` | Создать подзадачу | parent_task_id, subtask_id, title, description |
| `run_verification` | Запустить verification matrix | task_id, scope |
| `git_commit_task` | Сделать task-scoped commit | task_id, message, scope |
| `search_knowledge` | Semantic search по project knowledge | query, scope, limit |

## State Management

Extension state хранится в session entries (`pi.appendEntry()`):

```typescript
interface AideState {
  mode: "plan" | "agent" | "idle";
  currentTaskId?: string;
  currentTaskDir?: string;
  planArtifacts: Array<{type: "task" | "plan" | "sdd", path: string}>;
  agentContext: {
    loadedTasks: string[];
    loadedModules: string[];
    lastVerification: string;
  };
}
```

Восстановление state при `session_start`:
```typescript
pi.on("session_start", async (event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "aide-state") {
      // restore state
    }
  }
});
```

## UI Components

### Status Line
```typescript
ctx.ui.setStatus("aide-mode", mode === "plan" ? "[PLAN]" : "[AGENT]");
```

### Widget (above editor)
```typescript
ctx.ui.setWidget("aide-task", [
  `Task: ${currentTaskId} — ${taskTitle}`,
  `Mode: ${mode} | DU: ${deliveryUnitStatus}`,
  `Branch: ${gitBranch}`,
]);
```

### Custom UI для Plan Mode
```typescript
ctx.ui.custom({
  render: (theme) => {
    // Full-screen or overlay for plan mode wizard
  },
  handleInput: (key) => {
    // Keyboard navigation
  }
});
```

## System Prompt Injection

### Plan Mode System Prompt

```
You are in PLAN MODE for aide (AI-Native Development Environment).

OBJECTIVE: Formulate a task and create its artifacts. Do NOT write code.

RULES:
- Use create_task, create_plan, create_sdd tools to persist artifacts.
- Every task MUST have: TASK-ID, slug, title, description, invariants.
- Invariants use machine-verifiable markers: INVARIANT:, PRE:, POST:, CONTRACT:, SCOPE:, EVIDENCE:.
- Delivery units define publish boundaries.
- Ask clarifying questions if requirements are ambiguous.
- When ready, call finalize_plan to auto-switch to AGENT MODE.

OUTPUT FORMAT: JSON primary (task.json, plan.json, sdd.json). Markdown is derivative.
```

### Agent Mode System Prompt

```
You are in AGENT MODE for aide (AI-Native Development Environment).

OBJECTIVE: Execute the task according to its specifications.

CONTEXT:
- Current task: {task_id} — {title}
- Branch: {branch}
- Invariants: {invariant_list}
- Plan: {plan_steps}
- Relevant knowledge: {knowledge_snippets}

RULES:
- Follow the plan. Update status via update_task_status.
- Create subtasks if work exceeds current boundaries.
- All code changes must be task-scoped commits via git_commit_task.
- Run verification matrix before marking task complete.
- If context is ambiguous — STOP and ask the operator with options 1/2/3.
```

## Knowledge I/O Layer

### JSON Primary Format

```json
// knowledge/tasks/TASK-2026-0001/task.json
{
  "task_id": "TASK-2026-0001",
  "slug": "bootstrap",
  "title": "Bootstrap core",
  "description": "...",
  "status": "active",
  "priority": "critical",
  "branch": "task/task-2026-0001-bootstrap",
  "invariants": [
    {"id": "INV-1", "text": "AI-First specification", "status": "defined"}
  ],
  "delivery_units": [
    {"id": "DU-1", "status": "open", "purpose": "Core design"}
  ],
  "created_at": "2026-05-21",
  "updated_at": "2026-05-21"
}
```

### Markdown Derivative Generation

```typescript
function generateTaskMarkdown(taskJson: TaskJson): string {
  // Generates human-readable task.md from JSON
  // Using rustdoc/pydoc-like conventions for code documentation
}
```

## Auto-Switch Flow

```
User: /plan "Сделать систему аутентификации"
  │
  ▼
[PLAN MODE]
  ├── Брейншторм требований
  ├── create_task → knowledge/tasks/TASK-2026-0002-auth/task.json
  ├── create_plan → knowledge/tasks/TASK-2026-0002-auth/plan.json
  ├── add_invariant (INV-1, INV-2...)
  ├── add_delivery_unit (DU-1, DU-2)
  └── finalize_plan
        │
        ▼
[AGENT MODE — auto-switch]
  ├── System prompt: agent mode + task context
  ├── sendUserMessage: "Задача TASK-2026-0002-auth сформулирована. Начинаю работу."
  ├── Widget updates: [AGENT] TASK-2026-0002-auth
  └── Agent begins coding according to plan.json
```

## Интеграция с task-centric-knowledge concepts

Extension реализует концепции task-centric-knowledge, но в формате pi extension:

| TCK Concept | Pi Extension Implementation |
|-------------|---------------------------|
| Task Core (task.md) | `task.json` + `read_task` tool |
| Plan (plan.md) | `plan.json` + `create_plan` tool |
| SDD (sdd.md) | `sdd.json` + `create_sdd` tool |
| Delivery Units | `add_delivery_unit` + `update_task_status` |
| Verification Matrix | `run_verification` tool |
| Task Routing | Heuristic `input` event + explicit `/plan` `/agent` commands |
| Registry | `knowledge/tasks/registry.json` (auto-sync by extension) |
| Upgrade Governance | Extension version check + migration notes in knowledge/ |

## Преимущества перед standalone plan mode

| Standalone Plan Mode (другие агенты) | aide as Pi Extension |
|--------------------------------------|---------------------|
| Отдельный инструмент, отдельный контекст | Та же сессия, тот же агент |
| План генерируется внешне, потом "переносится" | План = артефакты в knowledge/, доступны сразу |
| Несовместимые форматы между планировщиком и исполнителем | Единый JSON schema, единые tools |
| Разрыв контекста: планировщик не знает codebase | Агент видит codebase через pi context files |
| Operator переключается между инструментами | Единый интерфейс pi + aide commands |

## MVP Scope

Для первой версии (DU-1 реализация):
1. `/plan` command — вход в plan mode
2. `create_task` tool — создание task.json
3. `create_plan` tool — создание plan.json
4. `finalize_plan` tool — авто-переключение в agent mode
5. `read_task` tool — чтение артефактов
6. Status widget — показывает текущий mode и task
7. JSON → Markdown generator (basic)

## Tech Stack

- TypeScript (pi extension via jiti)
- `@earendil-works/pi-coding-agent` — ExtensionAPI, events
- `typebox` — schema для tool parameters
- Node.js built-ins: `fs`, `path` для knowledge I/O
- Optional: `zod` для runtime validation JSON schemas
