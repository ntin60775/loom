# AGENTS.md — Entry Point для loom

## Проект
- Название: loom
- Стек: pi extension (TypeScript)
- Статус: active (bootstrap in_progress)

## Маршрутизация
- `/plan [desc]` — вход в Plan Mode (брейншторм, артефакты)
- `/agent` — вход в Agent Mode (исполнение по плану)
- `/loom-init` — инициализация loom в проекте (с onboarding wizard)
- `/task-status` — статус текущей задачи
- `/rule-add` — добавить правило в каталог
- `/rule-list` — список правил проекта
- `/arch-add` — добавить архитектурный компонент
- `/arch-list` — список архитектурных компонентов
- Текущие задачи: см. `knowledge/tasks/registry.json`
- Полный контекст: `knowledge/`
- Правила: `knowledge/project/rules/`
- Архитектура: `knowledge/project/architecture/`
- Схемы: `knowledge/project/schemas/`
- Конфиги: `knowledge/project/configs/`

## Инвариант
Агент — основной исполнитель. Оператор задаёт намерение, агент реализует.
Агент не ждёт похвалы за красивое оформление — он ждёт проверки инвариантов.

## AI-Native формат
- JSON primary, markdown derivative.
- Машинные маркеры: `INVARIANT:`, `PRE:`, `POST:`, `CONTRACT:`, `BLOCK:`, `SCOPE:`, `EVIDENCE:`.
- System prompts, schemas, code comments — на английском.
- Текст для оператора, UI, markdown derivative — на русском.

## Проверка локализации
- Команда: `bash scripts/check-docs-localization.sh`
- Все собственные markdown и UI-артефакты должны проходить guard перед finalize.
- Команды, пути, ID — exempt.

## Жизненный цикл задачи
1. Задача начинается с `task.json`.
2. Сложная задача — обязателен `plan.json`.
3. Архитектурно нетривиальная — обязателен `sdd.json`.
4. Артефакты задачи — внутри `artifacts/` каталога задачи.
5. Review — через git diff → `reviews/` в knowledge/.

## Git Flow
- Worker делает task-scoped commits по staged-списку (files-to-commit.json).
- Reviewer анализирует git diff + файлы.
- Executor: `approve → следующий шаг`, `reject → доработка` (макс 10 iter).
- Human-in-the-loop только при reject+max_iter, timeout, ambiguity.

## Decision Making
- Агент принимает решения автономно, если контекст однозначен.
- Если неоднозначность — STOP, явный вопрос оператору с вариантами 1/2/3 или А/Б/В.
- Никаких "предположим по умолчанию".

## Накопление знаний
- Каждая задача оставляет след в `knowledge/tasks/`.
- Проектная память накапливается в `knowledge/project/`.
- Cross-task inheritance: агент обязан читать закрытые задачи при работе над новыми.
