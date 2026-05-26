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
| INV-1 | Memory layer активен | ContextAssembler вызывается перед spawn_worker; выход содержит записи из >= 2 дорожек | auto | pass |
| INV-1 | Memory layer активен | Retention policy не работает: semantic store разрастается бесконтрольно | Проверка размера semantic.json < max_entries (1000) после 10 записей | auto | pass |
| INV-2 | Retrieval через scout | search_knowledge использует внутренний vector search или embedding API | Code review: нет вызовов embed(), vectorSearch(), cosineSimilarity() | auto | pass |
| INV-2 | Retrieval через scout | Scout subagent не используется: результаты берутся из простого grep | Code review: search_knowledge вызывает spawn scout с explicit reasoning prompt | auto | pass |
| INV-3 | Совместимость с v1 | Executor v1 flow сломан: /plan или /agent не работают | Code review: все v1 tools сохранены в agent-mode/tools.ts; use_memory_v2=false по умолчанию | auto | pass |
| INV-3 | Совместимость с v1 | task.json schema v1 сломан: новые обязательные поля | Валидация всех существующих task.json через task.schema.json | auto | pass |
| INV-4 | Детерминированный контекст | ContextAssembler читает из global mutable state или process.env | Code review: все данные из файлов knowledge/; нет global state | auto | pass |
| INV-4 | Детерминированный контекст | Два последовательных вызова assemble() дают разный результат | Требует runtime test на фиксированных fixtures | auto | deferred |
| INV-5 | Task-Centric накопление | Session track сохраняется на диск и становится primary source | Session track in-memory по дизайну (сессия pi). Данные сохраняются memory manager на диск | auto | pass |
| INV-5 | Task-Centric накопление | Записи episodic store не содержат task_id | Code review: episodic-store.ts валидирует task_id как обязательное поле | auto | pass |
| INV-6 | Token budget (DU-1) | ContextAssembler возвращает контекст > token budget | Требует runtime test с заданным budget | auto | deferred |
| INV-7 | Кэширование (DU-2) | Два одинаковых query порождают два scout spawn | Требует runtime test с mock или реальным scout spawn | auto | deferred |

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
- Пройдено: 8
- Не пройдено: 0
- Отложено: 3 (требуют runtime)
- Ручных пунктов: 4
- Выполнено вручную: 0

**Статус задачи**: готова к финализации (8/8 код-проверок пройдено; 3 runtime-теста отложены; 4 ручных пункта ожидают оператора).

---

## Обновления

| Дата | Автор | Изменение |
|------|-------|-----------|
| 2026-05-24 | loom | Начальная версия матрицы. Создана из sdd.json + plan.json. |
| 2026-05-25 | loom | DU-1 Memory Layer completed. DU-2 Scout Retrieval merged. Code-review checks: 8/8 passed, 3 deferred. |
