# TUI-карточки: заимствование лучших UX-паттернов omp для loom

**Task ID:** TASK-2026-0016-tui-cards

**Status:** active
**Priority:** high
**Branch:** task/TASK-2026-0016-tui-cards

## Description

Реализовать TUI-рендеринг субагентов и инструментов loom в виде цветных карточек с tree-коннекторами, статус-иконками, строкой статистики, expand/collapse по Ctrl+O и единым стилем для всех инструментов. Заимствованы лучшие UX-паттерны проекта oh-my-pi (omp) — форка pi с продвинутым TUI.

Текущее состояние: инструменты выводят plain text. Субагенты шлют текстовые обновления через onUpdate. Нет визуальной иерархии, нет свёртки/развёртки, нет единого стиля.

Архитектурное решение: остаёмся на pi + loom, заимствуем избранные фичи omp как renderCall/renderResult в pi-расширении.

## Invariants

- **INV-5**: TUI widgets do not allow code editing; operator interacts via commands and read-only reports
- **INV-9**: Executor tools: spawn_worker, spawn_reviewer, update_task_status, read_artifact. NO write/edit/commit in executor tools
- **INV-12**: UI and user-facing artifacts — Russian; AI documentation — English; machine markers — English

## Delivery Units

- **DU-1**: Оператор видит дерево всех активных субагентов, их прогресс и статистику без скроллинга простыни текста (status: pending)
- **DU-2**: Компактный обзор в свёрнутом виде, детали по запросу. Терминал не забивается (status: pending)
- **DU-3**: Консистентный визуальный язык для всех операций loom (status: pending)
- **DU-4**: Оператор мгновенно видит самые критичные проблемы, не читая весь отчёт (status: pending)
- **DU-5**: Оператор видит изменения до того как инструмент выполнится. Снижение "wat" моментов (status: pending)
- **DU-6**: Зелёные E2E-тесты, покрывающие всю цепочку. Тесты детерминированы (используют моки для pi CLI вызовов) (status: pending)

---

*Generated from task.json*
