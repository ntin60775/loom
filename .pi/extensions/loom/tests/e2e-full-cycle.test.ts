/**
 * E2E-тесты: полный цикл Plan → Worker → Reviewer → Commit
 *
 * INV-9: Executor does not write code — only orchestrates.
 * Тесты проверяют оркестрацию (spawn, status, review), а не имплементацию.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@earendil-works/pi-coding-agent", () => ({
  registerTool: vi.fn(),
  ExtensionAPI: {},
}));

vi.mock("@earendil-works/pi-ai", () => ({
  Type: {
    Object: vi.fn(() => ({})),
    String: vi.fn(() => ({})),
    Number: vi.fn(() => ({})),
    Optional: vi.fn(() => ({})),
    Array: vi.fn(() => ({})),
    Record: vi.fn(() => ({})),
    Any: vi.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────

import { renderSubagentCard, subagentCallRender, subagentResultRender } from "../ui/subagent-widget";
import { computeDiffPreview } from "../ui/edit-preview";
import { collapseOutput } from "../ui/expand-collapse";
import { renderStatusLineText, renderStatusLine } from "../ui/render-utils";

// Theme mock
const mockTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
} as unknown as import("@earendil-works/pi-coding-agent").Theme;


// ── Tests ─────────────────────────────────────────────────────────────────

describe("E2E: Полный цикл", () => {
  

  describe("SubagentCard — все статусы", () => {
    it("рендерит карточку running worker'а", () => {
      const text = renderSubagentCard(
        { id: "worker-1", type: "worker", step: 1, treePrefix: "├──", childIndent: "│   " },
        "running",
        { tools: 5, ctxCurrent: 4200, ctxWindow: 200000, tokensCumulative: 32000, cost: 1.2, durationMs: 154000, currentTool: "bash: npm test" },
      );
      expect(text).toContain("├──");
      expect(text).toContain("worker");
      expect(text).toContain("[running]");
      expect(text).toContain("5 tools");
      expect(text).toContain("╰─ bash: npm test");
    });

    it("рендерит карточку completed worker'а", () => {
      const text = renderSubagentCard(
        { id: "worker-1", type: "worker", step: 1, treePrefix: "├──", childIndent: "│   " },
        "completed",
        { tools: 14, ctxCurrent: 8200, ctxWindow: 200000, tokensCumulative: 32000, cost: 1.2, durationMs: 154000 },
      );
      expect(text).toContain("[done]");
      expect(text).not.toContain("├── ○");
    });

    it("рендерит карточку failed worker'а", () => {
      const text = renderSubagentCard(
        { id: "worker-1", type: "worker", step: 1, treePrefix: "├──", childIndent: "│   " },
        "failed",
      );
      expect(text).toContain("[failed]");
    });

    it("рендерит карточку с retry", () => {
      const text = renderSubagentCard(
        { id: "worker-1", type: "worker", step: 1, treePrefix: "├──", childIndent: "│   " },
        "running",
        undefined,
        { attempt: 2, max: 5, reason: "timeout", delayMs: 180000 },
      );
      expect(text).toContain("retrying 2/5");
      expect(text).toContain("3m0s");
      expect(text).toContain("timeout");
    });
  });

  describe("SubagentCard — renderCall / renderResult", () => {
    it("subagentCallRender возвращает Text с running статусом", () => {
      const state = { id: "w1", type: "worker" as const, step: 1, treePrefix: "├──", childIndent: "│   " };
      const component = subagentCallRender(state, mockTheme);
      expect(component).toBeDefined();
      const lines = component.render(80);
      expect(lines[0]).toContain("├──");
      expect(lines[0]).toContain("worker");
    });

    it("subagentResultRender успех", () => {
      const state = { id: "w1", type: "worker" as const, treePrefix: "├──", childIndent: "│   " };
      const result = { isError: false, details: { result: { exitCode: 0 } } };
      const component = subagentResultRender(state, result, mockTheme);
      expect(component).toBeDefined();
      const lines = component.render(80);
      expect(lines[0]).toContain("[done]");
    });

    it("subagentResultRender с expand/collapse опциями", () => {
      const state = { id: "reviewer", type: "reviewer" as const, treePrefix: "├──", childIndent: "│   " };
      const result = {
        isError: false,
        details: {
          reviewJson: {
            verdict: "approve",
            findings: [
              { priority: "P1", file: "auth.ts", line: 42, description: "Missing error handling", correct: false },
              { priority: "P2", file: "config.ts", line: 15, description: "Comment typo", correct: true, confidence: 0.9 },
            ],
          },
        },
      };
      const component = subagentResultRender(state, result, mockTheme, { expanded: false });
      const lines = component.render(80);
      // In collapsed mode, findings should be collapsed (max 3 lines)
      expect(lines.length).toBeLessThanOrEqual(8);
    });
  });

  describe("Review findings rendering", () => {
    it("показывает находки с приоритетами", () => {
      const state = { id: "reviewer", type: "reviewer" as const, treePrefix: "├──", childIndent: "│   " };
      const result = {
        isError: false,
        details: {
          reviewJson: {
            verdict: "reject",
            findings: [
              { priority: "P0", file: "auth.ts", line: 42, description: "Security vulnerability" },
              { priority: "P1", file: "middleware.ts", line: 88, description: "Null check" },
            ],
          },
        },
      };
      const component = subagentResultRender(state, result, mockTheme);
      const lines = component.render(120);
      const fullText = lines.join("\n");
      expect(fullText).toContain("Findings:");
      expect(fullText).toContain("P0:1");
      expect(fullText).toContain("P1:1");
      expect(fullText).toContain("[P0]");
      expect(fullText).toContain("auth.ts:42");
    });
  });

  describe("renderStatusLine", () => {
    it("возвращает правильную строку для success", () => {
      const text = renderStatusLineText({ icon: "success", title: "Update task" }, mockTheme);
      expect(text).toContain("✓");
      expect(text).toContain("Update task");
    });

    it("возвращает правильную строку с description", () => {
      const text = renderStatusLineText({ icon: "error", title: "Spawn worker", description: "localization guard failed" }, mockTheme);
      expect(text).toContain("✗");
      expect(text).toContain("Spawn worker");
      expect(text).toContain("localization guard failed");
    });
  });

  describe("Expand/Collapse", () => {
    it("не обрезает короткий вывод", () => {
      const { text, truncated } = collapseOutput("line1\nline2", { maxLines: 3, maxDiffHunks: 8 });
      expect(truncated).toBe(false);
      expect(text).toBe("line1\nline2");
    });

    it("обрезает длинный вывод до 3 строк", () => {
      const long = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n");
      const { text, truncated } = collapseOutput(long, { maxLines: 3, maxDiffHunks: 8 });
      expect(truncated).toBe(true);
      expect(text.split("\n").length).toBe(3);
    });
  });

  describe("Streaming diff preview", () => {
    it("computeDiffPreview находит изменения", () => {
      const diff = computeDiffPreview("old\nline", "new\nline");
      expect(diff.added).toBeGreaterThan(0);
    });

    it("computeDiffPreview пустой для одинакового контента", () => {
      const diff = computeDiffPreview("same", "same");
      expect(diff.added).toBe(0);
      expect(diff.removed).toBe(0);
    });
  });
});
