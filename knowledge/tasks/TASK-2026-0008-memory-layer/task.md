# TASK-2026-0008-memory-layer

> Сгенерировано из `task.json`. Не редактировать вручную. Править `task.json` и перегенерировать.

## Сводка

- **TASK-ID**: TASK-2026-0008-memory-layer
- **Краткое имя**: memory-layer
- **Статус**: completed
- **Приоритет**: medium
- **Ветка**: task/TASK-2026-0008-memory-layer
- **Родитель**: [TASK-2026-0002-loom-vnext](../TASK-2026-0002-loom-vnext/task.json) (DU-1)

## Описание

Реализация 4 дорожек памяти (session, episodic, semantic, procedural) с активным управлением контекстом. Ранжирование, суммаризация, retention policy. Интеграция с ContextAssembler для сборки контекста агенту.

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-1 | Memory layer активен: система сама решает что запомнить, что забыть, что подсунуть агенту | verified |
| INV-3 | Совместимость с v1: все форматы и API v1 должны работать без изменений | verified |
| INV-4 | Детерминированный контекст: контекст агенту собирается явно, без неявного состояния | verified |
| INV-5 | Task-Centric накопление: память привязана к задачам и project knowledge, не к сессии агента | verified |
| INV-6 | Token budget respected: контекст агенту не превышает лимит | verified |

## Единицы поставки

| ID | Статус | Назначение |
|----|--------|------------|
| DU-1 | completed | Memory layer: 4 дорожки с активным управлением контекстом |

## Артефакты

- `task.json` — **Primary**.
- `plan.json` — **Primary**.
- `task.md` — Derivative.
- `artifacts/verification-matrix.md` — Verification matrix.

## Рабочий журнал

### 2026-05-24 — Инициализация подзадачи
- Создана изоляция DU-1 как подзадача TASK-2026-0008.
- Созданы task.json, plan.json, task.md.

### 2026-05-24 — Выполнение всех шагов
- Шаг 1: Data model (memory-entry.schema.json, data-model.md).
- Шаг 2: Session Track (session-track.ts).
- Шаг 3: Episodic Store (episodic-store.ts).
- Шаг 4: Semantic Store (semantic-store.ts, semantic.json).
- Шаг 5: Procedural Store (procedural-store.ts, procedural.json).
- Шаг 6: Memory Manager (manager.ts).
- Шаг 7: Context Assembler (context-assembler.ts).
- Шаг 8: Интеграция с Executor v1 (backward compat, use_memory_v2 opt-in).
- Шаг 9: Verification matrix и review (verification-matrix.md, review-ML-1.json).
- Задача завершена.
