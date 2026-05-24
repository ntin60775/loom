# TASK-2026-0008-memory-layer

> Сгенерировано из `task.json`. Не редактировать вручную. Править `task.json` и перегенерировать.

## Сводка

- **TASK-ID**: TASK-2026-0008-memory-layer
- **Краткое имя**: memory-layer
- **Статус**: draft
- **Приоритет**: medium
- **Ветка**: task/TASK-2026-0008-memory-layer
- **Родитель**: [TASK-2026-0002-loom-vnext](../TASK-2026-0002-loom-vnext/task.json) (DU-1)

## Описание

Реализация 4 дорожек памяти (session, episodic, semantic, procedural) с активным управлением контекстом. Ранжирование, суммаризация, retention policy. Интеграция с ContextAssembler для сборки контекста агенту.

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-1 | Memory layer активен: система сама решает что запомнить, что забыть, что подсунуть агенту | defined |
| INV-3 | Совместимость с v1: все форматы и API v1 должны работать без изменений | defined |
| INV-4 | Детерминированный контекст: контекст агенту собирается явно, без неявного состояния | defined |
| INV-5 | Task-Centric накопление: память привязана к задачам и project knowledge, не к сессии агента | defined |
| INV-6 | Token budget respected: контекст агенту не превышает лимит | defined |

## Единицы поставки

| ID | Статус | Назначение |
|----|--------|------------|
| DU-1 | planned | Memory layer: 4 дорожки с активным управлением контекстом |

## Артефакты

- `task.json` — **Primary**.
- `plan.json` — **Primary**.
- `task.md` — Derivative.
- `artifacts/verification-matrix.md` — Verification matrix.

## Рабочий журнал

### 2026-05-24 — Инициализация подзадачи
- Создана изоляция DU-1 как подзадача TASK-2026-0008.
- Созданы task.json, plan.json, task.md.
- Следующий шаг: реализация data model для 4 дорожек.
