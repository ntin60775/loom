---
task_id: TASK-2026-0016-tui-cards
title: "TUI-карточки: заимствование лучших UX-паттернов omp для loom"
status: draft
priority: high
---

# План: TUI-карточки для loom

## Контекст

Изучен проект oh-my-pi (omp) — форк pi с продвинутым TUI. Выявлены 5 ключевых UX-паттернов, которые радикально улучшают опыт оператора и агента. Все 5 реализуемы как pi-расширения через custom tool renderers (`renderCall`, `renderResult`).

Текущее состояние loom: инструменты выводят plain text. Субагенты шлют текстовые обновления через `onUpdate`. Нет визуальной иерархии, нет свёртки/развёртки, нет единого стиля.

Архитектурное решение: **путь 2** — остаёмся на pi + loom, заимствуем избранные фичи omp как pi-расширения. Первая фича — TUI-карточки.

## Инварианты

- INV-5: TUI — read-only, оператор взаимодействует через команды и отчёты
- INV-9: Executor не пишет код — только оркестрирует worker + reviewer
- INV-12: UI и пользовательские артефакты — русский

---

## DU-1: Карточки субагентов с деревом и статистикой

### Цель

Каждый worker/reviewer, запущенный через `loom_spawn_worker` / `loom_spawn_reviewer`, отображается в TUI как цветная карточка с tree-коннектором:

```
├── ✓ 1.2 worker: Implement auth module [done] · 14 tools · 8.2K/200K ctx · Σ32K · $1.20 · 2m34s
│   └── ╰─ bash: npm test...  · 12s
├── ⠋ 2.1 worker: Add tests [running] · 6 tools · 4.1K/200K ctx
│   └── ╰─ read: src/auth.ts
└── ○ 3.1 reviewer: Review commit [pending]
```

### Что нужно

1. **Компонент `SubagentCard`** — custom tool renderer для инструментов `loom_spawn_worker` / `loom_spawn_reviewer`
   - Tree-коннектор (`├──` / `└──` / `│   `) — зависит от позиции в списке
   - Иконка статуса (○ ⠋ ✓ ✗ ⚠) с цветом
   - Bold ID (1.2) + описание
   - Бейдж: `[done]` / `[failed]` / `[aborted]`
   - Строка статистики: `tools` · `ctx` (текущий/окно) · `Σtokens` · `$cost` · `duration`
   - Текущий инструмент (если running): иконка `╰─` + имя + аргументы + elapsed

2. **Retry-состояние**: когда worker ретраит — показать `retrying 2/5 in 3m: reason...`

3. **Вложенные деревья**: если worker спавнит task-субагентов — показать их карточки с доп. отступом

4. **Обновление в реальном времени**: заменить текстовый `onUpdate` на перерисовку компонента

### Файлы для изменения

- `.pi/extensions/loom/ui/subagent-widget.ts` — новый компонент SubagentCard
- `.pi/extensions/loom/agent-mode/tools.ts` — регистрация renderCall/renderResult для spawn_worker/spawn_reviewer
- `.pi/extensions/loom/subagent/spawner.ts` — передача структурированных ProgressEvent вместо текстовых строк

### Ожидаемый результат

Оператор видит дерево всех активных субагентов, их прогресс, текущий инструмент, статистику и ошибки — без скроллинга простыни текста.

---

## DU-2: Expand/Collapse (Ctrl+O)

### Цель

Каждая tool-карточка поддерживает два режима отображения, переключаемые по `Ctrl+O`.

### Что нужно

1. **Состояние expanded/collapsed** на уровне UI-компонента
2. **Свёрнутый режим**:
   - 3 строки вывода (PREVIEW_LIMITS.COLLAPSED_LINES)
   - 8 ханков диффа (DIFF_COLLAPSED_HUNKS)
   - Хинт: `(Ctrl+O для подробностей)` — **только когда есть что разворачивать**
3. **Развёрнутый режим**: полный вывод, хинт исчезает
4. **Hotkey**: зарегистрировать `Ctrl+O` через `pi.registerShortcut`
5. **Применить** ко всем кастомным tool renderer'ам loom (не только к карточкам субагентов)

### Файлы для изменения

- `.pi/extensions/loom/ui/` — общая утилита expand/collapse
- Все renderer'ы (subagent-widget, review-widget, etc.)

### Ожидаемый результат

Компактный обзор в свёрнутом виде, детали по запросу. Терминал не забивается.

---

## DU-3: Единый renderStatusLine

### Цель

Все loom-инструменты используют единый формат строки статуса:

```
✓ Edit  src/auth.ts:42  [+12 -3 · 2 hunks]
✗ Spawn worker  worker-1  [failed]  ·  exit code 1  ·  2m34s
```

### Что нужно

1. Функция `renderStatusLine({ icon, title, description }, theme)`
   - Иконка: цветная (success/error/warning/pending/running)
   - Title: операция (Edit, Spawn worker, Review, ...)
   - Description: доп. информация (путь файла, имя воркера, ...)
2. Использовать во **всех** loom tool renderer'ах

### Файлы для изменения

- `.pi/extensions/loom/ui/` — новая утилита
- Все `renderCall` / `renderResult` в loom-инструментах

### Ожидаемый результат

Консистентный визуальный язык для всех операций loom.

---

## DU-4: Review findings [P0-P3] в дереве

### Цель

В карточку reviewer'а встроено цветное дерево находок:

```
├── ✓ 3.1 reviewer: Review commit abc123 [done] · 4 tools · $0.40 · 1m12s
│   Patch is correct ✓ (94% confidence)
│   Summary: All changes are safe and well-tested...
│   Findings: P0:0 · P1:2 · P2:1
│   ├── [P1] Missing error handling  auth.ts:42
│   ├── [P1] Unnecessary null check   middleware.ts:88
│   └── [P2] Comment typo             config.ts:15
```

### Что нужно

1. Парсинг review-результата из subagent output
2. Цвета для приоритетов: P0=красный, P1=жёлтый, P2=синий, P3=серый
3. File:line рядом с каждой находкой
4. Раскрытие описания при expand
5. Вердикт: correct ✓ / incorrect ✗ с confidence %

### Файлы для изменения

- `.pi/extensions/loom/ui/review-widget.ts`
- `.pi/extensions/loom/agent-mode/tools.ts` — renderResult для spawn_reviewer

### Ожидаемый результат

Оператор мгновенно видит самые критичные проблемы, не читая весь отчёт.

---

## DU-5: Streaming diff preview

### Цель

Пока модель стримит аргументы для edit/write — рендерить дифф в реальном времени.

### Что нужно

1. **Перехват partial JSON** в `tool_call` хуке для edit/write инструментов
2. **Compute diff preview** из partial аргументов (как только есть path + content)
3. **Стабилизация**: не показывать «сначала удаления, потом догоняют» (strip trailing removals без matching additions)
4. **Abort предыдущего compute** при новых аргументах
5. **Spinner** пока нет полных аргументов

### Файлы для изменения

- `.pi/extensions/loom/ui/edit-preview.ts` — новый модуль
- Хук `tool_call` в `index.dev.ts` — перехват partial JSON

### Ожидаемый результат

Оператор видит изменения до того как инструмент выполнится. Снижение "wat" моментов.

---

## DU-6: E2E-тесты цепочки Plan→Worker→Reviewer→Commit

### Цель

Тесты, проверяющие полный цикл решения задачи в loom, с особым акцентом на спавн субагентов.

### Сценарии

**E2E-1: Полный цикл с успешным worker + reviewer**
1. Plan mode: создать task, план с 2 шагами
2. Agent mode: executor запускает worker для шага 1
3. Worker создаёт файл через pi в headless режиме
4. Worker коммитит (staged по files-to-commit.json)
5. Executor запускает reviewer для коммита
6. Reviewer возвращает review.json с verdict=correct
7. Executor запускает worker для шага 2
8. Worker создаёт второй файл, коммитит
9. Reviewer проверяет, возвращает correct
10. Задача помечается completed

**E2E-2: Worker с ошибкой + reviewer находит проблемы**
1. Plan → Agent, worker падает с exit code 1
2. Executor получает failed status
3. Executor НЕ запускает reviewer (reviewer только на успешные коммиты)
4. Второй worker работает нормально
5. Reviewer находит P1 finding, reject
6. Executor респавнит worker для доработки
7. Reviewer approve после доработки

**E2E-3: Таймаут worker'а**
1. Worker зависает > timeout
2. Spawner убивает процесс (SIGTERM → SIGKILL)
3. Executor получает aborted статус

**E2E-4: Рендеринг прогресса субагентов**
1. Запуск 2 worker'ов последовательно
2. Проверка что onUpdate вызывает updateResult с корректным progress
3. Проверка что rendered output содержит:
   - Иконки статуса
   - Количество tools
   - Context usage
   - Cumulative tokens (Σ)
   - Cost $
   - Duration

**E2E-5: TUI-компоненты рендерятся без креша**
1. SubagentCard.render() с разными состояниями (pending/running/completed/failed/aborted)
2. Expand/collapse переключение
3. Review findings с разными приоритетами
4. RenderStatusLine с разными иконками

### Файлы для изменения

- `.pi/extensions/loom/tests/` — новые тестовые файлы
- Тестовые фикстуры: тестовый проект с предсказуемой структурой

### Ожидаемый результат

Зелёные E2E-тесты, покрывающие всю цепочку. Тесты детерминированы (используют моки для pi CLI вызовов).

---

## Последовательность выполнения

DU выполняются строго в порядке нумерации, так как каждый следующий зависит от инфраструктуры предыдущего:

1. **DU-3** (renderStatusLine) — сначала, потому что все остальные DU будут его использовать
2. **DU-1** (SubagentCard) — ядро, самая сложная часть
3. **DU-4** (Review findings) — надстройка над SubagentCard
4. **DU-2** (Expand/Collapse) — после того как карточки готовы
5. **DU-5** (Streaming diff) — опциональное улучшение
6. **DU-6** (E2E-тесты) — идут параллельно с разработкой, финализируются после всех DU

## Верификация

- Все 385 существующих тестов остаются зелёными
- E2E-тесты DU-6 проходят
- Визуальная проверка: запуск `/plan` → `/agent` и наблюдение за рендерингом
- Локализация: UI-тексты на русском
