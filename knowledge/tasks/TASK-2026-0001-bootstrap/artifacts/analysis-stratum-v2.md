# Анализ архитектуры v2 — обсуждение требований

## 1. Название — дополнительные варианты

Требование: название должно отражать не только знания, но планирование, исполнение, оркестрацию.

| Название | Этимология | Почему подходит |
|----------|-----------|-----------------|
| **stratum** | слой, пласт | Слои знаний, стратификация legacy |
| **mnemos** | память (Mnemosyne) | Накопление знаний между задачами |
| **keel** | киль корабля | Основа, на которой строится всё |
| **archon** | архонт, управляющий | Оркестратор агентов |
| **cadence** | каденция, ритм | Ритм plan → execute → review |
| **tandem** | тандем | Совместная работа human + AI |
| **nexus** | связь, узел | Точка сопряжения human intent и AI execution |
| **loom** | станок | Плетение кода из спеков и контекста |
| **forge** | кузница | Место, где из намерения куётся продукт |
| **helm** | штурвал | Оператор направляет, агент исполняет |
| **axiom** | аксиома | Базовые инварианты, на которых строится всё |
| **cortex** | кора головного мозга | Центр обработки, оркестрация |

Мои фавориты: **helm** (оператор держит штурвал), **forge** (из намерения → продукт), **cortex** (оркестрация + память).

---

## 2. JSON Schema для правил и архитектуры

### 2.1 Правило проекта (Project Rule)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProjectRule",
  "type": "object",
  "required": ["id", "category", "title", "body", "source", "created_at", "status"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Machine-readable ID: RULE-2026-0001-naming-functions"
    },
    "category": {
      "type": "string",
      "enum": ["naming", "error-handling", "testing", "api-design", "dependencies", "style", "security", "performance", "documentation", "git", "other"],
      "description": "Тематическая категория"
    },
    "title": {
      "type": "string",
      "description": "Краткое название правила"
    },
    "body": {
      "type": "string",
      "description": "Полный текст правила. Machine-verifiable markers: INVARIANT, CONTRACT, PRE, POST, SCOPE"
    },
    "scope": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Области применения: ["backend", "frontend", "1c", "infra"]"
    },
    "source": {
      "type": "object",
      "required": ["type", "ref"],
      "properties": {
        "type": {"enum": ["operator", "auto-extracted", "agent-decision", "migration"]},
        "ref": {"type": "string", "description": "TASK-ID или commit hash или 'onboarding'"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1}
      }
    },
    "status": {
      "type": "string",
      "enum": ["proposed", "active", "deprecated", "rejected"],
      "default": "proposed"
    },
    "evidence": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Ссылки на код или задачи, подтверждающие правило"
    },
    "created_at": {"type": "string", "format": "date"},
    "updated_at": {"type": "string", "format": "date"},
    "version": {"type": "integer", "default": 1}
  }
}
```

**Хранение:** `knowledge/project/rules/RULE-2026-0001-naming-functions.json`

**Команды:**
- `/rule-add <category> <title>` — operator явно добавляет
- `/rule-propose` — агент предлагает на основе наблюдений
- `/rule-approve <id>` / `/rule-reject <id>` — operator решает
- `/rule-list [category]` — список активных правил

**Эвристика:** Если operator говорит "добавь правило проекта", "запомни, что...", "правило: ..." — агент автоматически вызывает `add_rule` tool с `source.type = "operator"`, `status = "active"` (operator = доверенный источник, skip `proposed`).

### 2.2 Архитектурный компонент

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ArchitectureComponent",
  "type": "object",
  "required": ["id", "name", "layer", "responsibilities", "interfaces", "dependencies", "status"],
  "properties": {
    "id": {"type": "string"},
    "name": {"type": "string"},
    "layer": {
      "type": "string",
      "enum": ["domain", "application", "infrastructure", "presentation", "external"]
    },
    "responsibilities": {"type": "array", "items": {"type": "string"}},
    "interfaces": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "type": {"enum": ["api", "event", "db", "file", "cli"]},
          "contract": {"type": "string"},
          "consumers": {"type": "array", "items": {"type": "string"}}
        }
      }
    },
    "dependencies": {
      "type": "array",
      "items": {"type": "string"},
      "description": "ID других компонентов"
    },
    "files": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Ключевые файлы компонента"
    },
    "invariants": {
      "type": "array",
      "items": {"type": "string"}
    },
    "status": {"enum": ["discovered", "verified", "deprecated"]},
    "source": {
      "type": "object",
      "properties": {
        "type": {"enum": ["auto-detected", "agent-documented", "operator-defined"]},
        "ref": {"type": "string"}
      }
    }
  }
}
```

**Хранение:** `knowledge/project/architecture/components/<id>.json`
**Связи:** `knowledge/project/architecture/dependencies.json` — граф зависимостей

---

## 3. Универсальные субагенты — архитектура

### 3.1 Принцип: Subagent = Universal Runtime + Orchestrator Prompt + Model Config

Субагент — это не класс с фиксированным поведением. Субагент — это **процесс pi** со следующим контрактом:

```typescript
interface SubagentSpec {
  // Идентификация
  id: string;                    // SUB-2026-0001
  role: string;                  // "scout", "architect", "reviewer", "worker"
  
  // Модель
  model: {
    provider: string;            // "deepseek", "kimi", "anthropic"
    id: string;                  // "deepseek-chat", "kimi-coding"
    thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  };
  
  // Контекст
  systemPrompt: string;          // Стартовый prompt от оркестратора
  skills: string[];              // Какие skills загрузить
  tools: string[];               // Какие tools доступны (read, bash, write, ...)
  
  // Вход
  inputArtifact: string;         // Путь к JSON-файлу с заданием
  
  // Выход
  outputArtifact: string;        // Путь к JSON-файлу с результатом
  
  // Ограничения
  maxTokens?: number;
  timeout?: number;              // секунд
  maxIterations?: number;
}
```

**Конфигурация моделей для ролей** (не хардкод, а `knowledge/project/subagent-config.json`):

```json
{
  "defaults": {
    "scout": {"provider": "deepseek", "model": "deepseek-chat", "thinking": "xhigh"},
    "researcher": {"provider": "deepseek", "model": "deepseek-reasoner", "thinking": "xhigh"},
    "reviewer-general": {"provider": "deepseek", "model": "deepseek-chat", "thinking": "xhigh"},
    "reviewer-1c": {"provider": "kimi", "model": "kimi-for-coding", "thinking": "high"},
    "worker": {"provider": "deepseek", "model": "deepseek-chat", "thinking": "medium"}
  },
  "overrides": {
    // Operator может переопределить для конкретной задачи
  }
}
```

### 3.2 Запуск субагента

Оркестратор вызывает tool `spawn_subagent(spec: SubagentSpec)`:

1. Extension формирует tmux command:
   ```bash
   tmux new-window -n "SUB-${id}" \
     "pi --mode json \
        --system-prompt-file ${tmp_prompt_file} \
        --skill ${skills.join(' --skill ')} \
        --tools ${tools.join(' --tools ')} \
        --model ${model.provider}/${model.id}:${model.thinking} \
        --session-dir ${project}/.pi/subagent-sessions/${id} \
        --no-context-files \
        -p 'Execute task from ${inputArtifact}, write result to ${outputArtifact}'"
   ```

2. Extension следит за процессом:
   - PID monitoring
   - Output file polling
   - Timeout enforcement

3. По завершении:
   - Чтение `outputArtifact`
   - Валидация JSON schema
   - Возврат результата оркестратору
   - Удаление tmux window (или сохранение для аудита)

### 3.3 Виды субагентов (роли)

| Роль | Когда запускается | Что делает | Output |
|------|------------------|------------|--------|
| **scout** | Onboarding, plan mode | Исследует codebase, строит карты | `modules/`, `stack.json` |
| **researcher** | Plan mode | Исследует контекст, анализирует | `context-research.json` |
| **architect** | Plan mode | Проектирует решение | `subagents/architect.json` |
| **risk-analyst** | Plan mode | Находит риски и edge cases | `subagents/risks.json` |
| **worker** | Agent mode | Выполняет один пункт плана | `artifacts/worker-result.json` |
| **reviewer** | Agent mode | Проверяет результат worker | `artifacts/review-result.json` |
| **migrator** | Onboarding | Анализирует старые системы задач | `migration-analysis.json` |

**Ключевое:** Разница между scout и researcher — только в prompt и модели. Runtime одинаковый.

---

## 4. Executor как оркестратор-надзиратель-приёмщик

### 4.1 Flow исполнения задачи

```
Agent Mode: Executor (Оркестратор)
│
├─► Читает plan.json
│
├─► Для каждого step в plan:
│   │
│   ├─► Формирует worker-spec
│   │   - role: "worker"
│   │   - systemPrompt: "Execute step N: {step.description}. Follow invariants: {...}"
│   │   - input: step + relevant context
│   │
│   ├─► spawn_subagent(worker-spec) → tmux window
│   │   - Worker работает с codebase
│   │   - Worker пишет код, тесты, доку
│   │   - Worker output: git diff + summary
│   │
│   ├─► Worker завершился
│   │   - Executor читает output
│   │   - git add + git diff --check
│   │
│   ├─► Формирует review-spec
│   │   - role: "reviewer"
│   │   - model: из config (deepseek flash xhigh / kimi for 1c)
│   │   - input: diff + invariants + rules
│   │
│   ├─► spawn_subagent(review-spec) → tmux window
│   │   - Reviewer проверяет код
│   │   - Reviewer output: approve / reject + замечания
│   │
│   ├─► Executor принимает решение:
│   │   - approve → git commit, update worklog, next step
│   │   - reject → формирует correction-spec → spawn worker (iteration + 1)
│   │
│   └─► Проверка max_iterations (default: 10)
│       - Если превышено → STOP, поднять operator
│
└─► Все steps завершены
    - Run verification matrix
    - Update task status → "на проверке"
    - Предложить operator review
```

### 4.2 Конфигурация review и iteration limits

`knowledge/project/execution-config.json`:

```json
{
  "review": {
    "enabled": true,
    "max_iterations": 10,
    "reviewers": {
      "default": {"provider": "deepseek", "model": "deepseek-chat", "thinking": "xhigh"},
      "1c": {"provider": "kimi", "model": "kimi-for-coding", "thinking": "high"},
      "security": {"provider": "anthropic", "model": "claude-sonnet-4", "thinking": "high"}
    },
    "auto_select_reviewer": {
      "enabled": true,
      "rules": [
        {"pattern": "*.1s", "reviewer": "1c"},
        {"pattern": "*.rs", "reviewer": "default"},
        {"pattern": "*auth*", "reviewer": "security"}
      ]
    }
  },
  "worker": {
    "timeout": 3600,
    "max_tokens": 128000
  }
}
```

### 4.3 Executor не пишет код

**Инвариант:** Executor — это orchestrator. Он:
- Читает план
- Запускает worker
- Запускает reviewer
- Принимает решения
- Обновляет статусы
- Но **не модифицирует файлы напрямую**

Все модификации — через worker subagent или через явные tools (git_commit, update_task_status).

---

## 5. Аудит субагентов без полных сессий

### 5.1 Проблема

Полная сессия subagent (JSONL) = тысячи записей, десятки тысяч токенов. Аудит всей сессии невозможен.

### 5.2 Решение: Structured Audit Trail

Каждый subagent пишет не только `outputArtifact`, но и `auditTrailArtifact`:

```json
{
  "subagent_id": "SUB-2026-0001",
  "role": "worker",
  "task_ref": "TASK-2026-0002-auth",
  "step_ref": "step-3",
  "iteration": 1,
  
  "timeline": [
    {
      "timestamp": "2026-05-21T14:30:00Z",
      "event": "started",
      "context_size_tokens": 15000
    },
    {
      "timestamp": "2026-05-21T14:35:00Z",
      "event": "tool_call",
      "tool": "read",
      "target": "src/auth/mod.rs",
      "reason": "Understanding current auth module"
    },
    {
      "timestamp": "2026-05-21T14:40:00Z",
      "event": "tool_call",
      "tool": "write",
      "target": "src/auth/jwt.rs",
      "reason": "Implementing JWT handler"
    },
    {
      "timestamp": "2026-05-21T14:50:00Z",
      "event": "decision",
      "description": "Chose RS256 over HS256 due to key rotation requirements",
      "alternatives_considered": ["HS256"]
    },
    {
      "timestamp": "2026-05-21T14:55:00Z",
      "event": "completed",
      "result_summary": "Implemented JWT auth with RS256",
      "files_changed": ["src/auth/jwt.rs", "src/auth/mod.rs", "tests/auth_test.rs"]
    }
  ],
  
  "decisions": [
    {
      "id": "DEC-1",
      "description": "Chose RS256 over HS256",
      "rationale": "Key rotation requirements from INV-3",
      "alternatives": ["HS256", "ES256"],
      "confidence": 0.9
    }
  ],
  
  "errors": [],
  "warnings": [
    {"message": "No tests for edge case: expired token", "severity": "medium"}
  ],
  
  "tokens_used": 45000,
  "cost_usd": 0.12,
  "duration_seconds": 1500
}
```

**Хранение:** `knowledge/tasks/TASK-ID/subagents/SUB-XXXX-audit.json`

### 5.3 Как это решает аудит

| Что нужно проверить | Где искать |
|---------------------|-----------|
| Какие файлы менялись | `audit.timeline` → `tool_call` events |
| Почему принято решение X | `audit.decisions` |
| Были ли ошибки | `audit.errors` |
| Сколько стоило | `audit.tokens_used`, `audit.cost_usd` |
| Сколько заняло | `audit.duration_seconds` |
| Полный ход мыслей | Только если нужно — полная сессия в `.pi/subagent-sessions/` (хранится N дней, потом cleanup) |

**Operator может:**
- Читать audit trail (структурированный, короткий)
- При необходимости — запросить полную сессию (но это редкий случай)

### 5.4 Cleanup policy

```json
{
  "session_retention": {
    "subagent_sessions": "7 days",
    "audit_trails": "permanent",
    "output_artifacts": "permanent"
  }
}
```

---

## 6. UI для субагентов

### 6.1 Фаза 1: tmux windows (MVP)

```bash
# Оркестратор запускает:
tmux new-window -n "stratum:scout" "pi ..."
tmux new-window -n "stratum:worker-1" "pi ..."
tmux new-window -n "stratum:review-1" "pi ..."
```

Operator видит в tmux status bar:
```
[main] [stratum:scout] [stratum:worker-1] [stratum:review-1]
```

Может переключиться: `Ctrl+B + 2` → видит worker в реальном времени.

### 6.2 Фаза 2: Custom TUI Widget

Extension добавляет widget в pi TUI:

```
┌─ Subagents ───────────────────────────┐
│ ID        ROLE      STATUS    MODEL   │
│ SUB-001   scout     running   ds/xhigh│
│ SUB-002   worker    done      ds/high │
│ SUB-003   review    pending   ds/xhigh│
└───────────────────────────────────────┘
```

Команды:
- `/subagents` — показать widget
- `/subagent-focus <id>` — переключиться в tmux window subagent
- `/subagent-kill <id>` — остановить subagent

### 6.3 TUI для Executor

```
┌─ Task: TASK-2026-0002-auth ───────────┐
│ Mode: AGENT | Step: 2/5 | Iter: 1/10  │
│                                       │
│ [✓] Step 1: Analyze current auth      │
│ [→] Step 2: Implement JWT handler     │
│ [ ] Step 3: Add token refresh         │
│ [ ] Step 4: Write tests               │
│ [ ] Step 5: Update docs               │
│                                       │
│ Worker: SUB-004 (running, 5m elapsed) │
└───────────────────────────────────────┘
```

---

## 7. Чистая сессия при переходе plan → agent

### Почему

Plan mode сессия может быть очень длинной (брейншторм, запуск subagents, обсуждение). Контекст заполнен планировочным мусором. Для чистого исполнения нужна свежая сессия.

### Как

При `finalize_plan`:
1. Extension сохраняет все артефакты в `knowledge/`
2. Extension вызывает `ctx.newSession()` или предлагает operator:
   ```
   [aide] Plan finalized. Start execution in clean session?
   1. Yes, new session with task context
   2. Continue in current session
   3. Review plan first
   ```
3. Новая сессия:
   - Загружает `task.json`, `plan.json` как context
   - System prompt: agent mode
   - Готов к `run step 1`

---

## 8. Итоговая архитектура системы

```
pi + stratum extension
│
├─► Plan Mode (Orchestrator)
│   │
│   ├─► /plan command
│   ├─► System prompt: planning guidelines
│   ├─► Tools: create_task, create_plan, create_sdd, add_invariant,
│   │         add_delivery_unit, spawn_subagent, finalize_plan
│   │
│   ├─► Scout Subagent (tmux)
│   │   └─► Output: modules/, stack.json
│   │
│   ├─► Researcher Subagent (tmux)
│   │   └─► Output: context-research.json
│   │
│   ├─► Architect Subagent (tmux)
│   │   └─► Output: subagents/architect.json
│   │
│   └─► finalize_plan → knowledge/ + markdown derivative
│
├─► Transition: clean session proposal
│
└─► Agent Mode (Executor)
    │
    ├─► System prompt: agent guidelines + task context
    ├─► Tools: read_task, update_status, spawn_subagent, git_commit
    │
    ├─► For each plan step:
    │   │
    │   ├─► Worker Subagent (tmux)
    │   │   └─► Output: code changes + audit trail
    │   │
    │   ├─► Reviewer Subagent (tmux)
    │   │   └─► Output: approve / reject + comments
    │   │
    │   └─► Executor decision: commit / retry / escalate
    │
    └─► Verification → operator review

Knowledge Storage:
  knowledge/
  ├── tasks/TASK-XXXX/task.json
  ├── tasks/TASK-XXXX/plan.json
  ├── tasks/TASK-XXXX/sdd.json
  ├── tasks/TASK-XXXX/subagents/
  ├── project/rules/
  ├── project/architecture/
  ├── project/stack.json
  └── project/execution-config.json
```

---

## 9. Открытые вопросы

1. **Название**: Какое из предложенных? Или ещё варианты?
2. **Subagent communication**: Нужен ли канал "subagent → orchestrator" для mid-flight updates, или только финальный output?
3. **Parallel execution**: Несколько worker subagents параллельно для независимых steps? Или строго последовательно?
4. **Human-in-the-loop в executor**: Executor останавливается перед каждым step? Только при reject? Только по таймауту?
