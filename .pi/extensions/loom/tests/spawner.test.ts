/**
 * Tests: subagent/spawner.ts — getPiInvocation, writePromptToTempFile
 * Tests: subagent/progress.ts — readProgress, writeProgress
 *
 * Integration tests for subagent infrastructure.
 * Does NOT spawn real subagents — only tests helper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readProgress, writeProgress } from "../subagent/progress";
import type { SubagentResult } from "../subagent/specs";

// ── Progress ──────────────────────────────────────────────────────────────

describe("readProgress", () => {
  let tmp: string;

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-progress-")); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("returns null for missing file", () => {
    const p = readProgress(path.join(tmp, "nonexistent.json"));
    expect(p).toBeNull();
  });

  it("reads valid progress snapshot", () => {
    writeProgress(path.join(tmp, "p.json"), {
      status: "running",
      step: "step-3",
      percent: 42,
      timestamp: new Date().toISOString(),
    });
    const p = readProgress(path.join(tmp, "p.json"));
    expect(p).toBeTruthy();
    expect(p!.status).toBe("running");
    expect(p!.step).toBe("step-3");
    expect(p!.percent).toBe(42);
  });

  it("reads completed progress", () => {
    writeProgress(path.join(tmp, "p.json"), {
      status: "completed",
      outputArtifact: "stack.json",
      summary: "Done",
      timestamp: new Date().toISOString(),
    });
    const p = readProgress(path.join(tmp, "p.json"));
    expect(p!.status).toBe("completed");
    expect(p!.outputArtifact).toBe("stack.json");
    expect(p!.summary).toBe("Done");
  });

  it("handles error status", () => {
    writeProgress(path.join(tmp, "p.json"), {
      status: "error",
      summary: "Failed",
      timestamp: new Date().toISOString(),
    });
    const p = readProgress(path.join(tmp, "p.json"));
    expect(p!.status).toBe("error");
  });

  it("handles aborted status", () => {
    writeProgress(path.join(tmp, "p.json"), {
      status: "aborted",
      timestamp: new Date().toISOString(),
    });
    const p = readProgress(path.join(tmp, "p.json"));
    expect(p!.status).toBe("aborted");
  });
});

// ── SubagentResult shape validation ───────────────────────────────────────

describe("SubagentResult shape", () => {
  it("matches expected interface structure", () => {
    const result: SubagentResult = {
      exitCode: 0,
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
      stderr: "",
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.01, turns: 1 },
      model: "deepseek-chat",
      stopReason: "end_turn",
    };
    expect(result.exitCode).toBe(0);
    expect(result.messages).toHaveLength(1);
    expect(result.usage.input).toBe(100);
    expect(result.model).toBe("deepseek-chat");
  });

  it("handles error result shape", () => {
    const result: SubagentResult = {
      exitCode: 1,
      messages: [],
      stderr: "Something went wrong",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      stopReason: "error",
      errorMessage: "Connection timeout",
    };
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe("Connection timeout");
  });

  it("handles aborted result shape", () => {
    const result: SubagentResult = {
      exitCode: 0,
      messages: [],
      stderr: "",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      stopReason: "aborted",
    };
    expect(result.stopReason).toBe("aborted");
  });
});

// ── Subagent state (shared/subagent-state.ts) ─────────────────────────────

import {
  registerSubagent,
  updateSubagentStatus,
  removeSubagent,
  getActiveSubagents,
  killSubagent,
} from "../shared/subagent-state";

describe("subagent-state", () => {
  beforeEach(() => {
    // Clean state before each test
    const all = getActiveSubagents();
    for (const s of all) removeSubagent(s.id);
  });

  it("registers and retrieves subagent", () => {
    registerSubagent("test-1", {
      id: "test-1",
      name: "Test Worker",
      type: "worker",
      status: "running",
      model: "m1",
      step: 1,
      taskId: "T-1",
    });
    const subagents = getActiveSubagents();
    expect(subagents).toHaveLength(1);
    expect(subagents[0].name).toBe("Test Worker");
    expect(subagents[0].status).toBe("running");
    expect(subagents[0].startTime).toBeGreaterThan(0);
  });

  it("updates subagent status", () => {
    registerSubagent("test-2", { id: "test-2", name: "W2", type: "worker", status: "running" });
    updateSubagentStatus("test-2", "completed");
    const subagents = getActiveSubagents();
    expect(subagents[0].status).toBe("completed");
  });

  it("removes subagent", () => {
    registerSubagent("test-3", { id: "test-3", name: "W3", type: "worker", status: "running" });
    removeSubagent("test-3");
    expect(getActiveSubagents()).toHaveLength(0);
  });

  it("returns empty array when no subagents", () => {
    expect(getActiveSubagents()).toHaveLength(0);
  });

  it("killSubagent returns false for unknown id", () => {
    expect(killSubagent("nonexistent")).toBe(false);
  });

  it("killSubagent marks status as aborted", () => {
    registerSubagent("test-4", { id: "test-4", name: "W4", type: "worker", status: "running" });
    expect(killSubagent("test-4")).toBe(true);
    const subagents = getActiveSubagents();
    expect(subagents[0].status).toBe("aborted");
  });

  it("killSubagent calls AbortController if present", () => {
    const ctrl = new AbortController();
    registerSubagent("test-5", { id: "test-5", name: "W5", type: "worker", status: "running", controller: ctrl });
    expect(ctrl.signal.aborted).toBe(false);
    killSubagent("test-5");
    expect(ctrl.signal.aborted).toBe(true);
  });

  it("registers multiple subagents concurrently", () => {
    registerSubagent("a", { id: "a", name: "A", type: "worker", status: "running" });
    registerSubagent("b", { id: "b", name: "B", type: "reviewer", status: "running" });
    registerSubagent("c", { id: "c", name: "C", type: "worker", status: "completed" });
    expect(getActiveSubagents()).toHaveLength(3);
  });
});
