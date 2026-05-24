# Evidence Artifacts — DU-3: Onboarding + Knowledge accumulation

## Что было реализовано

### Scout Subagent (step 1)
- **Prompt:** `.pi/extensions/loom/subagent/prompts/scout.md` — универсальный scout для анализа codebase
- **Tool:** `loom_run_scout` — spawn subagent, сохраняет `stack.json` в `knowledge/project/onboarding/`
- **Инварианты:** INV-2 (stack-agnostic через file extensions), INV-3 (работает на любом проекте), INV-6 (чистые сессии)

### Research Subagent (step 2)
- **Prompt:** `.pi/extensions/loom/subagent/prompts/researcher.md` — анализ README, CI/CD, документации
- **Tool:** `loom_run_researcher` — spawn subagent, сохраняет `context-research.json`
- **Инварианты:** INV-6 (чистые сессии), INV-12 (английский system prompt)

### Migration Subagent (step 3)
- **Prompt:** `.pi/extensions/loom/subagent/prompts/migrator.md` — детекция foreign task systems
- **Tool:** `loom_run_migrator` — spawn subagent, сохраняет `migration-analysis.json`
- **Инварианты:** INV-3 (обрабатывает TCK и другие системы), INV-4 (task-centric mapping)

### Rules Catalog (step 4)
- **Commands:** `/rule-add`, `/rule-list`
- **Tools:** `loom_add_rule`, `loom_list_rules`
- **Storage:** `knowledge/project/rules/<id>.json`
- **Seed rules:** RULE-001–005 (AI-Native format, локализация, decision making, knowledge accumulation, git flow)
- **Безопасность:** ID sanitized (`/[^a-zA-Z0-9_-]/g → '_'`)

### Architecture Catalog (step 5)
- **Commands:** `/arch-add`, `/arch-list`
- **Tools:** `loom_add_architecture_component`, `loom_list_architecture_components`
- **Storage:** `knowledge/project/architecture/components/<id>.json`
- **Seed components:** COMP-onboarding, COMP-scout, COMP-researcher, COMP-migrator, COMP-catalogs, COMP-mode-switcher
- **Безопасность:** ID sanitized

### Onboarding Pipeline (step 6)
- **Command:** `/loom-init` с pre-check + classification + wizard
- **Classification:** clean / partial / foreign_system / mixed_system / compatible
- **Structure:** `ensureKnowledgeStructure()` создаёт 8 подкаталогов
- **Wizard:** предлагает запустить pipeline для non-clean проектов

### Mode Switcher (step 7+)
- **Shortcut:** `ctrl+shift+m` — циклическое переключение idle → plan → agent → idle
- **Helpers:** `enterPlanMode()`, `enterAgentMode()`, `enterIdleMode()` — DRY, переиспользуются командами и шорткатом
- **Persistence:** состояние режима сохраняется в session entries

## DRY-рефакторинг
- `runOnboardingSubagent()` — единый helper для scout/researcher/migrator (устранил ~90 строк дублирования)
- `enterPlanMode/enterAgentMode/enterIdleMode` — единые helpers для переключения режимов

## Исправления по ревью (v2)
1. ✅ DRY violation — extracted `runOnboardingSubagent`
2. ✅ isError logic — fixed: `!parsed || result.exitCode !== 0`
3. ✅ Unused imports — cleaned
4. ✅ Path traversal — ID sanitization in loom_add_rule and loom_add_architecture_component

## Файлы изменений

```
.pi/extensions/loom/index.ts                          — mode switcher, helpers, commands
.pi/extensions/loom/knowledge/onboarding.ts            — pipeline, generator, catalog helpers
.pi/extensions/loom/knowledge/schemas.ts               — TypeBox schemas + runtime validators
.pi/extensions/loom/plan-mode/tools.ts                 — catalog tools, onboarding subagent tools
.pi/extensions/loom/subagent/prompts/scout.md           — scout prompt
.pi/extensions/loom/subagent/prompts/researcher.md      — researcher prompt
.pi/extensions/loom/subagent/prompts/migrator.md        — migrator prompt
.pi/extensions/loom/subagent/specs.ts                   — spec interfaces (ScoutSpec, ResearcherSpec, MigratorSpec)
AGENTS.md                                               — entry point documentation
knowledge/tasks/TASK-2026-0001-bootstrap/sdd.json       — architecture components update
knowledge/tasks/TASK-2026-0005-onboarding-impl/plan.json — plan with checkpoints
knowledge/tasks/TASK-2026-0005-onboarding-impl/task.json — task metadata
knowledge/tasks/registry.json                            — task registry
```

## Post-Review Fixes (W1, W2, N1–N3)

| ID | Проблема | Исправление |
|---|---|---|
| **W1** | `spawner.ts`: `fs.rmdirSync(tmpPromptDir)` не удаляет непустые каталоги | Заменено на `fs.rmSync(tmpPromptDir, { recursive: true, force: true })` |
| **W2** | `index.ts`: race condition при быстром переключении режимов (`ctrl+shift+m`) | Добавлен `isTransitioning` мьютекс в `enterPlanMode`, `enterAgentMode`, `enterIdleMode` |
| **N1** | `schemas.ts`: `validateExecutionConfigShape` проверял только наличие секций | Усилен: проверка `schema_version` как string, `max_worker_iterations >= 1`, `timeout_reviewer_seconds >= 1`, enum для `on_worker_crash`, non-empty `command` |
| **N2** | `index.ts`: `saveState` через `pi.appendEntry` → бесконечный рост session entries | Переход на файл `knowledge/.loom-state.json` (`readJson`/`writeJson`), legacy fallback сохранён |
| **N3** | `scout.md`: поля `description` не содержали указания языка | Добавлен `in Russian` в оба поля `description` |

Дополнительно: `.gitignore` обновлён (`**/.loom-state.json`), чтобы runtime state не попадал в git.

---

*Evidence collected for comprehensive review of DU-03*
