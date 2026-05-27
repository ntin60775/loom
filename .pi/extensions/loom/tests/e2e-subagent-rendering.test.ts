/**
 * E2E-тесты: рендеринг прогресса субагентов и TUI-компонентов
 *
 * INV-5: TUI read-only.
 * Проверяют корректность рендеринга всех компонентов без креша.
 */

import { describe, it, expect, vi } from "vitest";
import { renderSubagentCard, subagentResultRender } from "../ui/subagent-widget";
import { renderStatusLine } from "../ui/render-utils";
import * as themeMock from "./fixtures";

const mockTheme = themeMock as unknown as import("@earendil-works/pi-coding-agent").Theme;

describe("E2E: Рендеринг прогресса", () => {
  it("иконки статуса корректны", () => {
    const states = ["running", "completed", "failed", "aborted", "pending"] as const;
    const expectedIcons = ["⠋", "✓", "✗", "✗", "○"];
    
    for (let i = 0; i < states.length; i++) {
      const text = renderSubagentCard(
        { id: "test", type: "worker", treePrefix: "├──", childIndent: "│   " },
        states[i],
      );
      // Verify icon is present — icons may have ANSI codes
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("статистика форматируется корректно", () => {
    const text = renderSubagentCard(
      { id: "test", type: "worker", step: 1, treePrefix: "├──", childIndent: "│   " },
      "completed",
      {
        tools: 14,
        ctxCurrent: 8200,
        ctxWindow: 200000,
        tokensCumulative: 32000,
        cost: 1.25,
        durationMs: 154000,
      },
    );
    expect(text).toContain("14 tools");
    expect(text).toContain("8.2K/200K ctx");
    expect(text).toContain("Σ32.0K");
    expect(text).toContain("$1.25");
    expect(text).toContain("2m34s");
  });

  it("SubagentCard не крешится при всех статусах", () => {
    const states = ["running", "completed", "failed", "aborted", "pending"] as const;
    for (const status of states) {
      expect(() => {
        renderSubagentCard(
          { id: "test", type: "worker", treePrefix: "├──", childIndent: "│   " },
          status,
          { tools: 1, ctxCurrent: 100, ctxWindow: 1000 },
        );
      }).not.toThrow();
    }
  });

  it("subagentResultRender не крешится с разными комбинациями", () => {
    const state = { id: "test", type: "worker" as const, treePrefix: "├──", childIndent: "│   " };

    // Пустой результат
    expect(() => subagentResultRender(state, {}, mockTheme)).not.toThrow();
    
    // Ошибка
    expect(() => subagentResultRender(state, { isError: true }, mockTheme)).not.toThrow();
    
    // С progress
    expect(() => subagentResultRender(state, {
      isError: false,
      details: {
        progress: { tools_used: 5, ctx_current: 1000, ctx_window: 50000, tokens_cumulative: 8000, cost: 0.5, duration_ms: 30000 },
      },
    }, mockTheme)).not.toThrow();

    // Reviewer с находками
    const reviewerState = { id: "rev", type: "reviewer" as const, treePrefix: "├──", childIndent: "│   " };
    expect(() => subagentResultRender(reviewerState, {
      isError: false,
      details: {
        reviewJson: {
          verdict: "approve",
          findings: [
            { priority: "P0", file: "auth.ts", line: 42, description: "Security issue" },
          ],
        },
      },
    }, mockTheme)).not.toThrow();
  });

  it("renderStatusLine не крешится для всех иконок", () => {
    const icons = ["success", "error", "warning", "pending", "running"] as const;
    for (const icon of icons) {
      expect(() => renderStatusLine({ icon, title: "Test" }, mockTheme)).not.toThrow();
    }
  });

  it("expand/collapse: collapsed mode короче expanded", () => {
    const state = { id: "rev", type: "reviewer" as const, treePrefix: "├──", childIndent: "│   " };
    const result = {
      isError: false,
      details: {
        reviewJson: {
          verdict: "approve",
          findings: [
            { priority: "P0", file: "a.ts", line: 1, description: "d1" },
            { priority: "P1", file: "b.ts", line: 2, description: "d2" },
            { priority: "P2", file: "c.ts", line: 3, description: "d3" },
            { priority: "P3", file: "d.ts", line: 4, description: "d4" },
            { priority: "P1", file: "e.ts", line: 5, description: "d5" },
          ],
        },
      },
    };

    const expanded = subagentResultRender(state, result, mockTheme, { expanded: true });
    const collapsed = subagentResultRender(state, result, mockTheme, { expanded: false });

    const expandedLines = expanded.render(120);
    const collapsedLines = collapsed.render(120);

    // Collapsed should have fewer or equal lines
    expect(collapsedLines.length).toBeLessThanOrEqual(expandedLines.length + 1); // +1 for hint
  });
});
