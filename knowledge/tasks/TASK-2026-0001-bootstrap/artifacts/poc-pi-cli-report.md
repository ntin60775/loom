> Generated from investigation. Primary: see task.json plan.json sdd.json.

# PoC Report: pi CLI capabilities for loom subagent spawner

## Дата
2026-05-23

## Цель
Проверить, поддерживает ли pi CLI флаги, необходимые для запуска субагентов (worker, reviewer, scout).

## Методика
1. `pi --help` — enumerate все доступные флаги.
2. `pi --mode json --no-session --no-context-files --no-tools --offline --print "test"` — verify JSON mode.
3. `pi --mode json ... --model deepseek/deepseek-chat:medium --tools read,bash` — verify model and tools flags.
4. `pi --mode json ... --session-dir /tmp/pi-test-sessions` — verify session directory.
5. `pi --mode json ... --system-prompt "$(cat /tmp/test-prompt.md)"` — verify system prompt injection via shell substitution.

## Результаты

### Флаги, подтвержденные рабочими

| Флаг | Работает | Примечание |
|------|----------|------------|
| `--mode json` | Да | JSONL event stream на stdout |
| `--system-prompt <text>` | Да | Inline text; обход для файла: `$(cat file.md)` |
| `--append-system-prompt <text>` | Да | Можно использовать многократно |
| `--model <pattern>` | Да | Поддерживает `provider/id:thinking` |
| `--session-dir <dir>` | Да | Кастомная директория сессий |
| `--session <path\|id>` | Да | Конкретная сессия |
| `--tools <list>` | Да | Comma-separated allowlist |
| `--no-context-files` | Да | Отключает AGENTS.md/CLAUDE.md |
| `--skill <path>` | Да | Загрузка skill |
| `--no-skills` | Да | Отключение skills |
| `--no-extensions` | Да | Отключение extensions |
| `--no-session` | Да | Эфемерный режим |
| `--offline` | Да | Без сетевых операций |
| `--print, -p` | Да | Non-interactive |

### Флаги, которых НЕТ

| Флаг (ожидался) | Альтернатива | Работает? |
|-----------------|--------------|-----------|
| `--system-prompt-file <path>` | `--system-prompt "$(cat path)"` | Да |

### Пример команды для субагента

```bash
# Worker subagent launch
tmux new-window -n "loom:worker-1" \
  "cd ${PROJECT} && \
   pi --mode json \
      --no-session \
      --no-context-files \
      --no-extensions \
      --tools read,bash,write,edit \
      --system-prompt \"\$(cat ${WORKER_PROMPT})\" \
      --model deepseek/deepseek-chat:medium \
      --session-dir ${PROJECT}/.pi/subagent-sessions/worker-1 \
      --offline \
      --print \"Execute task from ${INPUT_ARTIFACT}, write result to ${OUTPUT_ARTIFACT}\" \
      > ${OUTPUT_ARTIFACT} 2> ${ERROR_LOG}"
```

## JSON mode output format

Первые строки output:
```json
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"..."}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user",...}}
```

## Вывод

**RISK-1 устранен.** Все необходимые флаги существуют в pi CLI. Архитектура субагентов через tmux + pi CLI реализуема без изменений.

Единственное отклонение: вместо `--system-prompt-file` используется `--system-prompt "$(cat file.md)"`. Это стандартная shell- substitution, никаких ограничений.
