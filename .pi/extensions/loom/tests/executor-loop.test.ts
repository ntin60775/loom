/**
 * Tests: agent-mode/executor-loop.ts — step execution state machine
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getDirectSteps,
  markStepDone,
  getNextPendingStep,
  isPlanComplete,
  incrementIteration,
  resetIteration,
  markStepInProgress,
  resolveExecutionMode,
} from "../agent-mode/executor-loop";
import { setupTestKnowledge } from "./setup";

function writeTaskAndPlan(cwd: string, taskId: string, plan: Record<string, unknown>, taskOverrides: Record<string, unknown> = {}): void {
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
      ...taskOverrides,
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

  // ── resolveExecutionMode ──────────────────────────────────────────────

  describe("resolveExecutionMode", () => {
    it("returns direct for plan with 1 step", () => {
      writeTaskAndPlan(cwd, "TASK-0001", {
        task_id: "TASK-0001",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      });
      expect(resolveExecutionMode("TASK-0001", cwd)).toBe("direct");
    });

    it("returns direct for plan with 2 steps", () => {
      writeTaskAndPlan(cwd, "TASK-0002", {
        task_id: "TASK-0002",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        ],
      });
      expect(resolveExecutionMode("TASK-0002", cwd)).toBe("direct");
    });

    it("returns direct for plan with exactly 3 steps (boundary)", () => {
      writeTaskAndPlan(cwd, "TASK-0003", {
        task_id: "TASK-0003",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
          { step_number: 3, title: "S3", description: "D3", expected_output: "O3", status: "pending", constraints: [], depends_on: [] },
        ],
      });
      expect(resolveExecutionMode("TASK-0003", cwd)).toBe("direct");
    });

    it("returns subagent for plan with 4 steps (boundary)", () => {
      writeTaskAndPlan(cwd, "TASK-0004", {
        task_id: "TASK-0004",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
          { step_number: 3, title: "S3", description: "D3", expected_output: "O3", status: "pending", constraints: [], depends_on: [] },
          { step_number: 4, title: "S4", description: "D4", expected_output: "O4", status: "pending", constraints: [], depends_on: [] },
        ],
      });
      expect(resolveExecutionMode("TASK-0004", cwd)).toBe("subagent");
    });

    it("returns subagent for plan with 10+ steps", () => {
      const steps = Array.from({ length: 10 }, (_, i) => ({
        step_number: i + 1,
        title: `S${i + 1}`,
        description: `D${i + 1}`,
        expected_output: `O${i + 1}`,
        status: "pending",
        constraints: [],
        depends_on: [],
      }));
      writeTaskAndPlan(cwd, "TASK-0010", { task_id: "TASK-0010", steps });
      expect(resolveExecutionMode("TASK-0010", cwd)).toBe("subagent");
    });

    it("respects manual override to direct for 5-step plan", () => {
      const steps = [
        { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        { step_number: 3, title: "S3", description: "D3", expected_output: "O3", status: "pending", constraints: [], depends_on: [] },
        { step_number: 4, title: "S4", description: "D4", expected_output: "O4", status: "pending", constraints: [], depends_on: [] },
        { step_number: 5, title: "S5", description: "D5", expected_output: "O5", status: "pending", constraints: [], depends_on: [] },
      ];
      writeTaskAndPlan(cwd, "TASK-0005", { task_id: "TASK-0005", steps }, { execution_mode: "direct" });
      expect(resolveExecutionMode("TASK-0005", cwd)).toBe("direct");
    });

    it("respects manual override to subagent for 1-step plan", () => {
      writeTaskAndPlan(cwd, "TASK-0006", {
        task_id: "TASK-0006",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      }, { execution_mode: "subagent" });
      expect(resolveExecutionMode("TASK-0006", cwd)).toBe("subagent");
    });

    it("defaults to auto (subagent) when execution_mode is auto for 5-step plan", () => {
      const steps = Array.from({ length: 5 }, (_, i) => ({
        step_number: i + 1,
        title: `S${i + 1}`,
        description: `D${i + 1}`,
        expected_output: `O${i + 1}`,
        status: "pending",
        constraints: [],
        depends_on: [],
      }));
      writeTaskAndPlan(cwd, "TASK-0007", { task_id: "TASK-0007", steps }, { execution_mode: "auto" });
      expect(resolveExecutionMode("TASK-0007", cwd)).toBe("subagent");
    });

    it("defaults to auto (direct) when execution_mode is auto for 2-step plan", () => {
      writeTaskAndPlan(cwd, "TASK-0008", {
        task_id: "TASK-0008",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        ],
      }, { execution_mode: "auto" });
      expect(resolveExecutionMode("TASK-0008", cwd)).toBe("direct");
    });

    it("returns subagent when no execution_mode set and no plan exists", () => {
      const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-NOPLAN");
      fs.mkdirSync(taskDir, { recursive: true });
      fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });
      const now = new Date().toISOString().split("T")[0];
      fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify({
        task_id: "TASK-NOPLAN",
        slug: "no-plan",
        title: "No Plan",
        description: "Task without plan",
        status: "active",
        priority: "medium",
        branch: "task/no-plan",
        invariants: [],
        delivery_units: [],
        created_at: now,
        updated_at: now,
        schema_version: "1.0.0",
      }));
      expect(resolveExecutionMode("TASK-NOPLAN", cwd)).toBe("subagent");
    });
  });

  // ── getDirectSteps ───────────────────────────────────────────────────

  describe("getDirectSteps (direct mode)", () => {
    it("returns all pending steps for a 3-step plan", () => {
      writeTaskAndPlan(cwd, "TASK-DS-1", {
        task_id: "TASK-DS-1",
        steps: [
          { step_number: 1, title: "Step 1", description: "Do A", expected_output: "A done", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "Step 2", description: "Do B", expected_output: "B done", status: "pending", constraints: [], depends_on: [1] },
          { step_number: 3, title: "Step 3", description: "Do C", expected_output: "C done", status: "pending", constraints: [], depends_on: [2] },
        ],
      });

      const plan = getDirectSteps("TASK-DS-1", cwd);
      expect(plan).not.toBeNull();
      expect(plan!.execution_mode).toBe("direct");
      expect(plan!.total_steps).toBe(3);
      expect(plan!.done_steps).toBe(0);
      expect(plan!.task_complete).toBe(false);
      expect(plan!.pending_steps).toHaveLength(3);
      expect(plan!.pending_steps[0].step_number).toBe(1);
      expect(plan!.pending_steps[1].step_number).toBe(2);
      expect(plan!.pending_steps[2].step_number).toBe(3);
    });

    it("excludes done steps from pending", () => {
      writeTaskAndPlan(cwd, "TASK-DS-2", {
        task_id: "TASK-DS-2",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [1] },
          { step_number: 3, title: "S3", description: "D3", expected_output: "O3", status: "pending", constraints: [], depends_on: [2] },
        ],
      });

      const plan = getDirectSteps("TASK-DS-2", cwd);
      expect(plan).not.toBeNull();
      expect(plan!.done_steps).toBe(1);
      expect(plan!.task_complete).toBe(false);
      expect(plan!.pending_steps).toHaveLength(2);
      expect(plan!.pending_steps[0].step_number).toBe(2);
      expect(plan!.pending_steps[1].step_number).toBe(3);
    });

    it("returns task_complete=true when all steps done", () => {
      writeTaskAndPlan(cwd, "TASK-DS-3", {
        task_id: "TASK-DS-3",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "done", constraints: [], depends_on: [1] },
        ],
      });

      const plan = getDirectSteps("TASK-DS-3", cwd);
      expect(plan).not.toBeNull();
      expect(plan!.task_complete).toBe(true);
      expect(plan!.done_steps).toBe(2);
      expect(plan!.pending_steps).toHaveLength(0);
    });

    it("marks blocked steps correctly when dependencies not done", () => {
      writeTaskAndPlan(cwd, "TASK-DS-4", {
        task_id: "TASK-DS-4",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [1] },
        ],
      });

      const plan = getDirectSteps("TASK-DS-4", cwd);
      expect(plan).not.toBeNull();
      // Step 1: pending (no deps → not blocked)
      expect(plan!.pending_steps[0].status).toBe("pending");
      // Step 2: depends_on [1], step 1 not done → blocked
      expect(plan!.pending_steps[1].status).toBe("blocked");
    });

    it("returns null for nonexistent task", () => {
      expect(getDirectSteps("TASK-NONEXISTENT", cwd)).toBeNull();
    });

    it("includes task title and description", () => {
      writeTaskAndPlan(cwd, "TASK-DS-5", {
        task_id: "TASK-DS-5",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      const plan = getDirectSteps("TASK-DS-5", cwd);
      expect(plan).not.toBeNull();
      expect(plan!.task_title).toBe("Test Task");
      expect(plan!.task_description).toBe("Test description for executor loop tests");
      expect(plan!.task_id).toBe("TASK-DS-5");
    });
  });

  // ── markStepDone ─────────────────────────────────────────────────────

  describe("markStepDone (direct mode)", () => {
    it("marks a step as done in plan.json", () => {
      writeTaskAndPlan(cwd, "TASK-MD-1", {
        task_id: "TASK-MD-1",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      const ok = markStepDone("TASK-MD-1", 1, cwd);
      expect(ok).toBe(true);

      const raw = JSON.parse(fs.readFileSync(path.join(cwd, "knowledge", "tasks", "TASK-MD-1", "plan.json"), "utf-8"));
      expect(raw.steps[0].status).toBe("done");
    });

    it("marks the correct step in a multi-step plan", () => {
      writeTaskAndPlan(cwd, "TASK-MD-2", {
        task_id: "TASK-MD-2",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "done", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [1] },
          { step_number: 3, title: "S3", description: "D3", expected_output: "O3", status: "pending", constraints: [], depends_on: [2] },
        ],
      });

      markStepDone("TASK-MD-2", 2, cwd);

      const raw = JSON.parse(fs.readFileSync(path.join(cwd, "knowledge", "tasks", "TASK-MD-2", "plan.json"), "utf-8"));
      expect(raw.steps[0].status).toBe("done");
      expect(raw.steps[1].status).toBe("done");
      expect(raw.steps[2].status).toBe("pending");
    });

    it("returns false for nonexistent step", () => {
      writeTaskAndPlan(cwd, "TASK-MD-3", {
        task_id: "TASK-MD-3",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      expect(markStepDone("TASK-MD-3", 99, cwd)).toBe(false);
    });

    it("returns false for nonexistent task", () => {
      expect(markStepDone("TASK-NONEXISTENT", 1, cwd)).toBe(false);
    });

    it("isPlanComplete returns true after marking all steps done", () => {
      writeTaskAndPlan(cwd, "TASK-MD-4", {
        task_id: "TASK-MD-4",
        steps: [
          { step_number: 1, title: "S1", description: "D1", expected_output: "O1", status: "pending", constraints: [], depends_on: [] },
          { step_number: 2, title: "S2", description: "D2", expected_output: "O2", status: "pending", constraints: [], depends_on: [] },
        ],
      });

      expect(isPlanComplete("TASK-MD-4", cwd)).toBe(false);
      markStepDone("TASK-MD-4", 1, cwd);
      expect(isPlanComplete("TASK-MD-4", cwd)).toBe(false);
      markStepDone("TASK-MD-4", 2, cwd);
      expect(isPlanComplete("TASK-MD-4", cwd)).toBe(true);
    });
  });
});
