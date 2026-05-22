# AGENTS.md — Правила работы агентов в проекте loom

## Identity

- Язык: русский для всех пользовательских артефактов и коммуникаций.
- Английский допустим только для машинно-значимых литералов, команд, путей, ID и проверяемых маркеров.

## Core Invariant

Агент — основной исполнитель. Оператор задаёт намерение, агент реализует.
Агент не ждёт похвалы за красивое оформление — он ждёт проверки инвариантов.

## AI-Native Spec Format

Все спецификации и документация внутри `knowledge/` должны быть оптимизированы для ИИ:

- Структура > Оформление. Заголовки — иерархические маркеры, не декор.
- Однозначность > Краткость. Лучше избыточная явность, чем неявный контекст.
- Детерминированные шаблоны. Использовать паттерны, которые LLM хорошо усваивает из обучающих данных: таблицы, чек-листы, матрицы, инварианты, pre/post-conditions.
- Избегать "красивого" markdown: no emoji, no decorative separators, no human-centric visual hierarchy.
- Использовать machine-verifiable markers: `INVARIANT:`, `PRE:`, `POST:`, `CONTRACT:`, `BLOCK:`, `SCOPE:`, `EVIDENCE:`.

## Pi-Native Integration

loom — это pi extension. Plan mode и agent mode работают в рамках единой pi-сессии:
- `/plan` — вход в plan mode (брейншторм, артефакты).
- `finalize_plan` — авто-переключение в agent mode.
- Субагенты запускаются в tmux windows текущего терминала.
- Единый агент, разные system prompt и tools для каждого режима.

## Task Lifecycle

1. Задача начинается с `task.json`.
2. Если задача сложная — обязателен `plan.json`.
3. Если задача архитектурно нетривиальная — обязателен `sdd.json`.
4. Все артефакты задачи — внутри `artifacts/` каталога задачи.
5. Review проходит через git diff → `reviews/` в knowledge/.

## Code Ownership

- Агент пишет код. Оператор практически не лезет в код.
- Для человека — docs-as-code (rustdoc, pydoc, typedoc и т.д.).
- Комментарии в коде — для агента, не для человека. `// INVARIANT: ...`, `// CONTRACT: ...`, `// AGENT_NOTE: ...`.

## Knowledge Accumulation

- Каждая задача оставляет след в `knowledge/tasks/`.
- Проектная память накапливается в `knowledge/project/`.
- Cross-task inheritance: агент обязан читать закрытые задачи при работе над новыми.

## Decision Making

- Агент принимает решения автономно, если контекст однозначен.
- Если неоднозначность — STOP, явный вопрос оператору с вариантами `1/2/3` или `А/Б/В`.
- Никаких "предположим по умолчанию".

## Git Flow

- Worker делает task-scoped commits.
- Reviewer анализирует git diff + файлы.
- Executor: approve → next step, reject → correction (max 10 iter).
- Human-in-the-loop только при reject+max_iter, timeout, ambiguity.
