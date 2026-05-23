# TASK-2026-0001-bootstrap

> Сгенерировано из `task.json`. Не редактировать вручную. Править `task.json` и перегенерировать.

## Сводка

- **TASK-ID**: TASK-2026-0001-bootstrap
- **Краткое имя**: bootstrap
- **Статус**: в работе
- **Приоритет**: critical
- **Ветка**: task/TASK-2026-0001-bootstrap

## Описание

Спроектировать и реализовать ядро loom — AI-Native Development Environment для pi. Система разработки с помощью ИИ-агентов, оптимизированная под восприятие LLM, с накоплением знаний и артефактов.

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-1 | AI-First: JSON primary, markdown derivative | verified |
| INV-2 | Stack-Agnostic: система не знает о языке/фреймворке | verified |
| INV-3 | Legacy/Greenfield parity: onboarding работает в пустом и непустом проекте | defined |
| INV-4 | Task-Centric накопление: каждая задача = атом, знания наследуются | verified |
| INV-5 | Operator слои: read-only TUI, docs-as-code | defined |
| INV-6 | Детерминированный контекст: нет неявного состояния | verified |
| INV-7 | Pi-Native: extension, не standalone tool | defined |
| INV-8 | Git-based review: reviewer анализирует артефакты, не сессию | verified |
| INV-9 | Executor не пишет код: только оркестрирует worker + reviewer | verified |
| INV-10 | Модели конфигурируются: не хардкод | verified |
| INV-11 | Исполнение строго последовательное: шаг N → worker → reviewer → шаг N+1 | verified |
| INV-12 | Локализация: UI и пользовательские артефакты — русский; AI-документация — английский | defined |
| INV-13 | Git commit safety: staged по списку, не git add -A | defined |

## Единицы поставки

| ID | Статус | Назначение |
|----|--------|------------|
| DU-1 | merged | Core design: архитектура, модель данных, форматы артефактов, инварианты, JSON schemas |
| DU-2 | draft | Реализация: extension, Plan Mode, Agent Mode, subagent spawner, git review flow |
| DU-3 | planned | Onboarding: scout, research, migration, rules catalog, architecture catalog |
| DU-4 | planned | Полировка: TUI widgets, localization guard, verification matrix, subagent config editor |

## Артефакты

- `task.json` — **Primary**. Задача в machine-readable формате.
- `plan.json` — **Primary**. План исполнения.
- `sdd.json` — **Primary**. Software Design Document в machine-readable формате.
- `artifacts/sdd.md` — Derivative. Человекочитаемый SDD.
- `artifacts/review-report.md` — Historical. Ревью v1.
- `artifacts/review-report-v2.md` — Ревью v2 (текущее).
- `artifacts/analysis-approaches.md` — Historical. Анализ подходов.
- `artifacts/pi-extension-design.md` — Historical. Первая итерация дизайна extension.
- `artifacts/analysis-stratum-v2.md` — Historical. Обсуждение субагентов и правил.
- `artifacts/loom-git-flow-design.md` — Исторический. Git-based review flow.

## Рабочий журнал

### 2026-05-21 — Инициализация
- Создан репозиторий.
- Сформулирована задача.
- Созданы README.md, AGENTS.md, начальная структура knowledge/.

### 2026-05-21 — Анализ подходов
- Изучены reference-файлы task-centric-knowledge.
- Проанализированы 3 варианта: за базу, с нуля, гибрид.
- Результат: гибрид.
- Артефакт: artifacts/analysis-approaches.md.

### 2026-05-21 — Дизайн Pi Extension
- Добавлен инвариант INV-7: Pi-Native Integration.
- Артефакт: artifacts/pi-extension-design.md.

### 2026-05-21 — Архитектурное обсуждение v2
- Правила, архитектура — JSON primary.
- Универсальные субагенты.
- Executor как приёмщик.
- Артефакт: artifacts/analysis-stratum-v2.md.

### 2026-05-21 — Архитектурное обсуждение v3 (loom)
- Название проекта: loom.
- Ревью через git diff.
- Tmux windows.
- Артефакт: artifacts/loom-git-flow-design.md.

### 2026-05-23 — Финализация архитектуры (SDD)
- Все обсуждения синтезированы в единый SDD.
- Артефакт: artifacts/sdd.md.

### 2026-05-23 — Устранение замечаний ревью v1
- Созданы JSON schemas.
- Созданы primary JSON-артефакты: task.json, plan.json, sdd.json.
- Обновлены derivative markdown.
- Интегрирован owned-text-localization-guard.
- Добавлен recovery strategy и error schema.
- Исправлены historical artifacts.
- Коммит: `c8e8b04` — staged через files-to-commit.json (INV-13).
- Review v2: `REV-2026-0001-step-2-iter-1.json` — verdict: approve, confidence 0.98.
