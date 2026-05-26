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
| INV-1 | AI-First: JSON primary, markdown derivative |
| INV-2 | Stack-Agnostic: система не знает о языке/фреймворке |
| INV-3 | Legacy/Greenfield parity: onboarding для любых проектов |
| INV-4 | Task-Centric накопление: каждая задача = атом |
| INV-5 | Operator слои: read-only TUI, docs-as-code |
| INV-6 | Детерминированный контекст: нет неявного состояния |
| INV-7 | Pi-Native: extension, не standalone tool |
| INV-8 | Git-based review: reviewer анализирует артефакты |
| INV-9 | Executor не пишет код: только оркестрирует |
| INV-10 | Модели конфигурируются: не хардкод |
| INV-11 | Строго последовательное исполнение (один worker) |
| INV-12 | Локализация: русский для UI, английский для AI |
| INV-13 | Git commit safety: staged по списку |
| INV-14 | Pi CLI верифицирован |
| V2-INV-1 | Memory layer: активное управление контекстом |
| V2-INV-2 | Retrieval через scout subagent, не эмбеддинги |
| V2-INV-3 | Совместимость с v1 |
| V2-INV-4 | Детерминированный контекст (v2-specific) |
| V2-INV-5 | Task-Centric накопление (v2-specific) |
| V2-INV-6 | Token budget соблюдается |
| V2-INV-7 | Кэширование результатов поиска |
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
