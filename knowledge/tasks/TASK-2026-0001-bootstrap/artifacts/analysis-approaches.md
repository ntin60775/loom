> **HISTORICAL ARTIFACT.** Generated during early exploration. Names "aide" and "stratum" are outdated. Current project name is **loom**. For canonical architecture, see `../sdd.json` and `../sdd.md`.

# Анализ подходов к реализации aide

## Постановка

Нужно выбрать стратегию реализации ядра AI-Native Development Environment (aide).
Рассматриваем три варианта относительно существующего skill `task-centric-knowledge`.

## Критерии оценки (от лица ИИ-агента)

| Критерий | Что измеряем |
|----------|--------------|
| Когнитивная нагрузка | Сколько правил/форматов нужно помнить для корректной работы |
| Контекстный оверхед | Сколько токонов уходит на "протокольную" работу vs полезную |
| Надёжность | Вероятность ошибок при маршрутизации, создании задач, верификации |
| AI-Native соответствие | Насколько форматы оптимизированы под LLM-потребление и генерацию |
| Legacy/Greenfield parity | Насколько одинаково хорошо работает для старых и новых проектов |
| Эволюционный потенциал | Насколько легко расширять и адаптировать |
| Время до рабочего состояния | Сколько усилий до первой рабочей версии |

---

## Вариант 1: Взять task-centric-knowledge за базу

### Что есть в skill сейчас

- DDD-модель: Task Core, Read Model, Publish Integration, Packaging/Governance, Profiles, Memory
- CLI `task-knowledge`: install, check, apply, doctor-deps, verify-project, workflow, task
- Статусная модель: 8 статусов задачи, 6 статусов delivery unit
- Task routing: автовыбор между текущей задачей, подзадачей, новой задачей
- Verification matrix: artifacts/verification-matrix.md
- Upgrade governance: эпохи, repo upgrade-state, backfill
- Profiles: generic, 1c
- Field validation: проверено на clean/generic, mixed_system/generic, compatible/1c

### Плюсы

1. **Проверенная в поле модель**. Skill прошёл field validation на 3 классах сред.
2. **CLI уже работает**. Install, workflow sync, task status/show — готовы.
3. **Governance зрелый**. Upgrade-контур, cleanup-plan/confirm, doctor-deps — продуманы.
4. **DDD-границы чёткие**. Task Core не подменяется Read Model или Publish слоем.
5. **Маршрутизация задач**. Правила routing уменьшают когнитивную нагрузку на выбор.

### Минусы (критичные для AI-native)

1. **Форматы человекоцентричны**.
   - Поля: `Человекочитаемое описание`, `Краткое имя`.
   - Статусы кириллические: `в работе`, `на проверке`, `завершена`.
   - Это хорошо для человека, но плохо для LLM: кириллица в статусах = лишние токены,
     менее детерминированная генерация, хуже работают шаблоны из обучающих данных.

2. **Протокольный оверхед огромен**.
   - core-model.md, deployment.md, adoption.md, upgrade-transition.md — тысячи строк.
   - При старте задачи агент должен "загрузить" эти правила в контекст.
   - Это съедает значительную часть контекстного окна.

3. **Markdown как primary format**.
   - `task.md`, `plan.md`, `sdd.md` — свободный markdown.
   - Для LLM это менее структурировано, чем JSON/YAML с schema.
   - Парсинг markdown требует эвристик, нет machine-verifiable structure.

4. **Нет явного Context Protocol**.
   - Контекст агента не формализован как first-class entity.
   - Cross-task inheritance требует ручного чтения закрытых задач.
   - Нет embedding-based retrieval или index по знаниям.

5. **Verification требует ручной работы**.
   - verification-matrix.md нужно заполнять и проверять.
   - "Максимум автоматических проверок" = хороший принцип, но CLI не генерирует проверки автоматически.

6. **Read Model ориентирована на оператора**.
   - `task-knowledge task status/show` — для человека.
   - Агенту нужен другой интерфейс: machine-readable context injection.

### Итог по варианту 1

**Score: 5/10 для AI-native целей.**
Хорошая governance-модель, но форматы и протоколы человекоцентричны.
Требует значительной адаптации AI-слоя поверх существующего ядра.

---

## Вариант 2: Писать ядро с нуля

### Что предполагается создать

- Новый формат задач: machine-readable primary (JSON/YAML), markdown — производная.
- AI Context Protocol: explicit context window assembly, context tokens budget.
- Retrieval Engine: embedding index по знаниям, cross-task inheritance через semantic search.
- Agent Instruction Layer: формализованные instructions как артефакты, версионируемые.
- Stack Detection Layer: автоопределение стека, module maps, dependency graphs.
- Operator CLI: read-only отчёты, TUI, docs-as-code generation.
- Verification Engine: автогенерация проверок из инвариантов, automated test scaffolding.

### Плюсы

1. **Чистый AI-native дизайн с нуля**. Ни одно решение не обусловлено legacy constraints.
2. **Machine-readable форматы первичны**. JSON/YAML schemas — source of truth.
   Markdown генерируется для человека, но не является primary.
3. **Context Protocol как first-class**. Агент явно собирает свой контекст из:
   - текущей задачи,
   - релевантных закрытых задач (retrieval),
   - project knowledge (module maps),
   - instructions (версионированные).
4. **Embedding-based retrieval**. Cross-task inheritance через semantic search,
   не через ручное чтение.
5. **LLM-оптимизированные паттерны**. Structured outputs, function calling,
   machine-verifiable markers (INVARIANT:, CONTRACT:, PRE:, POST:).

### Минусы

1. **Огромный объём работы**.
   - task-centric-knowledge — это ~10K+ строк кода и документации.
   - Эквивалентный объём с нуля = месяцы работы.

2. **Нет field validation**.
   - task-centric-knowledge прошёл validation на 3 классах сред.
   - С нуля нужно проходить тот же путь ошибок.

3. **Нет upgrade-контура**.
   - Когда aide v1 обновляется до v2, нужна миграция.
   - task-centric-knowledge уже решил эту проблему (эпохи, backfill, cleanup-plan).

4. **Высокий риск архитектурных ошибок**.
   - DDD-границы task-centric-knowledge выросли из field validation.
   - С нуля легко сделать ошибку в границах Task Core / Read Model / Publish.

5. **Время до production-ready**.
   - task-centric-knowledge уже работает.
   - aide с нуля — неизвестно когда будет готов к ежедневному использованию.

### Итог по варианту 2

**Score: 4/10 для ближайшей реализации.**
Идеален в теории, но непрактичен по времени и рискам.
Может стать целевой архитектурой на горизонте 6-12 месяцев,
но не подходит для bootstrap.

---

## Вариант 3: Гибрид

### Суть подхода

- **Сохранить**: архитектурные концепции task-centric-knowledge (Task Core, delivery units,
  verification matrix, routing, upgrade governance).
- **Переписать**: форматы под AI-native (machine-readable primary, markdown — derivative).
- **Упростить**: governance/upgrade слой, убрав избыточную человекоцентричность.
- **Добавить**: AI Context Protocol, retrieval layer, stack detection, operator TUI.

### Конкретные решения

| Слой task-centric-knowledge | Что делать в aide |
|----------------------------|-------------------|
| Task Core (task.md, plan.md, sdd.md) | Перейти на JSON/YAML primary + markdown generator. Убрать кириллические статусы. |
| Read Model (task status/show) | Оставить для оператора, добавить machine-readable API для агента. |
| Publish Integration (delivery units) | Сохранить концепцию, упростить статусную модель. |
| Packaging/Governance (install/upgrade) | Переиспользовать логику, упростить CLI интерфейс. |
| Profiles (generic, 1c) | Сохранить идею, но сделать stack-agnostic detection вместо ручного выбора профиля. |
| Memory | Заменить на embedding-based retrieval + project knowledge index. |

### Плюсы

1. **Сохраняем проверенные концепции**. Task routing, delivery units, verification —
   это не нужно изобретать заново.
2. **Форматы становятся AI-native**. JSON/YAML schemas + machine-verifiable markers.
3. **Меньше рисков**. Базовая архитектура уже validated.
4. **Время до рабочего состояния** существенно меньше, чем с нуля.
5. **Можно инкрементально улучшать**. Сначала заменить форматы, потом добавить retrieval,
   потом — operator TUI.

### Минусы

1. **Нужно понимать исходный код task-centric-knowledge**. Не тривиально разобраться,
   что переиспользовать, а что переписать.
2. **Миграционная сложность**. Если task-centric-knowledge обновляется,
   нужно синхронизировать изменения.
3. **Может получиться "золотая середина"**. Ни чистый AI-native, ни зрелый governance.
   Нужна чёткая граница между legacy-concepts и new-native layer.

### Итог по варианту 3

**Score: 8/10 для bootstrap-задачи.**
Оптимальный баланс между скоростью, надёжностью и AI-native целями.
Требует чёткого договора о границах между "переиспользуемым" и "новым".

---

## Сравнительная таблица

| Критерий | Вариант 1: За базу | Вариант 2: С нуля | Вариант 3: Гибрид |
|----------|-------------------|-------------------|-------------------|
| Когнитивная нагрузка | Высокая (много человекоцентричных правил) | Низкая (свои форматы, но их много) | Средняя (только необходимое) |
| Контекстный оверхед | Высокий (markdown, кириллица) | Низкий (machine-readable) | Низкий (machine-readable) |
| Надёжность | Высокая (field validated) | Низкая (новый код) | Высокая (validated base) |
| AI-Native соответствие | Низкое | Высокое | Высокое |
| Legacy/Greenfield parity | Хорошая (есть profiles, 1c) | Нужно делать | Хорошая (наследуем) |
| Эволюционный потенциал | Ограничен legacy форматами | Неограничен | Высокий |
| Время до рабочего состояния | Немедленно | Месяцы | Недели |

---

## Рекомендация

**Вариант 3 (Гибрид)**.

### Обоснование

1. **task-centric-knowledge уже решил hard problems**: DDD-границы, routing,
   upgrade governance, field validation. Эти проблемы требуют итераций и обратной связи.
   Переписывать их с нуля = повторять чужие ошибки.

2. **AI-native форматы — относительно лёгкая задача**. Переход markdown -> JSON/YAML
   с schema не требует months of work. Это вопрос дизайна форматов + генераторов.

3. **Гибрид позволяет запуститься быстро**. Можно сделать минимальное ядро
   (task format JSON, CLI для агента, basic retrieval) и уже работать,
   постепенно добавляя сложные фичи.

4. **Human layer остаётся производной**. task-centric-knowledge ориентирован на оператора.
   В aide оператор = read-only. Поэтому человекоцентричные части можно либо упростить,
   либо сделать генераторами поверх machine-readable данных.

### Конкретный план (предварительный)

#### Фаза 0: Foundation (1-2 недели)
- Определить JSON schema для task, plan, sdd.
- Определить machine-verifiable markers (INVARIANT, CONTRACT, PRE, POST, SCOPE, EVIDENCE).
- Сделать генератор markdown -> из JSON для operator read-only layer.
- Перенести Task Core concepts из task-centric-knowledge в aide core.

#### Фаза 1: Agent Context Protocol (2-3 недели)
- Контекст агента как явная сущность: task context + project context + instructions.
- Retrieval layer: embedding index по task artifacts, module maps, decisions.
- Cross-task inheritance через semantic search, не ручное чтение.

#### Фаза 2: Operator Layer (1-2 недели)
- CLI/TUI для оператора: status, current-task, task show.
- Docs-as-code generation (rustdoc, pydoc, typedoc) из AI-native спеков.
- Read-only отчёты и dashboards.

#### Фаза 3: Stack Detection & Legacy (2-3 недели)
- Автоопределение стека проекта (языки, фреймворки, build system).
- Module maps и dependency graphs для legacy.
- Architecture decision records как first-class artifacts.

#### Фаза 4: Advanced Features (ongoing)
- Automated verification generation из инвариантов.
- Self-updating instructions (instructions версионируются и наследуются).
- Multi-agent coordination (если несколько агентов работают над проектом).
