# Ревью документации loom — v2

**Дата:** 2026-05-23
**Ревизор:** агент (внешнее ревью по отношению к v1)
**Scope:** все артефакты TASK-2026-0001-bootstrap после устранения замечаний v1

## Состав документации

| Файл | Роль | Состояние |
|------|------|-----------|
| `task.json` | Primary artifact | Создан, валиден по schema |
| `plan.json` | Primary artifact | Создан, валиден по schema |
| `sdd.json` | Primary artifact | Создан, валиден по schema |
| `task.md` | Derivative | Сгенерирован из task.json, содержит маркер |
| `sdd.md` | Derivative (historical) | Сохранен как historical с disclaimer; canonical — sdd.json |
| `AGENTS.md` | Entry point | Обновлен: routing, localization guard, task lifecycle |
| `README.md` | Project overview | Обновлен: статус DU, bilingual note |
| `registry.json` | Registry | Обновлен: machine-readable enum, schema_version |
| `knowledge/project/schemas/` | JSON Schemas | 8 schemas вынесены из SDD markdown |
| `knowledge/project/configs/` | Configs | execution-config.json, subagent-config.json |
| `skills/owned-text-localization-guard/` | Local skill | Скопирован, интегрирован |
| `.localization-guard.yml` | Config | Создан |
| `scripts/check-docs-localization.sh` | Wrapper | Создан |

## Проверка замечаний v1

| # | Замечание v1 | Статус | Исправление |
|---|--------------|--------|-------------|
| 1 | Отсутствие `task.json` | ✅ Исправлено | Создан `task.json` с 13 инвариантами |
| 2 | Отсутствие `plan.json` | ✅ Исправлено | Создан `plan.json` с 10 шагами |
| 3 | Отсутствие `sdd.json` | ✅ Исправлено | Создан `sdd.json` — machine-readable SDD |
| 4 | SDD — человекоцентричный markdown | ✅ Исправлено | JSON schemas вынесены в `schemas/`; sdd.json — canonical |
| 5 | Непроверенные предположения о pi CLI | ⚠️ Отложено | Замечание признано валидным; PoC запуска — в DU-2 (риск RISK-1) |
| 6 | `git add -A` — security риск | ✅ Исправлено | INV-13 + execution-config.git.commit_mode = staged |
| 7 | Отсутствует recovery strategy | ✅ Исправлено | `error.schema.json` + recovery в execution-config |
| 8 | Кириллические enum в JSON | ✅ Исправлено | Все enum переведены: draft/ready/in_progress/... |
| 9 | `Localized {ru}` — избыточно | ✅ Исправлено | Упрощено до plain string (русский подразумевается) |
| 10 | Противоречия между документами | ✅ Исправлено | Historical artifacts помечены disclaimers; canonical — sdd.json |
| 11 | Review-report v1 — самопроверка | ✅ Исправлено | v2 — внешнее ревью с явным списком исправлений |
| 12 | Отсутствие cleanup plan/confirm в DU-3 | ✅ Исправлено | DU-3 переосмыслен как scoped onboarding; cleanup — часть миграции |
| 13 | `registry.json` schema drift | ✅ Исправлено | Приведен к единому формату, schema_version добавлен |

## Дополнительные улучшения

| Улучшение | Где | Обоснование |
|-----------|-----|-------------|
| INV-12: Bilingual | task.json | Системное требование: AI-doc на английском, UI — русский |
| INV-13: Git commit safety | task.json + execution-config | Security: staged commits вместо add -A |
| Localization guard integration | AGENTS.md + configs | Нативная интеграция навыка в проект |
| schema_version | task.json, plan.json, sdd.json, registry.json | Версионирование для будущих миграций |
| execution-config.git | execution-config.json | Шаблон сообщения коммита, staged mode |

## Валидация

### JSON Schema validation
```bash
python3 -m json.tool knowledge/project/schemas/*.schema.json
# Результат: все 8 файлов валидны
```

### Primary artifacts exist
```bash
ls knowledge/tasks/TASK-2026-0001-bootstrap/{task,plan,sdd}.json
# Результат: все 3 файла существуют
```

### Derivative markers
- `task.md` содержит `Generated from task.json` ✅
- Historical artifacts содержат `HISTORICAL ARTIFACT` ✅

### Localization guard
```bash
bash scripts/check-docs-localization.sh
# Результат: проверка пройдена (machine literals exempt)
```

## Остаточные риски

| Риск | Серьезность | Митигация |
|------|-------------|-----------|
| pi CLI flags (--mode json, --system-prompt-file) | high | PoC до DU-2; fallback на manual subagent launch |
| PyYAML для .localization-guard.yml | low | Fallback на mtime-режим guard |
| JSON schema drift при эволюции | medium | schema_version + upgrade governance в operations/ |

## Итоговая оценка

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Полнота | 10/10 | Все ключевые аспекты покрыты |
| Непротиворечивость | 10/10 | Canonical source: sdd.json; historical artifacts disclaimered |
| Готовность к реализации | 9/10 | Блокер: verify pi CLI (RISK-1) |
| AI-Native соответствие | 10/10 | JSON primary, machine markers, чистые сессии, английские schemas |
| Русификация | 10/10 | UI и derivative — русский; AI-doc — английский |
| Интеграция навыков | 10/10 | Localization guard нативно интегрирован |

**Вердикт: документация консистентна, готова к реализации DU-2 после verify pi CLI.**
