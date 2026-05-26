/**
 * Tests: agent-mode/executor-loop.ts — step execution state machine
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getNextPendingStep,
  isPlanComplete,
  incrementIteration,
  resetIteration,
  markStepInProgress,
} from "../agent-mode/executor-loop";
import { setupTestKnowledge } from "./setup";

function writeTaskAndPlan(cwd: string, taskId: string, plan: Record<string, unknown>): void {
  const taskDir = path.join(cwd, "knowledge", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });

  const now = new Date().toISOString().split("T")[0];
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({
      task_id: taskId,
      slug: "test-task",
      title: "Test Task",
      description: "Test description for executor loop tests",
      status: "active",
      priority: "medium",
      branch: "task/test",
      invariants: [],
      delivery_units: [],
      created_at: now,
      updated_at: now,
      schema_version: "1.0.0",
    }),
  );
  fs.writeFileSync(path.join(taskDir, "plan.json"), JSON.stringify(plan));
}

describe("Executor Loop", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-loop-test-"));
    setupTestKnowledge(cwd);
  });

  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── getNextPendingStep ────────────────────────────────────────────────

  describe("getNextPendingStep", () => {
    it("returns first pending step", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "Step 1", description: "Do X", expected_output: "X", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "Step 2", description: "Do Y", expected_output: "Y", status: "pending", constraints: [], depends_on: [1] },
        ],
      });

      const step = getNextPendingStep("TASK-0001", cwd);
      expect(step).not.toBeNull();
      expect(step!.step_number).toBe(1);
      expect(step!.title).toBe("Step 1");
    });

    it("returns null for completed plan", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
        ],
      });

      expect(getNextPendingStep("TASK-0001", cwd)).toBeNull();
    });

    it("blocks step with unsatisfied dependencies", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [1] },
        ],
      });

      const step = getNextPendingStep("TASK-0001", cwd);
      expect(step).not.toBeNull();
      expect(step!.step_number).toBe(1); // Step 2 blocked by dep on step 1
    });

    it("returns step 2 when step 1 is done", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [1] },
        ],
      });

      const step = getNextPendingStep("TASK-0001", cwd);
      expect(step).not.toBeNull();
      expect(step!.step_number).toBe(2);
    });

    it("returns total_steps and done_steps", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      const step = getNextPendingStep("TASK-0001", cwd);
      expect(step!.total_steps).toBe(2);
      expect(step!.done_steps).toBe(1);
    });

    it("returns null for nonexistent task", () => {
      expect(getNextPendingStep("TASK-NONEXISTENT", cwd)).toBeNull();
    });
  });

  // ── isPlanComplete ────────────────────────────────────────────────────

  describe("isPlanComplete", () => {
    it("returns true when all steps done", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
        ],
      });
      expect(isPlanComplete("TASK-0001", cwd)).toBe(true);
    });

    it("returns false when some steps pending", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        ],
      });
      expect(isPlanComplete("TASK-0001", cwd)).toBe(false);
    });

    it("returns true for nonexistent task (empty plan)", () => {
      expect(isPlanComplete("TASK-NONEXISTENT", cwd)).toBe(true);
    });
  });

  // ── incrementIteration / resetIteration ────────────────────────────────

  describe("iteration counter", () => {
    it("increments on each call", () => {
      const r1 = incrementIteration("T-ITER-1", 10);
      expect(r1.iteration).toBe(1);
      expect(r1.escalated).toBe(false);

      const r2 = incrementIteration("T-ITER-1", 10);
      expect(r2.iteration).toBe(2);
    });

    it("escalates after max_iterations exceeded", () => {
      for (let i = 0; i < 10; i++) incrementIteration("T-ITER-2", 10);
      const r = incrementIteration("T-ITER-2", 10);
      expect(r.iteration).toBe(11);
      expect(r.escalated).toBe(true);
    });

    it("resets to zero", () => {
      incrementIteration("T-ITER-3", 10);
      incrementIteration("T-ITER-3", 10);
      resetIteration("T-ITER-3");
      const r = incrementIteration("T-ITER-3", 10);
      expect(r.iteration).toBe(1);
    });
  });

  // ── markStepInProgress ────────────────────────────────────────────────

  describe("markStepInProgress", () => {
    it("marks a step as in_progress in plan.json", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      const ok = markStepInProgress("TASK-0001", 1, cwd);
      expect(ok).toBe(true);

      const raw = JSON.parse(fs.readFileSync(path.join(cwd, "knowledge", "tasks", "TASK-0001", "plan.json"), "utf-8"));
      expect(raw.steps[0].status).toBe("in_progress");
    });

    it("returns false for nonexistent step", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] }],
      });

      expect(markStepInProgress("TASK-0001", 99, cwd)).toBe(false);
    });
  });
});
