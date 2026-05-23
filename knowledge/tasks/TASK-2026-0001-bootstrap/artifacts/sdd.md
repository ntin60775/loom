# SDD: Ядро системы loom

## Статус и границы

- **Документ**: Software Design Document для задачи TASK-2026-0001-bootstrap
- **Статус**: final (архитектурные решения зафиксированы после 4 итераций обсуждения)
- **Заменяет**: `analysis-approaches.md`, `pi-extension-design.md`, `analysis-stratum-v2.md`, `loom-git-flow-design.md` — предыдущие артефакты считать историческими, не противоречащими
- **Source of truth**: этот документ — канонический

## 1. Контекст и цель

### Что такое loom

**loom** — это AI-Native Development Environment, реализованный как pi extension. Система из намерений и спеков плетёт продукт (метафора ткацкого станка).

### Ключевые факты

- **Не standalone** — pi extension, один агент, две роли в рамках одной сессии
- **Гибридный подход** — наследует концепции task-centric-knowledge, переписывает форматы под AI-native
- **Агент — исполнитель, оператор — пилот** — оператор задаёт намерение и принимает ключевые решения, агент всё реализует

### Целевая аудитория форматов

| Слой | Аудитория | Формат |
|------|-----------|--------|
| knowledge/ | Агент (primary) | JSON (machine-readable) |
| knowledge/ | Оператор (derivative) | Markdown (генерируется) |
| AGENTS.md | Pi (entry point) | Минимальный, только routing + project identity |
| Code comments | Агент | Machine markers: INVARIANT, CONTRACT, AGENT_NOTE |

## 2. Архитектурные инварианты

| ID | Инвариант | Проверка |
|----|-----------|----------|
| INV-1 | AI-First: JSON primary, markdown derivative | Все knowledge/ файлы валидны по JSON schema |
| INV-2 | Stack-Agnostic: система не знает о языке/фреймворке | Ни одного `if (language === "rust")` в коде extension |
| INV-3 | Legacy/Greenfield parity: onboarding работает в пустом и непустом проекте | Scout subagent + migration анализ |
| INV-4 | Task-Centric накопление: каждая задача = атом, знания наследуются | task.json валиден, registry обновлён |
| INV-5 | Operator слои: read-only TUI, docs-as-code | TUI widget не позволяет редактировать код |
| INV-6 | Детерминированный контекст: нет неявного состояния | Subagents используют чистые сессии, не наследуют контекст |
| INV-7 | Pi-Native: extension, не standalone tool | Весь код в `.pi/extensions/loom/` |
| INV-8 | Git-based review: reviewer анализирует артефакты, не сессию | Review artefact ссылается на git commit |
| INV-9 | Executor не пишет код: только оркестрирует worker + reviewer | Executor tools: spawn_worker, spawn_reviewer, git_commit, update_status. НЕТ write/edit в executor tools |
| INV-10 | Модели конфигурируются: не хардкод | `subagent-config.json`, `execution-config.json` |
| INV-11 | Исполнение строго последовательное: шаг N → worker → reviewer → шаг N+1. Никаких параллельных workers | Executor loop не умеет spawn >1 worker одновременно |

## 3. Компонентная модель

### 3.1 Pi Extension

```
.pi/extensions/loom/
├── index.ts                     # Entry: events, commands, flags, state init
├── plan-mode/
│   ├── orchestrator-prompt.ts   # System prompt для plan mode
│   └── plan-tools.ts            # create_task, create_plan, finalize_plan, spawn_subagent
├── agent-mode/
│   ├── executor-prompt.ts       # System prompt для agent mode
│   ├── executor-loop.ts         # Цикл: step → worker → review → decision
│   └── agent-tools.ts           # spawn_worker, spawn_reviewer, git_commit, update_status
├── subagent/
│   ├── spawner.ts               # tmux window + pi spawn logic
│   ├── specs.ts                 # WorkerSpec, ReviewerSpec, ScoutSpec types
│   ├── progress.ts              # Progress polling из progress.json
│   └── prompts/                 # Стартовые промпты для ролей
│       ├── scout.md
│       ├── worker.md
│       └── reviewer.md
├── knowledge/
│   ├── io.ts                    # JSON read/write, markdown generator
│   ├── schemas.ts               # TypeBox schemas для всех knowledge/ JSON
│   └── onboarding.ts            # Init pipeline: scout + research + migration
├── ui/
│   ├── mode-widget.ts           # [PLAN] / [AGENT] status
│   ├── task-widget.ts           # Текущая задача, steps, progress
│   └── subagent-widget.ts       # Список запущенных subagents (фаза 2)
└── package.json
```

### 3.2 Компоненты и их ответственность

| Компонент | Владеет | Не владеет |
|-----------|---------|------------|
| **Orchestrator (Plan Mode)** | Формулировка задачи, брейншторм, артефакты (task/plan/sdd.json) | Кодом, исполнением |
| **Executor (Agent Mode)** | Цикл исполнения: worker → review → decision | Написанием кода (это worker) |
| **Spawner** | Запуск pi в tmux, progress monitoring, timeout | Бизнес-логикой subagent |
| **Worker Subagent** | Один шаг плана: код/исследование/доку. Универсальный runtime, доменная специализация через prompt + модель от оркестратора | Архитектурными решениями, выбором модели |
| **Reviewer Subagent** | Проверка результата worker по инвариантам и правилам. Универсальный runtime, доменная специализация через prompt + модель от оркестратора | Исправлениями (это worker), выбором модели |
| **Knowledge I/O** | JSON ↔ Markdown, schema validation | Бизнес-логикой |

## 4. Модель данных (JSON Schemas)

### 4.1 Задача (task.json)

```typescript
interface Task {
  task_id: string;               // "TASK-2026-0001-bootstrap"
  slug: string;                  // "bootstrap"
  title: Localized;              // {ru: "..."}
  description: Localized;        // {ru: "..."}
  status: "черновик" | "готова" | "в_работе" | "на_проверке" | "ждёт_пользователя" | "заблокирована" | "завершена" | "отменена";
  priority: "critical" | "high" | "medium" | "low";
  branch: string;                // "task/task-2026-0001-bootstrap"
  invariants: Invariant[];
  delivery_units: DeliveryUnit[];
  created_at: string;
  updated_at: string;
}

interface Invariant {
  id: string;                    // "INV-1"
  text: string;                  // "AI-First: JSON primary, markdown derivative"
  marker: string;                // "INVARIANT: JSON must be primary format"
  status: "defined" | "verified" | "violated";
  verification_method?: string;  // Как проверить инвариант
}

interface DeliveryUnit {
  id: string;                    // "DU-1"
  status: "planned" | "local" | "draft" | "review" | "merged" | "closed";
  purpose: string;
  base_branch: string;           // "main"
}

interface Localized {
  ru: string;
}
```

### 4.2 План (plan.json)

```typescript
interface Plan {
  task_id: string;
  steps: PlanStep[];
  risks: Risk[];
  checkpoints: Checkpoint[];
  created_at: string;
  updated_at: string;
}

interface PlanStep {
  step_number: number;
  title: Localized;              // {ru: "..."}
  description: Localized;        // {ru: "..."}
  expected_output: string;       // Что должно получиться
  constraints: string[];         // Инварианты и правила, применимые к шагу
  depends_on: number[];          // Номера шагов, от которых зависит
  estimated_effort: string;      // "small" | "medium" | "large"
  status: "pending" | "in_progress" | "done" | "blocked";
}

interface Risk {
  id: string;
  description: string;
  severity: "high" | "medium" | "low";
  mitigation: string;
}

interface Checkpoint {
  id: string;
  description: string;
  after_step: number;
  verification: string;
}
```

### 4.3 Правило проекта (project rule)

```typescript
interface ProjectRule {
  id: string;                    // "RULE-2026-0001-naming-functions"
  category: "naming" | "error-handling" | "testing" | "api-design" | "dependencies" | "style" | "security" | "performance" | "documentation" | "git" | "other";
  title: string;
  body: string;                  // Полный текст. Machine markers допустимы.
  scope: string[];               // ["backend", "frontend", "1c", "infra"]
  source: {
    type: "operator" | "auto-extracted" | "agent-decision" | "migration";
    ref: string;                 // TASK-ID или commit или "onboarding"
    confidence?: number;         // 0-1 для auto-extracted
  };
  status: "proposed" | "active" | "deprecated" | "rejected";
  evidence: string[];            // Ссылки на код или задачи
  created_at: string;
  updated_at: string;
  version: number;
}
```

**Хранение:** `knowledge/project/rules/RULE-XXXX.json`

### 4.4 Архитектурный компонент

```typescript
interface ArchitectureComponent {
  id: string;                    // "COMP-auth"
  name: {ru: string};
  layer: "domain" | "application" | "infrastructure" | "presentation" | "external";
  responsibilities: string[];
  interfaces: ComponentInterface[];
  dependencies: string[];        // ID других компонентов
  files: string[];               // Ключевые файлы
  invariants: string[];
  status: "discovered" | "verified" | "deprecated";
  source: {
    type: "auto-detected" | "agent-documented" | "operator-defined";
    ref: string;
  };
}

interface ComponentInterface {
  name: string;
  type: "api" | "event" | "db" | "file" | "cli";
  contract: string;
  consumers: string[];
}
```

**Хранение:** `knowledge/project/architecture/components/COMP-XXXX.json`

### 4.5 Review (review.json)

```typescript
interface Review {
  review_id: string;             // "REV-2026-0002-step-3-iter-1"
  target: {
    type: "git-commit" | "artifact-file";
    commit?: string;             // git commit hash
    file?: string;               // путь к артефакту
    task_id: string;
  };
  verdict: "approve" | "reject";
  criteria_checks: CriterionCheck[];
  general_comments: string[];
  corrections: CorrectionItem[];
  confidence: number;
  reviewer_model: string;        // "deepseek/deepseek-chat:xhigh"
  created_at: string;
}

interface CriterionCheck {
  criterion: string;             // "INV-3: Legacy compatibility"
  status: "pass" | "fail" | "partial";
  comment: string;
}

interface CorrectionItem {
  file: string;
  description: string;
}
```

**Хранение:** `knowledge/tasks/TASK-XXXX/reviews/REV-XXXX.json`

### 4.6 Subagent спецификация

```typescript
interface SubagentSpec {
  id: string;                    // "SUB-2026-0001"
  role: "scout" | "worker" | "reviewer";
  model: ModelConfig;
  systemPrompt: string;          // Формируется оркестратором
  skills: string[];              // Какие skills загрузить (опционально)
  tools: string[];               // Доступные tools: read, bash, write, edit
  inputArtifact: string;          // JSON файл с заданием
  outputArtifact: string;         // JSON файл с результатом
  auditArtifact: string;          // JSON файл с audit trail
  progressArtifact: string;       // JSON файл с прогрессом
  timeout: number;               // секунд
  maxTokens?: number;
  cwd: string;                   // рабочий каталог
}

interface ModelConfig {
  provider: string;              // "deepseek", "kimi", "anthropic"
  model: string;                 // "deepseek-chat", "kimi-for-coding"
  thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}
```

### 4.7 Конфигурации

**subagent-config.json** — маппинг доменов на модели:
```json
{
  "domains": {
    "1c": {"provider": "kimi", "model": "kimi-for-coding", "thinking": "high"},
    "general": {"provider": "deepseek", "model": "deepseek-chat", "thinking": "medium"}
  },
  "reviewer": {
    "thinking": "xhigh",
    "domain_rules": [
      {"extension": ".bsl", "domain": "1c"},
      {"default": "general"}
    ]
  },
  "worker": {
    "domain_rules": [
      {"extension": ".bsl", "domain": "1c"},
      {"default": "general"}
    ]
  }
}
```

**execution-config.json**:
```json
{
  "review": {
    "enabled": true,
    "max_iterations": 10
  },
  "parallelism": {
    "plan_mode_max_subagents": 4
  },
  "timeout": {
    "worker": 3600,
    "reviewer": 1800,
    "scout": 600
  },
  "session_retention_days": 7,
  "human_in_the_loop": {
    "on_reject_max_iterations": true,
    "on_timeout": true,
    "on_ambiguity": true,
    "on_worker_blocker": true
  }
}
```

## 5. Flow: Plan Mode

### 5.1 Вход

- Команда: `/plan [описание задачи]`
- Эвристика: "спланируй", "обсудим задачу", "брейншторм", "требования"
- Если неоднозначно — спросить оператора: `1 — plan, 2 — agent`

### 5.2 System Prompt

```
Ты в PLAN MODE системы loom. Твоя роль — Chief Architect (главный архитектор).

ЗАДАЧА: Сформулировать задачу и создать артефакты. НЕ ПИШИ КОД. НЕ РЕДАКТИРУЙ ФАЙЛЫ ПРОЕКТА (кроме knowledge/).

ДОСТУПНЫЕ ИНСТРУМЕНТЫ:
- create_task: создать task.json
- create_plan: создать plan.json
- spawn_subagent: запустить субагента (scout, researcher, architect) для исследования
- add_invariant: добавить инвариант к задаче
- add_delivery_unit: добавить delivery unit
- finalize_plan: завершить планирование и переключиться в agent mode

ПОРЯДОК:
1. Брейншторм с оператором: уточнить цель, границы, приоритеты.
2. Если нужно исследовать codebase — spawn scout subagent (он запустится в отдельной вкладке tmux).
3. Если нужны внешние исследования — spawn researcher.
4. Создать task.json (create_task) когда требования ясны.
5. Создать plan.json (create_plan) с разбивкой на шаги.
6. Вызвать finalize_plan когда оператор подтвердит готовность.

ПРАВИЛА:
- Не пиши код.
- Если неясность — спроси оператора (варианты 1/2/3).
- Subagents запускаются в tmux-вкладках, ты увидишь их вывод в соответствующих окнах.
- Артефакты хранятся в knowledge/tasks/TASK-XXXX/
```

### 5.3 Инструменты Plan Mode

| Tool | Назначение |
|------|-----------|
| `create_task` | Создать `knowledge/tasks/TASK-XXXX/task.json` |
| `create_plan` | Создать `knowledge/tasks/TASK-XXXX/plan.json` |
| `add_invariant` | Добавить инвариант в task.json |
| `add_delivery_unit` | Добавить delivery unit в task.json |
| `spawn_subagent` | Запустить субагента (scout/researcher/architect) в tmux |
| `finalize_plan` | Сохранить артефакты, предложить чистую сессию для agent mode |

### 5.4 Параллельные субагенты в Plan Mode

Оркестратор может запустить до 4 субагентов параллельно:
- Scout 1: исследует модуль A
- Scout 2: исследует модуль B
- Researcher: исследует внешний контекст
- Architect: проектирует решение

Каждый — в своей tmux-вкладке. Результаты — файлы в knowledge/. Оркестратор читает их и агрегирует.

### 5.5 Выход: finalize_plan

1. Сохраняет все артефакты
2. Генерирует markdown derivatives
3. Обновляет registry.json
4. Предлагает:
   ```
   [loom] План готов. Начать исполнение в чистой сессии?
   1 — Да, новая сессия с контекстом задачи
   2 — Продолжить в текущей сессии
   3 — Сначала показать план
   ```
5. При выборе 1: `ctx.newSession()` → Agent Mode

## 6. Flow: Agent Mode

### 6.1 Вход

- Из plan mode через `finalize_plan`
- Команда: `/agent` или `/work`
- Эвристика: "сделай", "реализуй", "напиши код", "исправь"

### 6.2 System Prompt

```
Ты в AGENT MODE системы loom. Твоя роль — Executor (оркестратор-приёмщик).

ЗАДАЧА: {task.title}
КОНТЕКСТ ЗАДАЧИ: {task.description}
ИНВАРИАНТЫ: {task.invariants}
ПЛАН: {plan.steps}
ПРАВИЛА ПРОЕКТА: {relevant_rules}

ДОСТУПНЫЕ ИНСТРУМЕНТЫ:
- spawn_worker: запустить worker subagent для выполнения шага плана
- spawn_reviewer: запустить reviewer subagent для проверки результата
- update_task_status: обновить статус задачи/delivery unit
- read_artifact: прочитать knowledge/ артефакт

ТЫ НЕ ПИШЕШЬ КОД. ТЫ НЕ РЕДАКТИРУЕШЬ ФАЙЛЫ (кроме knowledge/).
Твоя задача — оркестрировать worker и reviewer.

ЦИКЛ ИСПОЛНЕНИЯ (для каждого шага плана):
1. Сформировать WorkerSpec: что делать, какие инварианты соблюдать.
2. spawn_worker → worker выполнит шаг в tmux-вкладке.
3. Дождаться worker (он сделает git commit).
4. Сформировать ReviewerSpec: что проверять, по каким критериям.
5. spawn_reviewer → reviewer проверит результат в tmux-вкладке.
6. Прочитать review:
   - approve → update_status, следующий шаг (worker уже сделал commit)
   - reject → сформировать коррекцию → spawn_worker (итерация +1)
   - max_iterations (10) → СТОП, спросить оператора

КОГДА ОСТАНОВИТЬСЯ И СПРОСИТЬ ОПЕРАТОРА:
- Worker/reviewer timeout
- Reviewer reject + max_iterations достигнут
- Неоднозначность в review
- Worker не может выполнить шаг (блокер)
Во всех остальных случаях действуй автономно.
```

### 6.3 Инструменты Agent Mode

| Tool | Назначение |
|------|-----------|
| `spawn_worker` | Запустить worker subagent для одного шага плана |
| `spawn_reviewer` | Запустить reviewer subagent для проверки коммита |
| `update_task_status` | Обновить статус задачи или delivery unit |
| `read_artifact` | Прочитать любой knowledge/ артефакт |

**Важно:** Worker делает `git add -A && git commit` самостоятельно. Executor НЕ делает commit за worker. Executor только читает summary.json с commit-hash.

### 6.4 Цикл: worker → review → decision

```
Executor читает plan.json → шаг N
│
├─► [iter=1] spawn_worker (WorkerSpec со step-N)
│   └─► Worker в tmux: пишет код/артефакт → git add -A && git commit → summary.json
│   └─► Worker владеет первичным коммитом своих изменений
│
├─► Executor читает summary.json
├─► Выбирает reviewer (по расширениям файлов из config)
│
├─► [iter=1] spawn_reviewer (ReviewerSpec: commit, criteria)
│   └─► Reviewer в tmux: git show → read → review.json
│
├─► Executor читает review.json
│   ├─► verdict=approve → update_status → step N+1
│   └─► verdict=reject → формирует CorrectionSpec → iter=2 → spawn_worker
│
├─► iter > 10? → STOP, ask operator
└─► Все steps done? → verification → operator review
```

### 6.5 Worker Subagent — детали

**Worker — универсальный.** Один runtime, динамическая доменная настройка через оркестратора.

Worker получает через WorkerSpec:
- Описание шага из plan.json
- Ссылки на релевантные инварианты и правила
- Контекст: какие файлы/модули затронуты
- Ожидаемый результат

**Оркестратор формирует специализацию:**
- Определяет домен по затронутым файлам (`.bsl` → 1C, остальное → general)
- Выбирает модель из `subagent-config.json` → `domains[domain]`
- Формирует systemPrompt с доменно-специфичными инструкциями
- Подключает релевантные skills и правила проекта

**Что worker НЕ делает:**
- Не принимает архитектурных решений (это plan mode)
- Не меняет границы задачи (это operator)
- Не выбирает себе модель (это оркестратор)

**Worker:**
- Работает в tmux-вкладке
- Имеет tools: read, bash, write, edit
- Делает task-scoped commit: `git add -A && git commit -m "TASK-XXXX step-N: ..."`
- Пишет `summary.json`:
  ```json
  {
    "commit": "abc1234",
    "files_changed": ["src/auth/jwt.rs", "tests/auth_test.rs"],
    "summary": "Реализован JWT handler с RS256",
    "status": "done"
  }
  ```
- Пишет `audit.json` (structured audit trail)

### 6.6 Reviewer Subagent — детали

**Reviewer — универсальный.** Тот же runtime, что у worker. Специализация через prompt и модель.

Reviewer получает через ReviewerSpec:
- Git commit hash для анализа
- Список критериев (инварианты + правила + план)
- Контекст задачи (task.json)
- Домен (определяется оркестратором по затронутым файлам)

Reviewer:
- Работает в tmux-вкладке
- Делает: `git show <commit>` → анализирует diff
- Читает затронутые файлы через `read`
- Сравнивает с критериями
- Пишет `review.json` (формат в разделе 4.5)

### 6.7 Авто-выбор модели по домену

Оркестратор определяет домен по расширениям затронутых файлов и выбирает модель из `subagent-config.json`:
```
.bsl → domain "1c" → kimi/kimi-for-coding:thinking
* → domain "general" → deepseek/deepseek-chat:thinking
```

Домен влияет на:
- **Модель** (provider + model + thinking)
- **System prompt** (доменно-специфичные инструкции: синтаксис, конвенции платформы)
- **Skills** (1С: специфичные навыки, general: общие)

Остальное (runtime, tools, output формат) — одинаково для всех доменов.

## 7. Flow: Onboarding (инициализация в непустом проекте)

### 7.1 Триггер

- Команда: `/loom-init`
- Эвристика: "инициализируй loom", "настрой loom для проекта"
- Авто-определение: первый запуск extension в репозитории без `knowledge/`

### 7.2 Pipeline

```
Оператор: /loom-init
│
├─► Шаг 0: Pre-check
│   - Есть ли git repo?
│   - Есть ли AGENTS.md?
│   - Есть ли knowledge/?
│   - Классификация: clean / partial / foreign_system / mixed_system
│
├─► Шаг 1: Анализ AGENTS.md (если есть)
│   - Классифицировать содержимое: identity, conventions, rules, commands
│   - Извлечь project identity (название, стек если указан)
│   - Извлечь conventions (правила)
│   - Сохранить в knowledge/project/rules/ как RULE-XXXX-onboarding-*
│
├─► Шаг 2: Кодовая археология (scout subagent, tmux)
│   - Определить стек: package.json, Cargo.toml, requirements.txt, ...
│   - Построить базовую module map
│   - Найти entry points и critical paths
│   - Выявить implicit conventions (naming, patterns)
│   - Output: knowledge/project/stack.json, knowledge/modules/
│
├─► Шаг 3: Исследование контекста (research subagent, tmux)
│   - README.md, CONTRIBUTING.md
│   - CI/CD конфиги
│   - Внешняя документация
│   - Output: knowledge/project/context-research.json
│
├─► Шаг 4: Миграция старой системы (migration subagent, если foreign_system)
│   - Анализ .sisyphus/, doc/tasks/, docs/plans/, etc.
│   - Классификация: что мигрировать, что оставить
│   - Output: knowledge/project/migration-analysis.json
│
├─► Шаг 5: Начальные правила (из авто-экстракции)
│   - На основе найденных конвенций предложить правила
│   - Статус: proposed → operator review
│   - Output: knowledge/project/rules/RULE-XXXX-onboarding-*.json
│
├─► Шаг 6: Генерация AGENTS.md (минимальный entry-point)
│   - Routing: текущий режим, где искать knowledge/
│   - Project identity: название, стек
│   - Без правил, архитектуры, конвенций — они в knowledge/
│
├─► Шаг 7: Сводка для operator review
│   - Что найдено
│   - Предложенные правила (proposed)
│   - Структура проекта
│   - Operator: approve / edit / skip
│
└─► Шаг 8: Фиксация
    - Оператор подтверждает
    - git commit с onboarding-изменениями
```

### 7.3 AGENTS.md после инициализации (минимальный)

```markdown
# AGENTS.md — Entry Point для loom

## Project
- Название: {project_name}
- Стек: {stack}
- loom: active

## Routing
- Текущий режим: /plan или /agent
- Текущая задача: см. knowledge/tasks/registry.json
- Полный контекст: knowledge/
- Правила: knowledge/project/rules/
- Архитектура: knowledge/project/architecture/

## Важно
Этот файл минимален. Все правила, архитектура, история задач — в knowledge/.
Не добавляй сюда ничего без команды оператора.
```

### 7.4 Миграция с task-centric-knowledge

**Контекст.** `task-centric-knowledge` (TCK) — это skill, на чьих концепциях построен loom. Проекты, уже использующие TCK, должны мигрировать на loom без потери данных. Форматы TCK известны, поэтому миграция детерминирована, не требует «угадывания».

#### 7.4.1 Что мигрируем

| Артефакт TCK | Формат TCK | Куда в loom | Как |
|-------------|-----------|------------|-----|
| `AGENTS.md` (managed-блок TCK) | Markdown между `⟦⟦BEGIN_TASK_KNOWLEDGE_SYSTEM⟧⟧` | `AGENTS.md` (loom entry-point) | Извлечь identity/conventions → правила. Заменить managed-блок на loom-формат |
| `knowledge/tasks/TASK-XXXX/task.md` | Markdown с полями | `task.json` | Распарсить поля: TASK-ID, Краткое имя, Статус, Ветка. Инварианты → массив. DU → delivery_units |
| `knowledge/tasks/TASK-XXXX/plan.md` | Markdown список шагов | `plan.json` | Распарсить шаги → steps[]. Риски → risks[] |
| `knowledge/tasks/TASK-XXXX/sdd.md` | Markdown инварианты | `sdd.json` | Инварианты → invariant_set. Архитектурные решения → отдельно |
| `knowledge/tasks/registry.md` | Markdown таблица | `registry.json` | Распарсить строки таблицы → tasks[] |
| `knowledge/tasks/_templates/` | Шаблоны markdown | Удалить | loom использует JSON schemas, не markdown шаблоны |
| `artifacts/verification-matrix.md` | Markdown | `artifacts/verification-matrix.json` | Распарсить строки матрицы |
| `worklog.md`, `decisions.md`, `handoff.md` | Markdown | `worklog.json`, `decisions.json`, `handoff.json` | Перенести как есть + структурировать |

**Маппинг статусов TCK → loom:**

| Статус TCK | Статус loom |
|-----------|-------------|
| `черновик` | `черновик` |
| `готова к работе` | `готова` |
| `в работе` | `в_работе` |
| `на проверке` | `на_проверке` |
| `ждёт пользователя` | `ждёт_пользователя` |
| `заблокирована` | `заблокирована` |
| `завершена` | `завершена` |
| `отменена` | `отменена` |

#### 7.4.2 Что НЕ мигрируем (удаляется после верификации)

- `⟦⟦BEGIN/END_TASK_KNOWLEDGE_SYSTEM⟧⟧` маркеры — заменяются на loom-совместимый AGENTS.md
- Managed-блок TCK — заменяется на loom entry-point (раздел 7.3)
- `AGENTS.task-centric-knowledge.<profile>.md` — удаляется
- `knowledge/MIGRATION-SUGGESTION.md` — удаляется
- Все сконвертированные `.md` файлы задач — удаляются после успешной верификации
- `_templates/` — удаляется

#### 7.4.3 Pipeline миграции

```
Оператор: /loom-init (обнаружен TCK managed-блок)
│
├─► Шаг 0: Классификация → "compatible" (TCK обнаружен)
│
├─► Шаг 1: Извлечение из AGENTS.md
│   - Найти managed-блок ⟦⟦BEGIN_TASK_KNOWLEDGE_SYSTEM⟧⟧
│   - Извлечь project identity, conventions, rules
│   - Создать RULE-XXXX-tck-migration-*.json в proposed
│
├─► Шаг 2: Миграция задач (migration subagent, tmux)
│   - Прочитать registry.md → список задач
│   - Для каждой задачи:
│     - Распарсить task.md → task.json
│     - Распарсить plan.md → plan.json
│     - Распарсить sdd.md → sdd.json (если есть)
│     - Распарсить worklog/decisions → соответствующие JSON
│   - Вывод: список сконвертированных задач + предупреждения
│
├─► Шаг 3: Миграция реестра
│   - Распарсить registry.md → registry.json
│
├─► Шаг 4: Верификация (reviewer subagent, tmux)
│   - Для каждой задачи: сравнить ключевые поля .md ↔ .json
│   - Проверить: все TASK-ID на месте, статусы корректны, инварианты не потеряны
│   - Проверить: registry.json содержит все задачи из registry.md
│   - Результат: verification_report.json
│   - Если есть расхождения → STOP, показать оператору
│
├─► Шаг 5: Очистка TCK
│   - Если verification_report.status = "ok":
│     - Удалить managed-блок из AGENTS.md
│     - Удалить _templates/
│     - Удалить AGENTS.task-centric-knowledge.*.md
│     - Удалить MIGRATION-SUGGESTION.md
│     - Удалить все сконвертированные .md файлы задач
│       (task.md, plan.md, sdd.md, worklog.md, decisions.md, handoff.md, registry.md)
│   - Если verification_report.status = "issues":
│     - STOP, показать оператору расхождения
│
├─► Шаг 6: Генерация loom AGENTS.md
│   - На основе извлечённых данных + раздел 7.3
│
├─► Шаг 7: Сводка для operator review
│   - Сколько задач сконвертировано
│   - Какие правила извлечены
│   - Результат верификации
│   - Что будет/было удалено
│   - Operator: approve / edit / cancel
│
└─► Шаг 8: Фиксация
    - git commit с migration-изменениями (новые .json + удалённые .md)
```

#### 7.4.4 Пример конвертации: task.md → task.json

**Было (TCK):**
```markdown
# TASK-2026-0001-bootstrap

## Сводка
- **TASK-ID**: TASK-2026-0001-bootstrap
- **Краткое имя**: bootstrap
- **Статус**: active
- **Ветка**: task/TASK-2026-0001-bootstrap

## Инварианты задачи
### INV-1: AI-First спецификация
Все спецификации оптимизированы для LLM...
```

**Стало (loom):**
```json
{
  "task_id": "TASK-2026-0001-bootstrap",
  "slug": "bootstrap",
  "title": {"ru": "bootstrap"},
  "status": "в_работе",
  "branch": "task/task-2026-0001-bootstrap",
  "invariants": [
    {
      "id": "INV-1",
      "text": "AI-First: все спецификации оптимизированы для LLM",
      "marker": "INVARIANT: JSON must be primary format",
      "status": "defined"
    }
  ]
}
```

#### 7.4.5 Откат миграции

- Все изменения — в git-коммите миграции
- Откат: `git revert <migration-commit>`
- Старые .md файлы НЕ сохраняются — агент удаляет их после успешной верификации
- Если верификация нашла проблемы — старые файлы не тронуты, оператор принимает решение

```
knowledge/
├── tasks/
│   ├── TASK-2026-0001-bootstrap/
│   │   ├── task.json              # Задача (primary)
│   │   ├── task.md                # Задача (derivative, сгенерирован)
│   │   ├── plan.json              # План
│   │   ├── plan.md                # План (derivative)
│   │   ├── sdd.json               # Software Design Document
│   │   ├── sdd.md                 # SDD (derivative)
│   │   ├── worklog.json           # Рабочий журнал
│   │   ├── decisions.json         # Решения
│   │   ├── artifacts/             # Доказательные артефакты
│   │   │   ├── sdd.md             # Этот SDD
│   │   │   ├── analysis-*.md      # Исторические анализы
│   │   │   └── verification-matrix.json
│   │   ├── reviews/               # Git-based review артефакты
│   │   │   ├── REV-XXXX-step-1-iter-1.json
│   │   │   └── REV-XXXX-step-1-iter-2.json
│   │   └── subagents/             # Артефакты субагентов
│   │       ├── SUB-XXXX-scout-audit.json
│   │       ├── SUB-XXXX-scout-output.json
│   │       └── progress/           # Файлы прогресса
│   └── registry.json              # Реестр задач (навигационный кэш)
├── modules/                        # Модули проекта (scout output)
│   ├── mod-auth.json
│   ├── mod-db.json
│   └── registry.json
├── project/
│   ├── rules/                      # Правила по темам
│   │   ├── RULE-2026-0001-naming-functions.json
│   │   └── _proposed/              # Предложенные, ждут подтверждения
│   ├── architecture/
│   │   ├── overview.json
│   │   └── components/
│   │       ├── COMP-auth.json
│   │       └── registry.json
│   ├── stack.json                  # Auto-detected стек
│   ├── decisions.json              # Architecture Decision Records
│   ├── execution-config.json       # Конфиг исполнения
│   ├── subagent-config.json        # Конфиг моделей субагентов
│   └── conventions.json            # Извлечённые конвенции
└── operations/
    ├── loom-version.json           # Версия loom
    └── loom-upgrade.json           # История обновлений
```

## 9. Git Flow

### 9.1 Ветки

- `main` — базовая ветка
- `task/<task-id-lower>-<slug>` — рабочая ветка задачи
- `du/<task-id-lower>-uNN-<slug>` — ветка delivery unit

### 9.2 Коммиты

Worker делает task-scoped commits:
```
TASK-2026-0002 step-3: реализовать JWT handler

- Добавлена валидация JWT с RS256
- Добавлен эндпоинт обновления токена

INVARIANT: Legacy token format preserved
RULE-0005: All errors wrapped in Result
```

### 9.3 Review flow через git

1. Worker: `git add -A && git commit`
2. Reviewer: `git show <commit>` → анализ diff → `review.json`
3. Executor: читает `review.json` → approve → `git commit` (если amend/rebase), или reject → correction
4. Все review артефакты — в `knowledge/tasks/TASK-XXXX/reviews/`

### 9.4 Finalize задачи

```bash
# После всех steps:
git log --oneline task/TASK-XXXX
# Verification matrix
git diff main...task/TASK-XXXX --stat
# update_task_status → "на_проверке"
```

## 10. UI

### 10.1 Фаза 1 (MVP): tmux windows + базовый widget

**Tmux windows для субагентов:**
```bash
tmux new-window -n "loom:scout" "pi --no-context-files ..."
tmux new-window -n "loom:worker-1" "pi ..."
tmux new-window -n "loom:review-1" "pi ..."
```

Operator видит в tmux status bar и переключается `Ctrl+B + N`.

**Status widget в pi:**
```
loom: [PLAN] TASK-2026-0001-bootstrap
```

**Task widget (Custom TUI):**
```
┌─ Task: TASK-2026-0001-bootstrap ──┐
│ Step: 2/5 | Iter: 1/10            │
│ [✓] Step 1: Analyze approach      │
│ [→] Step 2: Design core           │
│ Worker: SUB-004 (running, 5m)     │
└───────────────────────────────────┘
```

### 10.2 Фаза 2: полный TUI

- Subagent widget: список всех запущенных, статусы
- `/subagents` — показать/скрыть widget
- `/subagent-focus <id>` — переключиться в tmux окно
- `/subagent-kill <id>` — остановить

## 11. Команды extension

| Команда | Режим | Описание |
|---------|-------|----------|
| `/plan [desc]` | Any | Вход в plan mode |
| `/agent` | Any | Вход в agent mode |
| `/loom-init` | Any | Инициализация loom в проекте |
| `/task-status` | Agent | Показать статус текущей задачи |
| `/task-show [id]` | Any | Показать задачу |
| `/rule-add <cat> <title>` | Any | Добавить правило проекта |
| `/rule-list [cat]` | Any | Список правил |
| `/subagents` | Agent | Показать список субагентов |
| `/plan-review` | Plan | Показать план для ревью оператором |

## 12. State Management в extension

```typescript
interface LoomState {
  mode: "plan" | "agent" | "idle";
  currentTaskId?: string;
  currentTaskDir?: string;
  planSubagents: string[];          // ID запущенных subagents в plan mode
  agentSubagents: string[];         // ID запущенных subagents в agent mode
  onboarding: {
    inProgress: boolean;
    step: number;
    artifacts: string[];
  };
}
```

Persist через `pi.appendEntry("loom-state", state)`.
Restore при `session_start` через чтение `sessionManager.getEntries()`.

## 13. MVP Scope и Delivery Units

### DU-1: Core — Plan Mode + базовые артефакты

- `/plan` command
- Plan mode system prompt
- `create_task`, `create_plan`, `finalize_plan` tools
- JSON → markdown генератор
- Status widget: [PLAN] / [AGENT]
- `task.json`, `plan.json` schemas

### DU-2: Agent Mode + Git-based review

- Agent mode system prompt
- `spawn_worker`, `spawn_reviewer` tools
- Subagent spawner (tmux windows)
- Git-based review flow: worker commit → reviewer → review.json
- Executor loop: approve/reject с max_iterations
- `update_task_status`, `git_commit` tools
- Progress polling

### DU-3: Onboarding + Knowledge accumulation

- `/loom-init` command
- Scout subagent (codebase exploration)
- Research subagent (context analysis)
- Migration subagent (foreign system detection)
- Rules catalog: `/rule-add`, `/rule-list`, авто-экстракция
- Architecture catalog
- `AGENTS.md` minimal entry-point generator

### DU-4: Polish

- TUI widgets: task, subagents
- Russian localization
- Reviewer model auto-selection
- Subagent config editor
- Verification matrix integration: автоматическая проверка инвариантов после завершения всех шагов.
  Executor читает `task.json` → `invariants[]` → для каждого со статусом `defined` запускает проверку:
  - Инварианты кода: reviewer subagent с критериями из инвариантов
  - Инварианты архитектуры: сравнение с `knowledge/project/architecture/`
  - Инварианты процесса: проверка `worklog.json`, `reviews/`, `registry.json`
  - Результат: `artifacts/verification-matrix.json` со статусом каждого инварианта (`verified` / `violated`)
  - При `violated` → STOP, оператор решает

## 14. Технологический стек

- **Runtime**: pi extension (TypeScript, jiti)
- **Schemas**: TypeBox (`@earendil-works/pi-coding-agent`, `typebox`)
- **Subagent runner**: tmux + pi CLI
- **Knowledge I/O**: Node.js `fs`, `path`
- **Markdown generation**: Шаблоны (не шаблонизатор, просто string replace)
- **Validation**: JSON Schema validation при чтении knowledge/ файлов

## 15. Зависимости от task-centric-knowledge

Loom наследует концепции, но не код:

| Концепция TCK | Как реализовано в loom |
|---------------|----------------------|
| Task Core (task.md) | task.json (JSON primary) |
| Plan (plan.md) | plan.json |
| SDD (sdd.md) | sdd.json |
| Delivery Units | DeliveryUnit в task.json |
| Verification Matrix | verification-matrix.json |
| Registry | registry.json (навигационный кэш) |
| Task Routing | Эвристики + явные /plan, /agent |
| Upgrade Governance | loom-version.json + migration notes |
| Cleanup Plan/Confirm | TCK migration pipeline (раздел 7.4) — cleanup после верификации |
| Read Model | `/task-show`, `/task-status` |
| Profiles (generic, 1c) | Домены в `subagent-config.json`: `.bsl` → 1C (kimi), остальное → general |

**Что loom делает иначе:**
- JSON primary вместо markdown primary
- Git-based review вместо verification matrix ручной
- Subagents через tmux вместо CLI helper
- AGENTS.md минимальный вместо managed-блоков
- Model config вместо хардкод профилей

## 16. Не входит в scope v1 (отложенные когнитивные слои)

### 16.1 Memory layer (session / episodic / semantic / procedural дорожки)

**Что это.** В когнитивных архитектурах для агентов принято разделять память на дорожки:

| Дорожка | Что хранит | Аналог в v1 |
|---------|-----------|-------------|
| **session** | Контекст текущей сессии: что агент делает прямо сейчас, промежуточные выводы | Неявно — контекст pi |
| **episodic** | История действий агента по всем задачам: какие решения принимал, какие ошибки совершал | `worklog.json` — точечно, без кросс-задачного анализа |
| **semantic** | Факты о проекте: архитектура, модули, контракты | `knowledge/project/` — частично |
| **procedural** | Правила и процедуры: conventions, checklists, инварианты | `AGENTS.md` + `rules/` |

**Почему не в v1.** Сейчас v1 хранит всё пассивно — агент читает файлы когда они нужны. Memory layer — это активное управление: система сама решает что запомнить, что забыть, что подсунуть агенту без явного запроса. Это требует ранжирования релевантности, авто-суммаризации, управления retention — сложно сделать правильно без зрелого базового ядра.

**Как в v2.** Агент заходит в задачу, а система уже внедрила в контекст: «Вот 3 похожие задачи, которые ты решал. Вот правило из TASK-0005. Вот модуль, который менялся вчера и может быть затронут.»

### 16.2 Memory retrieval — не эмбеддинги

**Почему не эмбеддинги.** Эмбеддинги — это промежуточный слой между памятью и потребителем (агентом), который:
- Требует модель для генерации векторов
- Требует векторный индекс (перестраивать, поддерживать)
- Добавляет недетерминизм: «похожие» ≠ «релевантные»
- Усложняет отладку: почему система подсунула задачу X, а не Y? В эмбеддингах ответ — «косинус 0.87», в gre — «ты явно искал по ключевым словам»

**Вместо эмбеддингов — scout subagent на поиск.** Тот же универсальный runtime, та же модель, тот же spawner. Специализация через prompt:

```
Ты — scout subagent. Найди в knowledge/ все артефакты, релевантные запросу.

ЗАПРОС: {query}

ИЩИ В:
- knowledge/tasks/*/task.json — заголовки, описания, инварианты
- knowledge/project/rules/*.json — категории, scope
- knowledge/project/architecture/components/*.json — responsibilities, interfaces
- knowledge/modules/*.json — paths, entry points

НАЙДИ ТОП-5. Для каждого — объясни почему релевантен.
```

Преимущества перед эмбеддингами:
- **Явный, аудируемый** — scout объясняет выбор словами, не «косинус 0.87»
- **Не требует инфраструктуры** — только pi + tmux, никаких индексов
- **Использует reasoning модели** — scout на deepseek-reasoner найдёт неочевидные связи лучше, чем любой embedding
- **Контекстно-зависимый** — scout понимает семантику запроса, а не только векторную близость
- **Не нужно поддерживать** — нет индекса, нечего перестраивать

**Когда в v2.** Когда количество артефактов в knowledge/ таково, что даже scout не может прочитать всё за разумное время. Порог: примерно 50+ закрытых задач. До этого — scout справляется.

### 16.3 Параллельные субагенты — только вспомогательные, не workers

**Что уже есть в v1.** В plan mode оркестратор может запустить до 4 вспомогательных субагентов параллельно (scout, researcher, architect). Они не меняют код, только исследуют и производят артефакты.

**Что НЕ входит.** Параллельные workers в фазе исполнения. Исполнение всегда строго последовательное: шаг 1 → worker → reviewer → шаг 2. Это архитектурный инвариант:
- Исключает git conflicts между параллельными workers
- Гарантирует согласованность (каждый следующий worker видит все изменения предыдущих)
- Упрощает review (reviewer видит линейную историю, а не несколько параллельных diff)
- Упрощает откат (каждый шаг — один коммит)

**В v2 не попадёт.** Это не отложенная фича, это осознанное ограничение архитектуры.

### 16.4 Как связаны отложенные слои

```
Memory Layer (v2)
    │ питает фактами и историей
    ▼
Scout Retrieval (v2)
    │ находит релевантные знания для контекста
    ▼
Executor (v1)
    │ строго последовательное исполнение
    ▼
Результат
```
