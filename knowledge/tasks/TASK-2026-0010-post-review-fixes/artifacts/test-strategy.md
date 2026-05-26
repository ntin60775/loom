# Стратегия тестирования loom

## Обзор

После ревью (2026-05-26) покрытие тестами составляло ~5% (3 файла с ручными тестами). Задача TASK-2026-0010 закрыла этот пробел — теперь **155 тестов в 11 файлах**.

## Архитектура тестирования

### Инструменты

- **vitest** — быстрый, TypeScript-native, совместим с Node 24
- **@vitest/coverage-v8** — покрытие на основе v8 (без инструментирования кода)
- Реальные зависимости `@earendil-works/*` (не моки) для валидной компиляции

### Структура

```
.pi/extensions/loom/tests/
├── setup.ts                  — хелперы (temp dirs, knowledge setup)
├── fixtures.ts               — фабрики (makeMemoryEntry, makeTask, makePlan, etc.)
├── schemas.test.ts           — валидаторы (все runtime validators)
├── store-utils.test.ts       — applyFilters, updateAccessMeta, BatchWriter
├── session-track.test.ts     — in-memory session store
├── episodic-store.test.ts    — file-backed episodic store
├── semantic-procedural.test.ts — semantic + procedural stores
├── cache.test.ts             — retrieval cache (TTL, persistence, invalidation)
├── scope-filter.test.ts      — search path resolution
├── context-provider.test.ts  — v2 context assembly (disabled/enabled)
├── executor-loop.test.ts     — state machine (steps, iteration, marking)
├── model-resolver.test.ts    — domain-aware model selection
└── utils.test.ts             — sanitizeId, getFinalOutput
```

### Категории тестов

| Категория | Файлы | Тестов |
|----------|-------|--------|
| Валидация схем | schemas.test.ts | 28 |
| Memory — утилиты | store-utils.test.ts | 13 |
| Memory — session | session-track.test.ts | 16 |
| Memory — episodic | episodic-store.test.ts | 14 |
| Memory — semantic+procedural | semantic-procedural.test.ts | 10 |
| Retrieval | cache.test.ts + scope-filter.test.ts | 16 |
| Context | context-provider.test.ts | 4 |
| Agent | executor-loop.test.ts | 14 |
| Subagent | model-resolver.test.ts | 10 |
| Shared | utils.test.ts | 9 |

### Принципы

1. **Изоляция**: каждый тест получает свежую временную директорию (`fs.mkdtempSync`)
2. **Фабрики**: `fixtures.ts` предоставляет минимальные валидные объекты
3. **Очистка**: `afterEach` удаляет временные директории (`force: true`)
4. **Без моков файловой системы**: тесты работают с реальным `fs`, что ближе к реальности
5. **Покрытие граничных случаев**: null, undefined, невалидные данные, пустые массивы

### Запуск

```bash
npm test              # vitest run (единоразово)
npm run test:watch    # vitest (watch mode)
npm run test:coverage # vitest run --coverage (с отчётом)
```

### Целевые пороги покрытия

| Метрика | Цель | Текущий статус |
|---------|------|---------------|
| Statements | >= 70% | ⏳ требует замера |
| Branches | >= 65% | ⏳ требует замера |
| Functions | >= 70% | ⏳ требует замера |
| Lines | >= 70% | ⏳ требует замера |

### Оставшиеся пробелы

- Нет интеграционных тестов для spawnSubagent (требует pi CLI)
- Нет тестов для index.ts (extension entry point — требует pi runtime)
- Нет тестов для UI-виджетов (mode-widget, task-widget, subagent-widget)
- Нет тестов для onboarding subagents (scout, researcher, migrator — требуют LLM)
