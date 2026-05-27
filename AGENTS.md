# AGENTS.md — loom

## Проект

- **Название:** loom
- **Стек:** pi extension (TypeScript)
- **Статус:** active

## Маршрутизация

- `/plan [desc]` — вход в Plan Mode (брейншторм, артефакты)
- `/agent` — вход в Agent Mode (исполнение по плану)
- `/loom-init` — инициализация loom в проекте (с onboarding wizard)
- `/task-status` — статус текущей задачи
- `/rule-add` — добавить правило в каталог
- `/rule-list` — список правил проекта
- `/arch-add` — добавить архитектурный компонент
- `/arch-list` — список архитектурных компонентов
- **Шорткат:** `alt+m` — циклическое переключение режимов: idle → plan → agent → idle

## Режимы работы

Подробное описание режимов `idle`, `plan`, `agent` и механики переключения см. в `README.md` → **Режимы работы**.

## Задачи

- Всего задач: 11
- 🟢 Активных: 0
- 🟡 Черновиков: 0
- ✅ Завершённых: 11

Текущие задачи: см. `knowledge/tasks/registry.json`

## Инварианты

- **INV-1**: AI-First: JSON primary, markdown derivative
  - Маркер: `INVARIANT: JSON must be primary format for all knowledge artifacts; markdown is auto-generated derivative`
  - Задача: Ядро loom — bootstrap
- **INV-2**: Stack-Agnostic: система не знает о языке/фреймворке
  - Маркер: `INVARIANT: No language-specific branching logic in extension code`
  - Задача: Ядро loom — bootstrap
- **INV-3**: Legacy/Greenfield parity: onboarding работает в пустом и непустом проекте
  - Маркер: `INVARIANT: Onboarding pipeline must handle clean, partial, foreign_system, mixed_system, compatible states`
  - Задача: Ядро loom — bootstrap
- **INV-4**: Task-Centric накопление: каждая задача = атом, знания наследуются
  - Маркер: `INVARIANT: Every task has task.json; registry.json is updated; closed tasks are read by agents`
  - Задача: Ядро loom — bootstrap
- **INV-5**: Operator слои: read-only TUI, docs-as-code
  - Маркер: `INVARIANT: TUI widgets do not allow code editing; operator interacts via commands and read-only reports`
  - Задача: Ядро loom — bootstrap
- **INV-6**: Детерминированный контекст: нет неявного состояния
  - Маркер: `INVARIANT: Subagents use clean sessions; context is assembled from explicit files, not implicit state`
  - Задача: Ядро loom — bootstrap
- **INV-7**: Pi-Native: extension, не standalone tool
  - Маркер: `INVARIANT: All code lives in .pi/extensions/loom/; single agent with different prompts per mode`
  - Задача: Ядро loom — bootstrap
- **INV-8**: Git-based review: reviewer анализирует артефакты, не сессию
  - Маркер: `INVARIANT: Review artifact references git commit hash; reviewer analyzes git diff, not live session`
  - Задача: Ядро loom — bootstrap
- **INV-9**: Executor не пишет код: только оркестрирует worker + reviewer
  - Маркер: `INVARIANT: Executor tools: spawn_worker, spawn_reviewer, update_task_status, read_artifact. NO write/edit/commit in executor tools`
  - Задача: Ядро loom — bootstrap
- **INV-10**: Модели конфигурируются: не хардкод
  - Маркер: `INVARIANT: Model config in subagent-config.json; no hardcoded model strings in extension code`
  - Задача: Ядро loom — bootstrap
- **INV-11**: Исполнение строго последовательное: шаг N → worker → reviewer → шаг N+1
  - Маркер: `INVARIANT: Executor loop cannot spawn more than one worker simultaneously`
  - Задача: Ядро loom — bootstrap
- **INV-12**: Локализация: UI и пользовательские артефакты — русский; AI-документация — английский
  - Маркер: `INVARIANT: All system prompts, JSON schemas, code comments in English; operator-facing text in Russian; machine markers in English`
  - Задача: Ядро loom — bootstrap
- **INV-13**: Git commit safety: не git add -A, а staged по списку
  - Маркер: `INVARIANT: Worker commits only files listed in files-to-commit.json; no mass add`
  - Задача: Ядро loom — bootstrap
- **INV-14**: Pi CLI верифицирован: все флаги для subagent spawner подтверждены PoC
  - Маркер: `INVARIANT: pi CLI supports --mode json, --system-prompt, --model, --session-dir, --tools; subagent spawner is feasible`
  - Задача: Ядро loom — bootstrap
- **V2-INV-1**: Memory layer активен: система сама решает что запомнить, что забыть, что подсунуть агенту
  - Маркер: `INVARIANT: Memory layer must actively manage context, not just store files`
  - Задача: Когнитивные слои loom v2
- **V2-INV-2**: Retrieval через scout subagent, не эмбеддинги
  - Маркер: `INVARIANT: Retrieval must use scout subagent with explicit reasoning, not vector embeddings`
  - Задача: Когнитивные слои loom v2
- **V2-INV-3**: Совместимость с v1: все форматы и API v1 должны работать без изменений
  - Маркер: `INVARIANT: v2 must be backwards compatible with v1 formats and tools`
  - Задача: Когнитивные слои loom v2
- **V2-INV-4**: Детерминированный контекст: контекст агенту собирается явно, без неявного состояния
  - Маркер: `INVARIANT: Context assembly must be explicit and deterministic; no hidden session state`
  - Задача: Когнитивные слои loom v2
- **V2-INV-5**: Task-Centric накопление: память привязана к задачам и project knowledge, не к сессии агента
  - Маркер: `INVARIANT: Memory is task-scoped and project-scoped; agent session is ephemeral`
  - Задача: Когнитивные слои loom v2
- **V2-INV-6**: Token budget respected: контекст агенту не превышает лимит
  - Маркер: `INVARIANT: ContextAssembler must truncate output to fit within configured token budget`
  - Задача: DU-1: Memory Layer
- **V2-INV-7**: Кэширование: повторные запросы не порождают лишних субагентов
  - Маркер: `INVARIANT: Scout retrieval must cache results by query_hash to avoid redundant spawns`
  - Задача: DU-2: Scout Retrieval

## Архитектура

### Rules + Architecture Catalogs [COMP-catalogs]

- **Слой:** infrastructure
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/plan-mode/tools.ts, .pi/extensions/loom/knowledge/onboarding.ts

**Ответственности:**
- Store and manage project rules
- Store and manage architecture components
- Provide list/add operations

### Migration Subagent [COMP-migrator]

- **Слой:** application
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/subagent/prompts/migrator.md, .pi/extensions/loom/subagent/specs.ts

**Ответственности:**
- Detect foreign task/knowledge systems
- Analyze migration feasibility
- Produce migration-analysis.json

### Mode Switcher [COMP-mode-switcher]

- **Слой:** presentation
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/index.ts

**Ответственности:**
- Switch between idle/plan/agent modes
- Provide keyboard shortcut alt+m
- Persist and restore mode across sessions

### Onboarding Pipeline [COMP-onboarding]

- **Слой:** application
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/knowledge/onboarding.ts

**Ответственности:**
- Pre-check project state
- Classify as clean/partial/foreign/mixed/compatible
- Initialize knowledge structure
- Generate AGENTS.md
- Run onboarding wizard

### Research Subagent [COMP-researcher]

- **Слой:** application
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/subagent/prompts/researcher.md, .pi/extensions/loom/subagent/specs.ts

**Ответственности:**
- Analyze project documentation, CI/CD, conventions
- Produce context-research.json

### Scout Subagent [COMP-scout]

- **Слой:** application
- **Статус:** verified
- **Файлы:** .pi/extensions/loom/subagent/prompts/scout.md, .pi/extensions/loom/subagent/specs.ts

**Ответственности:**
- Analyze codebase by file extensions and config files
- Produce stack.json with technology stack and module map

## Правила

### AI-Native формат: JSON primary, markdown derivative [RULE-001-ai-native-format]

Все артефакты loom хранятся в JSON как source of truth. Markdown-производные генерируются из JSON и не должны редактироваться вручную. Машинные маркеры (INVARIANT:, PRE:, POST:, CONTRACT:, BLOCK:, SCOPE:, EVIDENCE:) — на английском.

- **Категория:** documentation | **Статус:** active | **Версия:** 1

### Локализация: русский для оператора, английский для машин [RULE-002-localization]

System prompts, JSON schemas, code comments, machine-маркеры — только на английском. UI, команды, уведомления оператору, markdown-артефакты — на русском. Команды, пути, ID — exempt. Все markdown-артефакты проходят localization guard перед finalize.

- **Категория:** localization | **Статус:** active | **Версия:** 1

### Decision Making: STOP при неоднозначности, варианты 1/2/3 или А/Б/В [RULE-003-decision-making]

Агент принимает решения автономно, если контекст однозначен. При неоднозначности — STOP, явный вопрос оператору с вариантами (только цифры 1/2/3 или кириллица А/Б/В). Никаких 'предположим по умолчанию'.

- **Категория:** other | **Статус:** active | **Версия:** 1

### Накопление знаний: каждая задача оставляет след [RULE-004-knowledge-accumulation]

Каждая задача — атом знаний. После завершения задачи все артефакты сохраняются в knowledge/tasks/<TASK-ID>/. Project-level память накапливается в knowledge/project/. Cross-task inheritance: агент обязан читать закрытые задачи при работе над новыми.

- **Категория:** documentation | **Статус:** active | **Версия:** 1

### Git Flow: task-scoped commits, staged список, review перед merge [RULE-005-git-flow]

Worker делает task-scoped commits по staged-списку (files-to-commit.json). Reviewer анализирует git diff + файлы. Executor: approve → следующий шаг, reject → доработка (макс 10 iter). Human-in-the-loop только при reject+max_iter, timeout, ambiguity. После approve — merge в base-ветку.

- **Категория:** git | **Статус:** active | **Версия:** 1

## Контекст

**README:** loom — AI-Native Development Environment для pi. Система разработки с трёхрежимной моделью (idle/plan/agent), накоплением знаний, git-based review и локализацией (русский для оператора, английский для AI). Версия 0.3.0.

**Рекомендации:**
- Настроить CI/CD (GitHub Actions) для автоматического запуска тестов при пушах
- Опубликовать loom-extension в npm
- Добавить интеграционные тесты для полного цикла Plan → Agent
- Создать примеры использования для документации
- Настроить автоматическую генерацию markdown-производных из JSON

---
*Generated by loom onboarding pipeline*