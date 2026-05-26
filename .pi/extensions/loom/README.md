# loom — AI-Native Development Environment (pi extension)

`loom-extension` — расширение для [pi](https://github.com/earendil-works/pi-coding-agent), реализующее трёхрежимную AI-Native среду разработки: **idle → plan → agent**.

## Установка

```bash
pi install npm:loom-extension
```

## Команды

| Команда | Описание |
|---------|---------|
| `/plan [desc]` | Вход в Plan Mode — брейншторм, декомпозиция, артефакты |
| `/agent` | Вход в Agent Mode — исполнение по плану |
| `/loom-init` | Инициализация loom в проекте |
| `/task-status` | Статус текущей задачи |
| `/rule-add` / `/rule-list` | Управление правилами проекта |
| `/arch-add` / `/arch-list` | Управление архитектурными компонентами |
| `/subagents` | Список активных субагентов |
| `/subagent-focus <id>` | Детали субагента |
| `/subagent-kill <id>` | Прервать субагента |
| `/loom-config` | Редактировать конфигурацию |
| `/verify-matrix` | Проверка инвариантов |

**Шорткат:** `alt+m` — циклическое переключение режимов.

## Режимы

- **idle** — базовые инструменты, инспекция, администрирование
- **plan** — создание задач, планов, onboarding, исследование кодовой базы
- **agent** — последовательное исполнение шагов плана через worker → reviewer

## API

Расширение регистрирует инструменты (`loom_*`) и команды (`/plan`, `/agent`, ...) через ExtensionAPI.

## Лицензия

Apache-2.0
