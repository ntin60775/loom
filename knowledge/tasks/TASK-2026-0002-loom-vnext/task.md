# TASK-2026-0002-loom-vnext

> Сгенерировано из `task.json`. Не редактировать вручную. Править `task.json` и перегенерировать.

## Сводка

- **TASK-ID**: TASK-2026-0002-loom-vnext
- **Краткое имя**: loom-vnext
- **Статус**: active
- **Приоритет**: medium
- **Ветка**: task/TASK-2026-0002-loom-vnext

## Описание

Реализовать отложенные когнитивные слои: Memory Layer (session/episodic/semantic/procedural дорожки) и Scout-based retrieval (поиск релевантных знаний без эмбеддингов, через универсальный scout subagent).

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-1 | Memory layer активен: система сама решает что запомнить, что забыть, что подсунуть агенту | defined |
| INV-2 | Retrieval через scout subagent, не эмбеддинги | defined |
| INV-3 | Совместимость с v1: все форматы и API v1 должны работать без изменений | defined |
| INV-4 | Детерминированный контекст: контекст агенту собирается явно, без неявного состояния | defined |
| INV-5 | Task-Centric накопление: память привязана к задачам и project knowledge, не к сессии агента | defined |

## Единицы поставки

| ID | Статус | Назначение | Подзадача |
|----|--------|------------|-----------|
| DU-1 | planned | Memory layer: 4 дорожки с активным управлением контекстом | [TASK-2026-0008-memory-layer](../TASK-2026-0008-memory-layer/task.json) |
| DU-2 | planned | Scout retrieval: search_knowledge tool, семантический поиск без эмбеддингов | [TASK-2026-0009-scout-retrieval](../TASK-2026-0009-scout-retrieval/task.json) |

## Артефакты

- `task.json` — **Primary**. Задача в machine-readable формате.
- `plan.json` — **Primary**. План исполнения.
- `sdd.json` — **Primary**. Software Design Document.
- `task.md` — Derivative. Человекочитаемая сводка.
- `artifacts/verification-matrix.md` — Verification matrix (обязателен для задачи с sdd).

## Рабочий журнал

### 2026-05-24 — Создание документации и изоляция DU
- Созданы sdd.json, plan.json, task.md (derivative).
- Созданы изолированные подзадачи: TASK-2026-0008 (Memory Layer) и TASK-2026-0009 (Scout Retrieval).
- Каждая подзадача содержит task.json, plan.json.
- Registry.json обновлён: добавлены TASK-2026-0008 и TASK-2026-0009.
- Статус TASK-2026-0002: active.
