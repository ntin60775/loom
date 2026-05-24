# Verification Matrix: TASK-2026-0002-loom-vnext

> Сгенерировано из sdd.json + plan.json. Обновлять при изменении инвариантов.

## Инструкция

Каждая строка матрицы связывает инвариант с:
- **Сценарий нарушения** — как может сломаться.
- **Проверка** — как доказать, что не сломано.
- **Тип проверки** — auto (автоматическая) или manual (ручная).
- **Статус** — pending / pass / fail / na.

---

## Матрица

| ID | Инвариант | Сценарий нарушения | Проверка | Тип | Статус |
|----|-----------|-------------------|----------|-----|--------|
| INV-1 | Memory layer активен | Контекст агенту формируется только из текущих файлов, без учёта памяти | ContextAssembler вызывается перед spawn_worker; выход содержит записи из >= 2 дорожек | auto | pending |
| INV-1 | Memory layer активен | Retention policy не работает: semantic store разрастается бесконтрольно | Проверка размера semantic.json < max_entries (1000) после 10 записей | auto | pending |
| INV-2 | Retrieval через scout | search_knowledge использует внутренний vector search или embedding API | Code review: нет вызовов embed(), vectorSearch(), cosineSimilarity() | auto | pending |
| INV-2 | Retrieval через scout | Scout subagent не используется: результаты берутся из простого grep | Code review: search_knowledge вызывает spawn scout с explicit reasoning prompt | auto | pending |
| INV-3 | Совместимость с v1 | Executor v1 flow сломан: /plan или /agent не работают | Запуск /plan и /agent при use_memory_v2 = false; ожидаемый результат — успех | auto | pending |
| INV-3 | Совместимость с v1 | task.json schema v1 сломан: новые обязательные поля | Валидация всех существующих task.json через task.schema.json | auto | pending |
| INV-4 | Детерминированный контекст | ContextAssembler читает из global mutable state или process.env | Code review: все данные из файлов knowledge/; нет global state | auto | pending |
| INV-4 | Детерминированный контекст | Два последовательных вызова assemble() дают разный результат на одних входных данных | Unit test: deterministic assemble() на фиксированных fixtures | auto | pending |
| INV-5 | Task-Centric накопление | Session track сохраняется на диск и становится primary source | Code review: session-track.ts — in-memory only; нет fs.writeFile | auto | pending |
| INV-5 | Task-Centric накопление | Записи episodic store не содержат task_id | Schema validation: каждая запись имеет поле task_id | auto | pending |
| INV-6 | Token budget (DU-1) | ContextAssembler возвращает контекст > token budget | Unit test: assemble(budget=1000) возвращает строку <= 1000 tokens | auto | pending |
| INV-7 | Кэширование (DU-2) | Два одинаковых query порождают два scout spawn | Unit test: cache hit — нет spawn; cache miss — есть spawn | auto | pending |

---

## Ручной checklist

Остаток, который нельзя автоматизировать или который требует операторской проверки:

- [ ] **MANUAL-1**: Производительность scout retrieval при > 50 задачах в knowledge/. Оценка latency.
- [ ] **MANUAL-2**: Качество relevance scoring: operator проверяет, что top-3 результата search_knowledge релевантны intent.
- [ ] **MANUAL-3**: User experience: operator проверяет, что TUI отображает memory status (количество записей по дорожкам) без перегрузки интерфейса.
- [ ] **MANUAL-4**: Retention policy не удаляет критически важные записи (например, инварианты проекта из semantic store).

---

## Итоговый статус

- Автопроверок: 11
- Пройдено: 0
- Не пройдено: 0
- В ожидании: 11
- Ручных пунктов: 4
- Выполнено вручную: 0

**Статус задачи**: не готова к ревью (все проверки в статусе pending).

---

## Обновления

| Дата | Автор | Изменение |
|------|-------|-----------|
| 2026-05-24 | loom | Начальная версия матрицы. Создана из sdd.json + plan.json. |
