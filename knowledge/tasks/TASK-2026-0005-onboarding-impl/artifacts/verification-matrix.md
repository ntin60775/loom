# Verification Matrix — DU-3: Onboarding + Knowledge accumulation

**Task:** TASK-2026-0005-onboarding-impl
**Date:** 2026-05-24

## Invariants

| ID | Инвариант | Сценарий нарушения | Проверка | Статус | Evidence |
|---|---|---|---|---|---|
| INV-2 | Stack-Agnostic: нет language-specific branching | Код проверяет `if (language === "rust")` | `grep -rn 'if.*language.*===' --include='*.ts' .pi/extensions/loom/` | ✅ PASS | В extension-коде нет branching по языку; scout использует file extensions |
| INV-3 | Legacy/Greenfield parity: 5 состояний проекта | `/loom-init` падает на репо без .git | Вызвать `onboardProject()` на: (1) пустой каталог без .git, (2) репо без AGENTS.md, (3) репо с AGENTS.md, (4) репо с knowledge/, (5) репо с AGENTS.md+knowledge/ | ✅ PASS | `detectClassification()` возвращает корректный статус для всех 5 комбинаций |
| INV-4 | Task-Centric: каждая задача = атом | Registry не обновлён после создания задачи | `readRegistry()` содержит все созданные задачи; artifacts/ не пуст | ✅ PASS | Registry содержит 6 задач; artifacts/ заполнен (см. artifacts/) |
| INV-6 | Детерминированный контекст: чистые сессии | Subagent получает неявный контекст из сессии | Subagent spawner использует `--no-context-files` | ✅ PASS | `spawnSubagent` в spawner.ts передаёт `--no-context-files` |
| INV-7 | Pi-Native: extension, не standalone | Код лежит вне `.pi/extensions/loom/` | `find .pi/extensions/loom -name '*.ts'` — все файлы расширения | ✅ PASS | Все 16 .ts файлов внутри `.pi/extensions/loom/` |
| INV-12 | Локализация: русский UI, английский system | System prompt содержит русский текст | `grep -rn 'description in Russian' .pi/extensions/loom/subagent/prompts/scout.md` | ✅ PASS | scout.md исправлен: "short description" (без "in Russian") |

## Проверка шагов плана

| Step | Статус | Проверка |
|---|---|---|
| 1. Scout subagent | ✅ DONE | `scout.md` существует, `loom_run_scout` tool зарегистрирован |
| 2. Research subagent | ✅ DONE | `researcher.md` существует, `loom_run_researcher` tool зарегистрирован |
| 3. Migration subagent | ✅ DONE | `migrator.md` существует, `loom_run_migrator` tool зарегистрирован |
| 4. Rules catalog | ✅ DONE | `loom_add_rule`, `loom_list_rules` tools; `/rule-add`, `/rule-list` commands |
| 5. Architecture catalog | ✅ DONE | `loom_add_architecture_component`, `loom_list_architecture_components` tools; `/arch-add`, `/arch-list` commands |
| 6. Onboarding pipeline | ✅ DONE | `/loom-init` with pre-check, classification, wizard |
| 7. Review & finalize | ✅ DONE | Review artifacts в reviews/, task.json status=completed |

## Остаточные риски

| Риск | Описание | Принятие |
|---|---|---|
| RISK-1 | Нет авто-экстракции правил из кода (step 4) | Принято: manual add в MVP; авто-экстракция в DU-4 |
| RISK-2 | Нет авто-детекции архитектурных компонентов (step 5) | Принято: manual add в MVP; авто-детекция в DU-4 |
| RISK-3 | Нет E2E-тестов subagent pipeline | Принято: MVP; интеграционные тесты в DU-4 |

---

*Generated for comprehensive review of DU-03*
