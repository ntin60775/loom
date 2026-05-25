# Data Model: Memory Layer (4 дорожки)

> Артефакт шага 1 задачи TASK-2026-0008-memory-layer.

## Обзор

Memory layer loom v2 использует единый формат записи — `MemoryEntry` — с полиморфным полем `content`, зависящим от дорожки.

## MemoryEntry (общий формат)

```json
{
  "entry_id": "uuid-v4",
  "task_id": "TASK-YYYY-NNNN | null",
  "step_number": 1 | null,
  "timestamp": "2026-05-24T12:00:00Z",
  "track_type": "session | episodic | semantic | procedural",
  "content": { /* track-specific */ },
  "relevance_score": 0.85,
  "source_ref": "path/to/file.ts или tool-call-id",
  "tags": ["tag1", "tag2"],
  "created_at": "2026-05-24T12:00:00Z",
  "updated_at": "2026-05-24T12:00:00Z",
  "expires_at": "2026-05-24T13:00:00Z | null",
  "access_count": 0,
  "last_accessed_at": null
}
```

### Обязательные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `entry_id` | string (uuid) | Уникальный идентификатор записи |
| `timestamp` | string (ISO 8601) | Момент создания |
| `track_type` | enum | Дорожка памяти |
| `content` | object | Полезная нагрузка (shape по дорожке) |
| `relevance_score` | number [0,1] | Релевантность для ранжирования |
| `source_ref` | string | Источник данных |

### Служебные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `task_id` | string \| null | Привязка к задаче (null = глобальная) |
| `step_number` | integer \| null | Номер шага плана (для episodic) |
| `tags` | string[] | Теги для кросс-запросов |
| `expires_at` | string \| null | TTL для session / retention policy |
| `access_count` | integer | Частота обращений (frequency scoring) |
| `last_accessed_at` | string \| null | Последнее обращение (freshness scoring) |

## Дорожки

### 1. Session Track
**Назначение:** кратковременный контекст текущей сессии.  
**Хранилище:** in-memory (не персистентно).  
**TTL:** сессия или явный `expires_at`.  

```json
"content": {
  "role": "user | assistant | system | tool",
  "message": "текст сообщения",
  "tool_calls": [],
  "session_id": "session-uuid"
}
```

### 2. Episodic Store
**Назначение:** события и решения по задачам.  
**Хранилище:** `knowledge/tasks/{task_id}/artifacts/memory-episodic.json`.  
**Индексация:** по `task_id`, `step_number`, `timestamp`.  

```json
"content": {
  "event": "что произошло",
  "decision": "решение агента",
  "outcome": "success | failure | partial | blocked",
  "affected_files": ["path1.ts", "path2.ts"],
  "invariants_checked": ["INV-1", "INV-4"]
}
```

### 3. Semantic Store
**Назначение:** факты, правила, архитектурные компоненты.  
**Хранилище:** `knowledge/project/memory/semantic.json`.  
**Источники:** `rules/`, `architecture/`, invariants задач.  

```json
"content": {
  "fact": "утверждение",
  "category": "rule | architecture | invariant | convention | dependency | domain",
  "confidence": 1.0,
  "domain": "optional-tag"
}
```

### 4. Procedural Store
**Назначение:** проверенные практики и паттерны из закрытых задач.  
**Хранилище:** `knowledge/project/memory/procedural.json`.  
**Извлечение:** ручное на старте, авто — deferred.  

```json
"content": {
  "pattern": "Когда X, делай Y",
  "context": "ситуации применения",
  "validation_status": "draft | validated | deprecated | rejected",
  "origin_task_id": "TASK-YYYY-NNNN | null",
  "usage_count": 0
}
```

## Relevance Scoring

Формула (v1):
```
relevance = α * freshness + β * frequency + γ * explicit_rating
```

- `freshness = exp(-λ * (now - last_accessed_at))`
- `frequency = normalize(access_count)`
- `explicit_rating` — оценка оператора [0,1], по умолчанию 0.5

Коэффициенты конфигурируются в `execution-config.json` → `memory.relevance_weights`.

## Retention Policy

| Параметр | Описание |
|----------|----------|
| `max_entries_per_track` | Жёсткий лимит записей на дорожку |
| `max_age_days` | Максимальный возраст записи |
| `min_relevance` | Минимальный relevance_score для хранения |

При превышении threshold — compaction (summarization + удаление низкорелевантных).

## Token Budget

Context Assembler собирает контекст по приоритету:
1. Semantic (high)
2. Episodic (medium)
3. Procedural (medium-low)
4. Session (low, но свежие записи — boost)

При превышении budget — truncation с lossy summarization для низкоприоритетных дорожек.

## Invariants

- **INV-1:** Memory layer активен — система сама решает что запомнить/забыть/подсунуть.
- **INV-4:** Детерминированный контекст — сборка явная, нет скрытого состояния.
- **INV-5:** Task-Centric — память привязана к задачам и project knowledge.

## Schema

Полная JSON Schema: `knowledge/project/schemas/memory-entry.schema.json`.

Проверка валидности:
```bash
python3 -m json.tool knowledge/project/schemas/memory-entry.schema.json > /dev/null && echo "OK"
```
