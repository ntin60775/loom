# Contributing to loom

## Принципы разработки

1. **AI-First, Human-Second** — код, документация и артефакты оптимизированы для ИИ-агентов
2. **Task-Centric** — всё вращается вокруг задачи, атом работы — task
3. **Accumulative Knowledge** — знания накапливаются и наследуются между задачами
4. **Invariant-Driven** — инварианты первичны, код вторичен

## Структура проекта

```
.pi/extensions/loom/   — код расширения pi
  agent-mode/           — Agent Mode: executor, tools, loop
  plan-mode/            — Plan Mode: orchestrator, tools
  memory/               — Memory Layer: 4 дорожки
  retrieval/            — Scout Retrieval (v2)
  shared/               — Утилиты, логгер, состояние
  subagent/             — Spawner, спецификации, промпты
  ui/                   — TUI виджеты
  knowledge/            — Схемы, IO, onboarding
knowledge/              — Накопленные знания проекта
  tasks/                — Задачи и артефакты
  project/              — Правила, архитектура, конфиги
```

## Инварианты (code-level)

| ID | Инвариант |
|----|-----------|
| INV-1 | Memory layer активно управляет контекстом |
| INV-2 | Retrieval через scout subagent, не эмбеддинги |
| INV-3 | Совместимость с v1 |
| INV-4 | Детерминированный контекст |
| INV-5 | Task-Centric накопление |
| INV-6 | Token budget соблюдается |
| INV-7 | Кэширование результатов поиска |
| INV-11 | Строго последовательное исполнение (один worker) |
| INV-12 | Code comments на английском, UI на русском |

## Процесс разработки

1. Создать задачу: `/plan` → `loom_create_task`
2. Спланировать: `loom_create_plan`
3. Исполнять: `/agent` → `loom_get_next_step` → `loom_spawn_worker` → `loom_spawn_reviewer`
4. По завершении: `loom_update_task status=completed`

## Code Style

- **Комментарии к коду** — на английском (INV-12)
- **UI, нотификации, сообщения** — на русском
- **Machine markers** (`INVARIANT:`, `PRE:`, `POST:`) — на английском
- **Catch-блоки** — всегда с `logger.warn`/`logger.error`
- **Типы** — `unknown` вместо `any` в catch; TypeBox-схемы для runtime-валидации

## Как добавить фичу

1. Создай task в `knowledge/tasks/`
2. Напиши `plan.json` с шагами
3. Реализуй в `.pi/extensions/loom/` соответствующем модуле
4. Добавь tool в `agent-mode/tools.ts` или `plan-mode/tools.ts`
5. Зарегистрируй в `index.ts` (tool lists + commands)
6. Добавь запись в verification matrix
7. Сделай review через `loom_spawn_reviewer`

## Лицензия

Apache-2.0 — см. `LICENSE`
