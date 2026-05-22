# Loom — архитектура v3: git-based review, упрощённые графы, универсальные роли

## 1. Название: loom

Выбрано **loom** (станок). Из намерений и спеков плетётся продукт.

## 2. Графы — минимум

**Решение:** не строить сложные графовые структуры. Агент в любом случае будет грепать исходники напрямую.

**Что оставляем:**
- `knowledge/project/stack.json` — auto-detected: языки, фреймворки, build system
- `knowledge/modules/` — простой список модулей с базовыми метаданными:
  ```json
  {
    "id": "mod-auth",
    "path": "src/auth",
    "entry_points": ["src/auth/mod.rs"],
    "language": "rust",
    "dependencies": ["mod-core", "mod-db"],
    "status": "discovered"
  }
  ```
- **НЕТ:** графовых БД, сложных dependency graphs, force-directed layouts
- **Вместо этого:** агент при необходимости вызывает `find`/`grep`/`read` и строит ментальную модель на лету

## 3. Универсальные worker и reviewer

Worker и reviewer — не классы с фиксированным поведением, а **роли** в рамках универсального runtime.

```typescript
interface WorkerSpec {
  role: "worker";
  task: string;                    // что делать
  input_artifacts: string[];       // входные файлы
  constraints: string[];           // инварианты, правила
  output_dir: string;              // куда писать результат
}

interface ReviewerSpec {
  role: "reviewer";
  review_target: string;           // что ревьюить: git-commit-hash | file-path
  criteria: string[];              // по каким критериям
  output_file: string;             // куда писать review
}
```

**Worker может:**
- Писать код
- Писать документацию
- Проводить исследование
- Создавать конфиги
- Генерировать тесты
- Делать рефакторинг

**Reviewer может:**
- Ревьюить код
- Ревьюить документацию
- Ревьюить архитектурные решения
- Проверять исследования на полноту
- Валидировать конфигурации

**Специализация через prompt и model-config, не через код.**

## 4. Git-based review flow

### 4.1 Почему git-based

Пользователь: "зачем сессии, когда можно ревьюить через гит? Важны конечные артефакты."

**Решение:** review проходит через git-артефакты, не через live session.

### 4.2 Flow

```
Plan Mode (Orchestrator)
│
└─► finalize_plan → Agent Mode
    │
    ├─► Executor читает plan.json
    │
    ├─► Для каждого step:
    │   │
    │   ├─► Executor формирует WorkerSpec
    │   │
    │   ├─► spawn_worker(WorkerSpec)
    │   │   └─► Worker работает в tmux pane
    │   │   └─► Worker пишет файлы
    │   │   └─► Worker делает git commit:
    │   │       git add -A
    │   │       git commit -m "TASK-2026-XXXX step-N: описание"
    │   │   └─► Worker output: commit-hash + summary.json
    │   │
    │   ├─► Executor читает summary.json
    │   │
    │   ├─► Executor формирует ReviewerSpec
    │   │   - review_target: commit-hash
    │   │   - criteria: invariants + rules + plan-step-checklist
    │   │
    │   ├─► spawn_reviewer(ReviewerSpec)
    │   │   └─► Reviewer в tmux pane
    │   │   └─► Reviewer делает: git show <commit> --stat
    │   │   └─► Reviewer читает изменённые файлы
    │   │   └─► Reviewer пишет:
    │   │       knowledge/tasks/TASK-XXXX/reviews/REV-2026-XXXX-step-N-iter-M.json
    │   │
    │   ├─► Executor читает review.json
    │   │
    │   ├─► Решение:
    │   │   - approve → next step
    │   │   - reject → WorkerSpec с correction + iter+1
    │   │   - ambiguous → STOP, ask operator
    │   │
    │   └─► Проверка: iter > max_iterations (config, default 10)
    │       → STOP, ask operator
    │
    └─► Все steps done → verification → operator review
```

### 4.3 Формат review.json

```json
{
  "review_id": "REV-2026-0002-step-3-iter-1",
  "target": {
    "type": "git-commit",
    "commit": "abc1234",
    "task_id": "TASK-2026-0002"
  },
  "verdict": "reject",
  "criteria_checks": [
    {
      "criterion": "INV-3: Legacy compatibility",
      "status": "fail",
      "comment": "Новый код не обрабатывает legacy-формат данных из таблицы X"
    },
    {
      "criterion": "RULE-0005: Error handling",
      "status": "pass",
      "comment": "Все ошибки обёрнуты в Result"
    }
  ],
  "general_comments": [
    "Нужно добавить fallback для старых записей"
  ],
  "corrections": [
    {
      "file": "src/auth/legacy.rs",
      "description": "Добавить парсер для legacy-формата"
    }
  ],
  "confidence": 0.95,
  "reviewer_model": "deepseek/deepseek-chat:xhigh"
}
```

### 4.4 Для non-code задач

Если задача не про код:
- Worker создаёт артефакт-файл (например, `research-report.md`, `architecture-spec.json`)
- Reviewer читает файл + исходные требования
- Reviewer пишет review.json
- Executor принимает решение

**Git всё равно используется для версионирования артефактов.**

### 4.5 Почему это лучше session-based review

| Session-based review | Git-based review |
|---------------------|------------------|
| Reviewer видит процесс мышления worker | Reviewer видит только конечный результат |
| Контекст засорён промежуточными шагами | Чистый diff, чистый артефакт |
| Сложно повторить review | `git show` + `read` = воспроизводимо |
| Нет явного артефакта review | review.json — machine-readable evidence |
| Нельзя сравнить iter N и iter N+1 | `git diff iter-N..iter-N+1` |

## 5. Русификация

### 5.1 Где нужна русификация

- **System prompt**: русский для инструкций агенту
- **Артефакты**: task.json, plan.json — русский для человекочитаемых полей
- **UI widgets**: статусы на русском
- **Operator messages**: русский
- **Machine-verifiable markers**: русский? Нет, лучше английский (`INVARIANT:`, `CONTRACT:`) — они проверяются автоматически

### 5.2 Bilingual approach

```json
{
  "task_id": "TASK-2026-0002",
  "title": {
    "ru": "Система аутентификации",
    "en": "Authentication system"
  },
  "description": {
    "ru": "Реализовать JWT-аутентификацию с поддержкой legacy",
    "en": "Implement JWT authentication with legacy support"
  },
  "invariants": [
    {
      "id": "INV-1",
      "text": "Поддержка legacy-формата токенов",
      "marker": "INVARIANT: Legacy token format must be supported"
    }
  ]
}
```

**Machine literals — английский. Человекочитаемый слой — русский.**

## 6. Вкладки в текущем терминале

### 6.1 tmux windows в текущей сессии

```bash
# Loom extension запускает subagent:
tmux new-window -t "${TMUX_PARENT_SESSION}" -n "loom:scout" \
  "cd ${PROJECT} && pi --no-context-files --system-prompt-file ..."
```

Operator видит:
```
[0:loom] [1:bash*] [2:loom:scout] [3:loom:worker-1] [4:loom:review-1]
```

Может переключиться: `Ctrl+B + 2` → видит scout в реальном времени.

### 6.2 Без tmux

Если tmux не используется — fallback к простому запуску в background с логами в файл.

## 7. Ответы на открытые вопросы

### 7.1 Название
**loom** — принято.

### 7.2 Прогресс субагентов
**Нужен.** Worker/reviewer пишут progress-файл:
```json
{
  "subagent_id": "SUB-001",
  "status": "running",
  "progress": 0.7,
  "current_action": "Writing tests for auth module",
  "elapsed_seconds": 450
}
```
Executor читает progress через polling. TUI widget показывает статус.

### 7.3 Параллелизм
- **Plan mode**: параллельно, max 4 subagents (конфиг)
- **Agent mode**: строго последовательно, step за step

### 7.4 Human-in-the-loop
Executor останавливается ТОЛЬКО когда без человека никак:
- Reviewer reject + max_iterations достигнут
- Timeout worker/reviewer
- Неопределённость в review (ambiguity)
- Worker не может выполнить step (блокер)
- Plan step не имеет clear definition

**Во всех остальных случаях Executor действует автономно.**

## 8. Обновлённая структура знаний

```
knowledge/
├── tasks/
│   ├── TASK-2026-0001-bootstrap/
│   │   ├── task.json
│   │   ├── plan.json
│   │   ├── sdd.json
│   │   ├── worklog.json
│   │   ├── artifacts/
│   │   └── reviews/
│   │       └── REV-2026-0001-step-1-iter-1.json
│   └── registry.json
├── project/
│   ├── rules/
│   │   ├── RULE-2026-0001-naming-functions.json
│   │   └── RULE-2026-0002-error-handling.json
│   ├── architecture/
│   │   ├── overview.json
│   │   └── components/
│   ├── stack.json
│   ├── decisions.json
│   ├── conventions.json
│   ├── execution-config.json
│   └── subagent-config.json
└── operations/
    └── loom-upgrade.json
```

## 9. Git flow встроенный в процесс

### 9.1 Ветки

- `main` — базовая ветка
- `task/TASK-XXXX-slug` — рабочая ветка задачи
- `du/TASK-XXXX-uNN-slug` — ветка delivery unit (если нужна)

### 9.2 Коммиты

Worker делает task-scoped commits:
```bash
git commit -m "TASK-2026-0002 step-3: implement JWT handler

- Add JWT validation
- Add RS256 signature check
- Add token refresh endpoint

INVARIANT: Legacy token format preserved
RULE-0005: All errors wrapped in Result"
```

### 9.3 Review = git + knowledge/

Reviewer работает с git-артефактами:
```bash
git show abc1234 --stat          # что изменилось
git diff HEAD~1 -- src/auth/     # детальный diff
cat knowledge/tasks/TASK-0002/task.json  # инварианты
```

Результат — файл в `knowledge/tasks/TASK-XXXX/reviews/`.

### 9.4 Finalize

После всех steps:
```bash
# Executor делает:
git log --oneline task/TASK-0002  # показать всю историю
# Verification matrix run
# Update task status
```

## 10. Loom extension MVP scope

### Фаза 0: Core (DU-1)
1. `/plan` command — plan mode entry
2. `create_task` tool — task.json
3. `create_plan` tool — plan.json
4. `finalize_plan` tool — auto-switch to agent mode + clean session proposal
5. `spawn_subagent` tool — tmux window + pi
6. `git_commit_task` tool — task-scoped commit
7. Status widget — [PLAN] / [AGENT] + current task

### Фаза 1: Execution (DU-2)
1. `spawn_worker` tool — worker subagent in tmux
2. `spawn_reviewer` tool — reviewer subagent in tmux
3. Git-based review flow — review.json format
4. Iteration loop — approve / reject / max-iter
5. Progress polling — subagent progress.json

### Фаза 2: Knowledge (DU-3)
1. Rules catalog — /add_rule, /rule-list
2. Architecture catalog
3. Auto-extraction — propose rules from code
4. Onboarding — scout + migration subagents

### Фаза 3: Polish (DU-4)
1. Custom TUI widget for subagents
2. Russian localization
3. Reviewer model auto-selection
4. Subagent config editor
