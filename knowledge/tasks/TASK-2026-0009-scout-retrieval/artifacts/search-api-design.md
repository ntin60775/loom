# Scout Search API Design

> Артефакт шага 1: проектирование `search_knowledge` API.

## Сигнатура

```typescript
type SearchScope = 'task' | 'project' | 'domain';

interface SearchOptions {
  query: string;           // Поисковый запрос на естественном языке
  scope: SearchScope;      // Область поиска
  limit?: number;          // Максимум результатов (default: 10)
  use_cache?: boolean;     // Использовать кэш (default: true)
}

async function search_knowledge(
  options: SearchOptions
): Promise<SearchResult[]>;
```

## Scope Enum

| Значение | Описание | Пути поиска |
|----------|----------|-------------|
| `task` | Только файлы текущей задачи | `knowledge/tasks/{current_task_id}/**/*` |
| `project` | Project knowledge | `knowledge/project/**/*` |
| `domain` | Всё знание + расширения | `knowledge/**/*` + `.pi/extensions/loom/**/*` |

Scope `task` ограничивает поиск директорией текущей задачи — полезно когда агент работает в контексте одной задачи и не должен видеть чужие артефакты.

Scope `project` — стандартный режим для поиска по project knowledge: правила, архитектура, конфиги.

Scope `domain` — максимальный охват: всё knowledge плюс исходники расширений loom. Используется для сложных запросов требующих понимания внутренней архитектуры.

## Response Format: SearchResult

```typescript
interface SearchResult {
  // Путь к файлу относительно knowledge/
  file_path: string;

  // Релевантность результата: 0.0 — 1.0
  relevance_score: number;

  // Обоснование релевантности — почему scout выбрал этот файл
  reasoning: string;

  // Сниппет: релевантные строки из файла (до 5 строк)
  snippet?: string;

  // Тип источника: task | project | schema | config | rule
  source_type: string;
}
```

JSON Schema: `knowledge/project/schemas/search-result.schema.json`

## Scout Spawn Flow

```
search_knowledge(query, scope, limit)
  ├─ 1. Нормализация query + формирование cache_key (SHA-256)
  ├─ 2. Проверка кэша (retrieval.json)
  │    ├─ Cache HIT → возврат закэшированных SearchResult[]
  │    └─ Cache MISS → продолжаем
  ├─ 3. Формирование ScoutSpec
  │    ├─ prompt: scout-search.md
  │    ├─ scope_filter: ScopeRestriction
  │    └─ output_schema: search-result.schema.json
  ├─ 4. Spawn scout subagent
  │    ├─ Scout читает файлы по scoped путям
  │    ├─ Ранжирует по релевантности с reasoning
  │    └─ Возвращает JSON: SearchResult[]
  ├─ 5. Валидация ответа по schema
  │    ├─ INVALID → retry (1 раз) с упрощённым prompt
  │    └─ VALID → продолжаем
  ├─ 6. Сохранение в кэш (TTL = 300 сек)
  └─ 7. Возврат SearchResult[]
```

## Cache Behavior

### TTL

- **Default TTL**: 300 секунд (5 минут)
- **Max TTL**: 3600 секунд (1 час) — для частых запросов
- **TTL configurable** в `execution-config.json`

### Invalidation

Кэш инвалидируется автоматически по следующим событиям:

| Событие | Действие |
|---------|----------|
| Изменение файла в knowledge/ | Инвалидация записей с matching path |
| Обновление task (новый artifact) | Инвалидация task scope записей |
| Ручной вызов `invalidate_cache()` | Полная очистка |

### Хранилище

`knowledge/project/cache/retrieval.json` — JSON-файл с записями вида:

```json
{
  "cache_entries": [
    {
      "cache_key": "sha256:abc123...",
      "query": "normalized query text",
      "scope": "project",
      "results": [ /* SearchResult[] */ ],
      "created_at": "2026-05-25T10:00:00Z",
      "expires_at": "2026-05-25T10:05:00Z"
    }
  ]
}
```

## Error Handling Strategy

| Ошибка | Обработка | Результат |
|--------|-----------|-----------|
| Scout timeout ( > 60s) | Retry 1 раз, затем пустой массив | `[]` + warning в лог |
| Invalid JSON от scout | Retry 1 раз с упрощённым prompt | `[]` + warning в лог |
| Schema validation fail | Retry 1 раз, затем пустой массив | `[]` + warning в лог |
| Empty result (0 files) | Не ошибка | `[]` + info в лог |
| Cache read error | Пропуск кэша, spawn scout | Прозрачное fallback |
| Cache write error | Пропуск записи | Warning в лог, не влияет на результат |

## Path Exclusions

Из поиска исключаются следующие паттерны:

```
node_modules/
build/
dist/
*.log
.cache/
.git/
secrets/
.env*
*.key
*.pem
```

Exclusions применяются на уровне ScopeFilter — scout получает уже отфильтрованный список путей.

## Backward Compatibility

- `search_knowledge` доступен только при `use_memory_v2 = true`
- При `use_memory_v2 = false` executor v1 работает без изменений
- v1 tools не импортируют retrieval-модули (опциональный импорт + try/catch)
- Scout retrieval — opt-in фича, не ломает существующие flow

## Файлы поставки

| Файл | Назначение |
|------|------------|
| `knowledge/project/schemas/search-result.schema.json` | JSON Schema ответа scout |
| `.pi/extensions/loom/retrieval/scout-retrieval.ts` | Основной движок retrieval |
| `.pi/extensions/loom/retrieval/cache.ts` | Кэширование результатов |
| `.pi/extensions/loom/retrieval/scope-filter.ts` | Фильтрация по scope + exclusions |
| `.pi/extensions/loom/subagent/prompts/scout-search.md` | Prompt для scout subagent |
