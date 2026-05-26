/**
 * Tests: ui/*.ts — mode-widget, task-widget, subagent-widget
 *
 * These widgets are read-only (INV-5). Tests verify correct
 * setWidget calls with proper labels and format.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { updateModeWidget } from "../ui/mode-widget";
import { updateTaskWidget } from "../ui/task-widget";
import { updateSubagentWidget } from "../ui/subagent-widget";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SubagentRecord } from "../shared/subagent-state";

// ── Mock helpers ──────────────────────────────────────────────────────────

interface WidgetCall {
  id: string;
  value: unknown;
}

function makeMockContext(cwd: string) {
  const widgets: WidgetCall[] = [];
  const notifications: Array<{ msg: string; level: string }> = [];

  const ctx: ExtensionContext = {
    cwd,
    ui: {
      notify(msg: string, level = "info") {
        notifications.push({ msg, level });
      },
      setWidget(id: string, value: unknown) {
        widgets.push({ id, value });
      },
      setStatus(id: string, content: string) {
        widgets.push({ id, value: content });
      },
      async select(_prompt: string, _options: string[]): Promise<string> {
        return _options[0] ?? "";
      },
    },
    sessionManager: {
      getEntries: () => [],
    },
  };

  return { ctx, widgets, notifications };
}

function tmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `loom-test-ui-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setupKnowledge(baseDir: string, taskId: string, overrides?: Record<string, unknown>) {
  const dir = path.join(baseDir, "knowledge", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  const taskJson = {
    task_id: taskId,
    slug: "test",
    title: "Test Task",
    description: "A test",
    status: "active",
    priority: "high",
    branch: `task/${taskId}`,
    invariants: [],
    delivery_units: [],
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    schema_version: "1.0.0",
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "task.json"), JSON.stringify(taskJson, null, 2));
  return dir;
}

function setupPlan(taskDir: string, steps: Array<{ step_number: number; title: string; status: string }>) {
  const planJson = {
    task_id: path.basename(taskDir),
    steps: steps.map((s) => ({
      step_number: s.step_number,
      title: s.title,
      description: `Step ${s.step_number}`,
      expected_output: `out-${s.step_number}.json`,
      constraints: [],
      depends_on: [],
      estimated_effort: "medium",
      status: s.status,
    })),
  };
  fs.writeFileSync(path.join(taskDir, "plan.json"), JSON.stringify(planJson, null, 2));
}

// ── Mode Widget ───────────────────────────────────────────────────────────

describe("updateModeWidget", () => {
  it("shows [IDLE] for idle mode", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    updateModeWidget(ctx, "idle");
    expect(widgets.length).toBe(1);
    expect(widgets[0].id).toBe("loom-mode");
    expect(widgets[0].value).toContain("[IDLE]");
    expect(widgets[0].value).toContain("alt+m");
  });

  it("shows [PLAN] for plan mode", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    updateModeWidget(ctx, "plan");
    expect(widgets[0].value).toContain("[PLAN]");
  });

  it("shows [AGENT] for agent mode", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    updateModeWidget(ctx, "agent");
    expect(widgets[0].value).toContain("[AGENT]");
  });
});

// ── Task Widget ───────────────────────────────────────────────────────────

describe("updateTaskWidget", () => {
  it("clears widget when taskId is null", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    updateTaskWidget(ctx, null, "/tmp");
    expect(widgets.length).toBe(1);
    expect(widgets[0].value).toBeUndefined();
  });

  it("clears widget when task not found", () => {
    const cwd = tmpDir("notfound");
    const { ctx, widgets } = makeMockContext(cwd);
    updateTaskWidget(ctx, "T-NONEXISTENT", cwd);
    expect(widgets[0].value).toBeUndefined();
  });

  it("shows task info with progress (0/0 steps)", () => {
    const cwd = tmpDir("taskinfo");
    const taskId = "TASK-2026-0100-test";
    setupKnowledge(cwd, taskId);
    const { ctx, widgets } = makeMockContext(cwd);
    updateTaskWidget(ctx, taskId, cwd);
    const val = widgets[0].value as string[];
    expect(val).toBeTruthy();
    expect(val.join("\n")).toContain("Test Task");
    expect(val.join("\n")).toContain("0/0");
  });

  it("shows progress when plan exists", () => {
    const cwd = tmpDir("taskprog");
    const taskId = "TASK-2026-0101-test";
    const taskDir = setupKnowledge(cwd, taskId);
    setupPlan(taskDir, [
      { step_number: 1, title: "Init", status: "done" },
      { step_number: 2, title: "Build", status: "done" },
      { step_number: 3, title: "Test", status: "in_progress" },
      { step_number: 4, title: "Deploy", status: "pending" },
    ]);
    const { ctx, widgets } = makeMockContext(cwd);
    updateTaskWidget(ctx, taskId, cwd);
    const val = (widgets[0].value as string[]).join("\n");
    expect(val).toContain("2/4");
    expect(val).toContain("3. Test"); // current step
  });

  it("shows active task status", () => {
    const cwd = tmpDir("taskstatus");
    const taskId = "TASK-2026-0102-test";
    setupKnowledge(cwd, taskId, { status: "draft" });
    const { ctx, widgets } = makeMockContext(cwd);
    updateTaskWidget(ctx, taskId, cwd);
    const val = (widgets[0].value as string[]).join("\n");
    expect(val).toContain("[draft]");
  });
});

// ── Subagent Widget ───────────────────────────────────────────────────────

describe("updateSubagentWidget", () => {
  it("clears widget when no subagents", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    updateSubagentWidget(ctx, []);
    expect(widgets.length).toBe(1);
    expect(widgets[0].value).toBeUndefined();
  });

  it("shows running subagent", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    const subagents: SubagentRecord[] = [
      { id: "w1", name: "worker-1", type: "worker", status: "running", model: "deepseek-chat", step: 3, taskId: "T-1", startTime: Date.now() },
    ];
    updateSubagentWidget(ctx, subagents);
    const val = (widgets[0].value as string[]).join("\n");
    expect(val).toContain("Субагенты");
    expect(val).toContain("worker-1");
    expect(val).toContain("worker");
    expect(val).toContain("deepseek-chat");
  });

  it("shows completed subagent with checkmark", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    const subagents: SubagentRecord[] = [
      { id: "r1", name: "reviewer-1", type: "reviewer", status: "completed", model: "claude", step: 2, taskId: "T-1", startTime: Date.now() },
    ];
    updateSubagentWidget(ctx, subagents);
    expect((widgets[0].value as string[]).join("\n")).toContain("reviewer");
  });

  it("shows multiple subagents", () => {
    const { ctx, widgets } = makeMockContext("/tmp");
    const subagents: SubagentRecord[] = [
      { id: "w1", name: "w1", type: "worker", status: "running", startTime: Date.now() },
      { id: "r1", name: "r1", type: "reviewer", status: "completed", startTime: Date.now() },
      { id: "w2", name: "w2", type: "worker", status: "error", startTime: Date.now() },
    ];
    updateSubagentWidget(ctx, subagents);
    const lines = (widgets[0].value as string[]);
    expect(lines.length).toBe(4); // header + 3 entries
  });
});
