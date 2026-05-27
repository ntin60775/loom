# Plan: DU-1: Dual execution mode — agent-direct (≤3 шага) + subagent×2 (≥4 шага)

**Task ID:** TASK-2026-0014-execution-modes

## Steps

1. **Execution mode selection** — Добавить поле execution_mode в task.json схему (auto | direct | subagent). Логика выбора: plan.steps.length ≤ 3 → direct, иначе subagent. Опциональное ручное переопределение.
   - Expected: Обновлённый knowledge/schemas.ts (task schema + execution_mode). Обновлённый agent-mode/executor.ts — resolveExecutionMode().
   - Effort: small
   - Status: pending

2. **Agent-direct executor loop** — Новый executor-loop для direct-режима. Агент получает plan.steps, для каждого шага:
- читает step.description и expected_output
- реализует в текущей сессии (write/edit/bash)
- обновляет files-to-commit.json
- коммитит
- отмечает step.status = done
Переход к следующему шагу. В конце — mark task completed.

Важно: в direct-режиме spawn_worker/spawn_reviewer НЕ вызываются. INV-9: «executor не пишет код» — обновлён для разрешения в direct-режиме.
   - Expected: Обновлённый agent-mode/executor.ts и agent-mode/executor-loop.ts с веткой direct-режима. Новый промпт для direct-исполнения.
   - Effort: medium
   - Status: pending

3. **Subagent×2 hardening** — Улучшения для существующего subagent-режима:
- JSON Schema валидация output'а субагентов (вместо regex markdown)
- Persistent registry subagent'ов (knowledge/project/subagents/registry.json)
- Exponential backoff retry при reject (множитель и jitter из execution-config)
- Configurable toolsets для worker/reviewer через subagent-config.json

Не зависит от DU-1. Может разрабатываться параллельно.
   - Expected: Обновлённый plan-mode/tools.ts (runOnboardingSubagent). Обновлённый agent-mode/tools.ts (spawn_worker/spawn_reviewer). Новый knowledge/project/subagents/registry.json. Обновлённый execution-config.json (retry). Обновлённый subagent-config.json (worker.tools, reviewer.tools).
   - Effort: large
   - Status: pending

---

*Generated from plan.json*
