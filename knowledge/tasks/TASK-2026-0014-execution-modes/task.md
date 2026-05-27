# DU-1: Dual execution mode — agent-direct (≤3 шага) + subagent×2 (≥4 шага)

**Task ID:** TASK-2026-0014-execution-modes

**Status:** active
**Priority:** high
**Branch:** task/TASK-2026-0014-execution-modes

## Description

Два режима исполнения плана:
1. Agent-direct: ≤3 шага — агент делает всё сам, без спавна worker/reviewer. Использует свои тулы (read, write, edit, bash). Коммитит по files-to-commit.json. Человек ревьюит итог.
2. Subagent×2: ≥4 шага — текущий флоу worker → reviewer → executor loop.

Выбор режима — автоматический по количеству шагов в плане. Опционально: ручное переопределение в task.json.

## Invariants

- **INV-9**: Executor не пишет код в subagent-режиме; в direct-режиме агент пишет код сам
- **INV-11**: Строгая последовательность: в subagent-режиме mutex, в direct-режиме — естественная последовательность шагов

## Delivery Units

- **DU-1**: Agent-direct execution: агент делает шаги сам, без worker/reviewer spawn (status: draft)
- **DU-2**: Subagent×2 hardening: structured output, persistent registry, retry+backoff, configurable toolsets (status: draft)

---

*Generated from task.json*
