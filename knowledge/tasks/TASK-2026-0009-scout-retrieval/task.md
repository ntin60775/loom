# TASK-2026-0009-scout-retrieval

> Сгенерировано из `task.json`. Не редактировать вручную. Править `task.json` и перегенерировать.

## Сводка

- **TASK-ID**: TASK-2026-0009-scout-retrieval
- **Краткое имя**: scout-retrieval
- **Статус**: draft
- **Приоритет**: medium
- **Ветка**: task/TASK-2026-0009-scout-retrieval
- **Родитель**: [TASK-2026-0002-loom-vnext](../TASK-2026-0002-loom-vnext/task.json) (DU-2)

## Описание

Реализация поиска релевантных знаний через scout subagent без эмбеддингов. search_knowledge tool, кэширование, ограничение scope поиска. Интеграция с executor и plan mode.

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-2 | Retrieval через scout subagent, не эмбеддинги | defined |
| INV-3 | Совместимость с v1: все форматы и API v1 должны работать без изменений | defined |
| INV-4 | Детерминированный контекст: контекст агенту собирается явно, без неявного состояния | defined |
| INV-7 | Кэширование: повторные запросы не порождают лишних субагентов | defined |

## Единицы поставки

| ID | Статус | Назначение |
|----|--------|------------|
| DU-2 | planned | Scout retrieval: search_knowledge tool, семантический поиск без эмбеддингов |

## Артефакты

- `task.json` — **Primary**.
- `plan.json` — **Primary**.
- `task.md` — Derivative.
- `artifacts/verification-matrix.md` — Verification matrix.

## Рабочий журнал

### 2026-05-24 — Инициализация подзадачи
- Создана изоляция DU-2 как подзадача TASK-2026-0009.
- Созданы task.json, plan.json, task.md.
- Следующий шаг: проектирование search_knowledge API.
