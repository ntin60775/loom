# Переносимый бэкап pi-окружения

Скрипты для полного переноса pi-окружения (навыки, расширения, конфиги, промпты, LLM-провайдеры, тема) на другую машину.

## Состав архива

| Категория | Что |
|---|---|
| Системный промпт | `~/.pi/agent/AGENTS.md` |
| LLM-провайдеры | `~/.pi/agent/models.json` (с API-ключами) |
| Настройки | `settings.json`, `auth.json` |
| Тема | `themes/gruvbox-dark-soft.json` |
| Утилиты | `bin/fd`, `bin/rg` |
| Расширения | `context7` (без кэша), `neuraldeep-transcribe`, `search.json`, `vision-agent.ts` |
| npm | `package.json` + `package-lock.json` (без `node_modules`) |
| **pi-search-hub** | Полная копия из `node_modules` (npm-версия битая) |
| Навыки | `playwright`, `screenshot`, `zip-context` |
| Контекст home | `agent-context.toml`, `AGENTS.md` |

### Исключено

- `sessions/` — история сессий
- `node_modules/*` (кроме `pi-search-hub`) — переустанавливается
- `extensions/context7/cache/` — переиндексируется
- `.bak` файлы

## Как запаковать (старая машина)

```bash
# Сделать скрипт исполняемым
chmod +x scripts/pi-backup.sh

# Запустить
bash scripts/pi-backup.sh

# Результат: pi-backup-2026-05-26.tar.gz
```

## Как развернуть (новая машина)

```bash
# 1. Убедиться что pi установлен
pi --version

# 2. Скопировать архив на новую машину
scp pi-backup-*.tar.gz user@new-machine:~

# 3. Запустить восстановление
bash scripts/pi-restore.sh pi-backup-2026-05-26.tar.gz

# 4. Проверить и при необходимости обновить API-ключи
nano ~/.pi/agent/models.json

# 5. Установить loom (если нужен)
git clone git@github.com:ntin60775/loom.git ~/dev/personal/pi/loom
pi install ~/dev/personal/pi/loom

# 6. Перезапустить pi
```

## ⚠️ Важно: API-ключи

Архив **содержит реальные API-ключи** из `models.json`. Храните архив в безопасном месте. При передаче через сеть используйте `scp` (шифрованный канал).

## Структура архива

```
pi-backup/
├── .pi/
│   ├── settings.json
│   └── agent/
│       ├── AGENTS.md
│       ├── models.json
│       ├── settings.json
│       ├── auth.json
│       ├── themes/
│       ├── bin/
│       ├── extensions/
│       └── npm/
│           ├── package.json
│           ├── package-lock.json
│           └── node_modules/
│               └── pi-search-hub/
├── .agents/
│   └── skills/
├── agent-context.toml
└── AGENTS.md
```
