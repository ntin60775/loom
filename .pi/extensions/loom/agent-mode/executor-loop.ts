/**
 * Executor Loop — step-by-step execution state machine
 *
 * Invariants:
 *   INV-9: Executor does not write code — only orchestrates
 *   INV-11: Strictly sequential — one active worker at a time
 *
 * This module provides the orchestration logic for the Agent Mode executor.
 * The LLM executor uses these tools to drive the execution loop:
 *   step N → worker → reviewer → approve/reject → step N+1
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readJson } from "../knowledge/io";
import { resolveModelArg } from "../subagent/model-resolver";
import type { WorkerSpec } from "../subagent/specs";

// ── Types ─────────────────────────────────────────────────────────────────

export interface StepInfo {
  step_number: number;
  title: string;
  description: string;
  expected_output: string;
  constraints: string[];
  depends_on: number[];
  estimated_effort: string;
  status: string;
  total_steps: number;
  done_steps: number;
  worker_spec: WorkerSpec;
}

export interface LoopState {
  task_id: string;
  current_step: number | null;
  iteration: number;
  max_iterations: number;
  status: "idle" | "running" | "blocked" | "completed" | "escalated";
}

// ── In-memory state (per session) ─────────────────────────────────────────

const loopStates = new Map<string, LoopState>();

function getLoopState(taskId: string, maxIterations = 10): LoopState {
  let state = loopStates.get(taskId);
  if (!state) {
    state = {
      task_id: taskId,
      current_step: null,
      iteration: 0,
      max_iterations,
      status: "idle",
    };
    loopStates.set(taskId, state);
  }
  return state;
}

// ── Core Logic ────────────────────────────────────────────────────────────

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

/**
 * Find the next pending step in the plan.
 * Steps are processed in order; a step is eligible if:
 * - Its status is "pending"
 * - All steps it depends_on are "done"
 */
export function getNextPendingStep(taskId: string, cwd: string): StepInfo | null {
  const dir = taskDir(cwd, taskId);
  const plan = readJson<any>(path.join(dir, "plan.json"));
  const task = readJson<any>(path.join(dir, "task.json"));

  if (!plan || !task || !plan.steps || plan.steps.length === 0) return null;

  const totalSteps = plan.steps.length;
  const doneSteps = plan.steps.filter((s: any) => s.status === "done").length;

  for (const step of plan.steps) {
    if (step.status !== "pending") continue;

    // Check dependencies: all depends_on steps must be done
    const deps = step.depends_on ?? [];
    const depsSatisfied = deps.every((depNum: number) => {
      const dep = plan.steps.find((s: any) => s.step_number === depNum);
      return dep && dep.status === "done";
    });

    if (!depsSatisfied) continue;

    // Build WorkerSpec for this step
    const taskContext = `${task.title} ${step.title} ${step.expected_output} ${step.description}`;
    const model = resolveModelArg("worker", taskContext, cwd);

    const workerSpec: WorkerSpec = {
      name: `${taskId}-worker-step${step.step_number}`,
      systemPrompt: "", // Will be filled by loom_spawn_worker
      model,
      tools: ["read", "bash", "edit", "write"],
      task: `Task: ${task.title}\nStep ${step.step_number}: ${step.title}\n${step.description}\nExpected output: ${step.expected_output}\nConstraints: ${(step.constraints ?? []).join(", ") || "none"}`,
      cwd,
    };

    return {
      step_number: step.step_number,
      title: step.title,
      description: step.description,
      expected_output: step.expected_output,
      constraints: step.constraints ?? [],
      depends_on: deps,
      estimated_effort: step.estimated_effort ?? "medium",
      status: step.status,
      total_steps: totalSteps,
      done_steps: doneSteps,
      worker_spec: workerSpec,
    };
  }

  return null; // No pending steps
}

/**
 * Check if all steps are done.
 */
export function isPlanComplete(taskId: string, cwd: string): boolean {
  const dir = taskDir(cwd, taskId);
  const plan = readJson<any>(path.join(dir, "plan.json"));
  if (!plan || !plan.steps) return true;
  return plan.steps.every((s: any) => s.status === "done");
}

/**
 * Increment the reject iteration counter.
 * Returns true if max_iterations exceeded.
 */
export function incrementIteration(taskId: string, maxIterations = 10): { iteration: number; escalated: boolean } {
  const state = getLoopState(taskId, maxIterations);
  state.iteration++;
  const escalated = state.iteration > state.max_iterations;
  if (escalated) {
    state.status = "escalated";
  }
  return { iteration: state.iteration, escalated };
}

/**
 * Reset iteration counter (on approve or new step).
 */
export function resetIteration(taskId: string): void {
  const state = loopStates.get(taskId);
  if (state) {
    state.iteration = 0;
    state.status = "running";
  }
}

/**
 * Mark step as in_progress in plan.json.
 */
export function markStepInProgress(taskId: string, stepNumber: number, cwd: string): boolean {
  const dir = taskDir(cwd, taskId);
  const planPath = path.join(dir, "plan.json");
  const plan = readJson<any>(planPath);
  if (!plan) return false;

  const step = plan.steps.find((s: any) => s.step_number === stepNumber);
  if (step) {
    step.status = "in_progress";
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8");

    const state = getLoopState(taskId);
    state.current_step = stepNumber;
    state.status = "running";
    return true;
  }
  return false;
}

// ── Registered Tools ──────────────────────────────────────────────────────

/**
 * Register executor loop tools for the Agent Mode.
 * These are registered alongside the base agent tools.
 */
export function registerExecutorLoopTools(pi: ExtensionAPI): void {
  // Tool: Get the next pending step with pre-built WorkerSpec
  pi.registerTool({
    name: "loom_get_next_step",
    label: "Get Next Step",
    description: "Get the next pending step from the plan with a pre-built WorkerSpec. Returns null if no pending steps or plan is complete.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stepInfo = getNextPendingStep(params.task_id, ctx.cwd);

      if (!stepInfo) {
        const complete = isPlanComplete(params.task_id, ctx.cwd);
        if (complete) {
          return {
            content: [{ type: "text", text: `Plan for ${params.task_id} is complete. All steps done. Use loom_update_task to mark task as completed.` }],
            details: { complete: true },
          };
        }
        return {
          content: [{ type: "text", text: `No pending steps for ${params.task_id}. Check step dependencies — some steps may be blocked.` }],
          details: { blocked: true },
        };
      }

      // Mark step as in_progress
      markStepInProgress(params.task_id, stepInfo.step_number, ctx.cwd);
      resetIteration(params.task_id);

      return {
        content: [{
          type: "text",
          text: [
            `📌 Step ${stepInfo.step_number}/${stepInfo.total_steps}: **${stepInfo.title}**`,
            `Status: ${stepInfo.done_steps}/${stepInfo.total_steps} done → step ${stepInfo.step_number} in_progress`,
            `Description: ${stepInfo.description}`,
            `Expected: ${stepInfo.expected_output}`,
            `Effort: ${stepInfo.estimated_effort}`,
            stepInfo.constraints.length > 0 ? `Constraints: ${stepInfo.constraints.join(", ")}` : null,
            "",
            "Use loom_spawn_worker with:",
            `  task_id: "${params.task_id}"`,
            `  step_number: ${stepInfo.step_number}`,
          ].filter(Boolean).join("\n"),
        }],
        details: { stepInfo },
      };
    },
  });

  // Tool: Check iteration status (called after reviewer rejects)
  pi.registerTool({
    name: "loom_check_iteration",
    label: "Check Iteration",
    description: "Check reject iteration counter. If max_iterations exceeded, returns escalated=true. Pass action='reject' to record a rejection; pass action='check' to only query current status without incrementing.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID" }),
      action: Type.String({ description: "'reject' to record and check, 'check' to only query", default: "reject" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Read max_iterations from execution config
      const configPath = path.join(ctx.cwd, "knowledge", "project", "configs", "execution-config.json");
      const execConfig = readJson<any>(configPath);
      const maxIterations = execConfig?.recovery?.max_retries_per_step ?? 10;

      let iteration: number;
      let escalated: boolean;

      if (params.action === "reject") {
        const state = incrementIteration(params.task_id, maxIterations);
        iteration = state.iteration;
        escalated = state.escalated;
      } else {
        // "check" — read-only, no increment
        const state = getLoopState(params.task_id, maxIterations);
        iteration = state.iteration;
        escalated = state.status === "escalated";
      }

      if (escalated) {
        return {
          content: [{
            type: "text",
            text: `⚠️ ESCALATED: Step iteration ${iteration}/${maxIterations} exceeded. Human-in-the-loop required. Task: ${params.task_id}. Check review findings and decide next action.`,
          }],
          details: { iteration, max_iterations: maxIterations, escalated: true },
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `Iteration ${iteration}/${maxIterations}. Retry worker with corrected instructions.`,
        }],
        details: { iteration, max_iterations: maxIterations, escalated: false },
      };
    },
  });

}
