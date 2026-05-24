# Verification Matrix — TASK-2026-0008 Memory Layer (DU-1)

> Сгенерировано после выполнения шага 9.

## Чеклист проверок

### CHK-1: Data model для 4 дорожек задокументирован и валиден

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| `memory-entry.schema.json` существует | ✅ PASS | `knowledge/project/schemas/memory-entry.schema.json` |
| JSON Schema валиден (python3 -m json.tool) | ✅ PASS | Schema OK |
| `artifacts/data-model.md` существует | ✅ PASS | Описаны 4 дорожки, поля, relevance scoring, retention policy |

### CHK-2: Все 4 дорожки реализованы и имеют API

| Дорожка | Файл | API | Статус |
|---------|------|-----|--------|
| Session | `.pi/extensions/loom/memory/session-track.ts` | `append`, `getContext`, `query`, `clear`, `evict`, `stats`, `size` | ✅ |
| Episodic | `.pi/extensions/loom/memory/episodic-store.ts` | `record`, `query`, `summarize`, `compactTask`, `stats` | ✅ |
| Semantic | `.pi/extensions/loom/memory/semantic-store.ts` | `index`, `query`, `update`, `compact`, `stats` | ✅ |
| Procedural | `.pi/extensions/loom/memory/procedural-store.ts` | `learn`, `query`, `validate`, `recordUsage`, `seedFromTasks`, `compact`, `stats` | ✅ |
| Memory Manager | `.pi/extensions/loom/memory/manager.ts` | `append`, `query`, `recomputeRelevance`, `enforceRetention`, `compactEpisodic`, `summarizeEpisodic`, `indexSemantic`, `seedProcedural`, `stats`, `clearSession` | ✅ |
| Context Assembler | `.pi/extensions/loom/memory/context-assembler.ts` | `assemble` | ✅ |

### CHK-3: Backward compatibility

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| `use_memory_v2` по умолчанию `false` | ✅ PASS | `execution-config.json` |
| При `false` executor не вызывает ContextAssembler | ✅ PASS | `buildMemoryContext` возвращает `null` если флаг не установлен |
| v1 tools не затронуты | ✅ PASS | `tools.ts` — опциональный импорт, try/catch wrapper |

### Дополнительные проверки

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Token budget respected (code review) | ✅ PASS | `ContextAssembler` считает токены по `charsPerToken`, truncates по приоритету |
| Task-scoped память | ✅ PASS | `task_id` в `MemoryEntry`; episodic store — per-task файлы |
| Детерминированный контекст | ✅ PASS | `ContextAssembler` явно собирает текст из 4 дорожек |
| Retention policy | ✅ PASS | `MemoryManager.enforceRetention()` вызывает `evict`/`compact` |

## Инварианты задачи

| ID | Инвариант | Статус |
|----|-----------|--------|
| INV-1 | Memory layer активен: система сама решает что запомнить, что забыть, что подсунуть агенту | ✅ verified |
| INV-3 | Совместимость с v1: все форматы и API v1 должны работать без изменений | ✅ verified |
| INV-4 | Детерминированный контекст: контекст агенту собирается явно, без неявного состояния | ✅ verified |
| INV-5 | Task-Centric накопление: память привязана к задачам и project knowledge, не к сессии агента | ✅ verified |
| INV-6 | Token budget respected: контекст агенту не превышает лимит | ✅ verified |

## Файлы поставки

- `.pi/extensions/loom/memory/types.ts`
- `.pi/extensions/loom/memory/utils.ts`
- `.pi/extensions/loom/memory/session-track.ts`
- `.pi/extensions/loom/memory/episodic-store.ts`
- `.pi/extensions/loom/memory/semantic-store.ts`
- `.pi/extensions/loom/memory/procedural-store.ts`
- `.pi/extensions/loom/memory/manager.ts`
- `.pi/extensions/loom/memory/context-assembler.ts`
- `.pi/extensions/loom/memory/index.ts`
- `knowledge/project/schemas/memory-entry.schema.json`
- `knowledge/project/memory/semantic.json`
- `knowledge/project/memory/procedural.json`
- `knowledge/project/configs/execution-config.json` (обновлён)
- `.pi/extensions/loom/agent-mode/tools.ts` (обновлён)
- `.pi/extensions/loom/knowledge/types.ts` (обновлён)
- `.pi/extensions/loom/knowledge/schemas.ts` (обновлён)

---
*Generated: 2026-05-24*
