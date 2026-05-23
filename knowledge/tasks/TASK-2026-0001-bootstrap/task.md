# TASK-2026-0001-bootstrap

## Сводка

- **TASK-ID**: TASK-2026-0001-bootstrap
- **Краткое имя**: bootstrap
- **Человекочитаемое описание**: Спроектировать и реализовать ядро loom — AI-Native Development Environment для pi. Система разработки с помощью ИИ-агентов, оптимизированная под восприятие LLM, с накоплением знаний и артефактов.
- **Ветка**: task/TASK-2026-0001-bootstrap
- **Статус**: active
- **Приоритет**: critical
- **Создана**: 2026-05-21

## Контекст

Требуется система, которая позволяет ИИ-агенту полностью вести разработку программных проектов: создание спецификаций, написание кода, рефакторинг, исследование, сопровождение legacy.

Человек — оператор, задающий намерение. Агент — исполнитель. Оператор практически не лезет в код.

## Инварианты задачи

### INV-1: AI-First спецификация
Все спецификации, планы, контракты и документация внутри `knowledge/` оптимизированы для восприятия LLM, а не человека. Человекочитаемый слой — производная, генерируется автоматически.

### INV-2: Stack-Agnostic
Система не зависит от языка программирования, фреймворка, платформы или типа задачи. Код, инфраструктура, данные, исследование — всё это задачи.

### INV-3: Legacy & Greenfield parity
Система одинаково хорошо работает для:
- Legacy-проектов: обратная инженерия, код-археология, накопление знаний о существующей системе.
- Greenfield-проектов: генерация с нуля, проектирование архитектуры, bootstrap.

### INV-4: Task-Centric накопление знаний
Каждая задача = атом работы. Задачи создают артефакты. Артефакты накапливаются. Знания наследуются между задачами. Агент не начинает с чистого листа.

### INV-5: Human Operator Layer
Оператор взаимодействует через CLI/TUI и read-only отчёты. Оператор не редактирует код вручную. Документация для человека — docs-as-code (rustdoc, pydoc, typedoc и т.д.), генерируется из AI-native спеков.

### INV-6: Детерминированный контекст
Контекст агента формализован, версионируется, воспроизводим. Нет неявного состояния. Нет "магии".

### INV-7: Pi-Native Integration
Система реализуется как **pi extension**, а не как отдельный инструмент или standalone CLI.
- Plan mode: брейншторм и генерация артефактов задачи через `/plan`.
- Agent mode: работа по спекам через обычный agent loop pi.
- Авто-переключение: plan mode → agent mode без разрыва сессии.
- Единая сессия, единый контекст, единый агент — с разными system prompt и tools для каждого режима.
- Никаких "других агентов", рисующих несовместимые планы. aide = режим работы pi.

## Контур публикации

- **Delivery Unit 1**: `du/bootstrap-core-design`
  - Статус: open
  - Содержание: Архитектурный дизайн ядра, модель данных, форматы артефактов, инварианты.
- **Delivery Unit 2**: `du/bootstrap-impl-v1`
  - Статус: open
  - Содержание: Реализация ядра: task lifecycle, knowledge storage, agent context protocol, базовый CLI.

## Артефакты задачи

- `artifacts/sdd.md` — **Финальный SDD** ядра loom. Канонический source of truth для реализации.
- `artifacts/analysis-approaches.md` — исторический: анализ 3 вариантов подхода.
- `artifacts/pi-extension-design.md` — исторический: первая итерация дизайна pi extension.
- `artifacts/analysis-stratum-v2.md` — исторический: субагенты, правила, JSON schema.
- `artifacts/loom-git-flow-design.md` — исторический: git-based review flow.
- `artifacts/verification-matrix.md` — матрица верификации инвариантов (TBD).

## Рабочий журнал

### 2026-05-21 — Инициализация
- Создан репозиторий.
- Сформулирована задача.
- Созданы `README.md`, `AGENTS.md`, начальная структура `knowledge/`.

### 2026-05-21 — Анализ подходов
- Изучены reference-файлы skill `task-centric-knowledge`: core-model.md, deployment.md, adoption.md, task-routing.md, upgrade-transition.md.
- Проанализированы 3 варианта: взять за базу, с нуля, гибрид.
- Результат: рекомендован вариант 3 (гибрид) — сохранить архитектурные концепции task-centric-knowledge, переписать форматы под AI-native.
- Артефакт: `artifacts/analysis-approaches.md`.

### 2026-05-21 — Дизайн Pi Extension
- Добавлен инвариант INV-7: Pi-Native Integration.
- Изучена документация pi: extensions.md, skills.md, prompt-templates.md, README.md.
- Разработан дизайн extension `aide-plan-mode`:
  - Plan mode: `/plan` → брейншторм → `create_task`/`create_plan`/`create_sdd` → `finalize_plan`.
  - Agent mode: авто-переключение после finalize_plan, работа по спекам.
  - Единая сессия, единый агент — разные system prompt и tools для каждого режима.
  - Heuristic routing: auto-определение режима по ключевым словам.
  - Custom tools для управления knowledge/ (JSON primary, markdown derivative).
  - TUI widgets: status line, task widget, custom UI для plan mode.
  - State persistence через `pi.appendEntry()`.
- Артефакт: `artifacts/pi-extension-design.md`.

### 2026-05-21 — Архитектурное обсуждение v2
- Обсуждены: название, формат правил, универсальные субагенты, executor как приёмщик, аудит без полных сессий.
- Решения:
  - Rules и Architecture — JSON primary, каталоги по темам.
  - Субагенты универсальны: runtime pi + prompt от оркестратора + model config.
  - Executor: запускает worker → review → accept/reject (max 10 iter, конфиг).
  - Reviewer модели: конфигурируется, не хардкод (deepseek flash / kimi for 1c).
  - Audit trail: structured JSON, не полная сессия.
  - Чистая сессия при переходе plan → agent.
- Артефакт: `artifacts/analysis-stratum-v2.md`.

### 2026-05-21 — Архитектурное обсуждение v3 (loom)
- Название проекта: **loom**.
- Упрощение графов: только базовая информация в JSON, агент грепает напрямую.
- Универсальные worker/reviewer: не привязаны к коду, работают через prompt + model-config.
- **Git-based review flow**: reviewer анализирует git diff/артефакты, пишет review.json.
- Русификация: system prompt и артефакты на русском, machine markers на английском.
- Tmux windows: субагенты в вкладках текущего терминала.
- Параллелизм: plan mode — параллельно (max 4), agent mode — строго последовательно.
- Human-in-the-loop: executor останавливается только при reject+max_iter, timeout, ambiguity.
- Артефакт: `artifacts/loom-git-flow-design.md`.

### 2026-05-23 — Финализация архитектуры (SDD)
- Все обсуждения синтезированы в единый SDD.
- Зафиксировано 10 архитектурных инвариантов.
- Определены компоненты: Orchestrator, Executor, Spawner, Worker, Reviewer, Knowledge I/O.
- Full JSON schemas: task, plan, rule, architecture, review, subagent.
- Onboarding pipeline: pre-check → AGENTS.md analysis → scout → research → migration → rules → operator review.
- MVP scope: 4 Delivery Units (Core, Agent+Review, Onboarding, Polish).
- Статус архитектурной фазы: завершена. Следующий шаг — реализация DU-1.
- Артефакт: `artifacts/sdd.md` (канонический).
