# Plan: TUI-карточки: заимствование лучших UX-паттернов omp для loom

**Task ID:** TASK-2026-0016-tui-cards

## Steps

1. **DU-3: Единый renderStatusLine — базовая утилита** — Создать модуль .pi/extensions/loom/ui/render-utils.ts с функцией renderStatusLine({icon, title, description}, theme). Внедрить во все существующие renderCall/renderResult loom-инструментов. Иконка цветная (success/error/warning/pending/running). Title: операция (Edit, Spawn worker, Review). Description: доп. информация.
   - Expected: Файл render-utils.ts, обновлённые agent-mode/tools.ts и plan-mode/tools.ts с renderCall/renderResult для всех инструментов
   - Effort: medium
   - Status: pending

2. **DU-1: SubagentCard — компонент карточки субагента** — Создать компонент SubagentCard в .pi/extensions/loom/ui/subagent-widget.ts. Реализовать: tree-коннектор, иконка статуса с цветом, bold ID + описание, бейдж [done/failed/aborted], строка статистики (tools, ctx, Σtokens, cost, duration), текущий инструмент (если running), retry-состояние. Добавить renderCall/renderResult для loom_spawn_worker и loom_spawn_reviewer.
   - Expected: Обновлённый subagent-widget.ts с классом SubagentCard, обновлённый agent-mode/tools.ts с renderCall/renderResult, обновлённый spawner.ts с ProgressEvent
   - Effort: large
   - Status: pending

3. **DU-1: Интеграция ProgressEvent в spawner** — Обновить subagent/spawner.ts: заменить текстовые onUpdate на структурированные ProgressEvent (status, tools_used, ctx_current, ctx_window, tokens_cumulative, cost, duration_ms, current_tool). SubagentCard использует эти поля для live-обновления.
   - Expected: Обновлённый spawner.ts с интерфейсом ProgressEvent и эмиссией структурированных событий
   - Effort: medium
   - Status: pending

4. **DU-4: Review findings [P0-P3] в карточке reviewer'а** — Расширить SubagentCard для reviewer'а: парсинг review JSON из output, цветное дерево находок (P0=красный, P1=жёлтый, P2=синий, P3=серый) с file:line, раскрытие описания, вердикт (correct/incorrect с confidence %).
   - Expected: Обновлённый subagent-widget.ts с ReviewFindingsTree, обновлённый agent-mode/tools.ts (renderResult для spawn_reviewer)
   - Effort: medium
   - Status: pending

5. **DU-2: Expand/Collapse (Ctrl+O) — инфраструктура** — Создать модуль .pi/extensions/loom/ui/expand-collapse.ts с утилитой collapseOutput(content, limits). Реализовать: свёрнуто — 3 строки вывода, 8 ханков диффа, хинт «(Ctrl+O для подробностей)»; развёрнуто — полный вывод. Хинт авто-скрывается когда уже развёрнуто. Зарегистрировать Ctrl+O.
   - Expected: Файл expand-collapse.ts, обновлённый index.dev.ts с регистрацией hotkey
   - Effort: medium
   - Status: pending

6. **DU-2: Применение Expand/Collapse ко всем tool-карточкам** — Интегрировать expand/collapse во все renderResult loom-инструментов: SubagentCard, renderStatusLine, review findings. Использовать context.expanded из renderResult API.
   - Expected: Обновлённые renderResult во всех tool-файлах с поддержкой expanded/collapsed
   - Effort: medium
   - Status: pending

7. **DU-5: Streaming diff preview для edit-инструментов** — Создать модуль .pi/extensions/loom/ui/edit-preview.ts. Перехватывать partial JSON аргументов edit/write через tool_call хук. Compute diff preview из partial аргументов (как только есть path + content). Стабилизация: strip trailing removals без matching additions. Abort предыдущего compute при новых аргументах. Spinner пока нет полных аргументов.
   - Expected: Файл edit-preview.ts, обновлённый index.dev.ts с tool_call хуком
   - Effort: large
   - Status: pending

8. **DU-6: E2E-тесты — полный цикл Plan→Worker→Reviewer→Commit** — Написать тесты в .pi/extensions/loom/tests/e2e-full-cycle.test.ts: успешный worker + reviewer, worker с ошибкой, таймаут worker'а. Использовать существующие моки pi CLI.
   - Expected: Файл e2e-full-cycle.test.ts с 3 сценариями (успех, ошибка, таймаут)
   - Effort: large
   - Status: pending

9. **DU-6: E2E-тесты — рендеринг прогресса субагентов и TUI-компонентов** — Написать тесты в .pi/extensions/loom/tests/e2e-subagent-rendering.test.ts: рендеринг прогресса (иконки, tools, ctx, tokens, cost, duration), TUI-компоненты без креша (SubagentCard с разными статусами, expand/collapse, review findings, renderStatusLine).
   - Expected: Файл e2e-subagent-rendering.test.ts с 2 сценариями (прогресс + компоненты)
   - Effort: medium
   - Status: pending

10. **Финальная верификация: все тесты + визуальная проверка** — Запустить все существующие 385 тестов + новые E2E. Провести визуальную проверку: запуск /plan → /agent и наблюдение за рендерингом карточек. Проверить локейшн-гард.
   - Expected: Зелёные тесты, визуальное подтверждение корректного рендеринга
   - Effort: small
   - Status: pending

---

*Generated from plan.json*
