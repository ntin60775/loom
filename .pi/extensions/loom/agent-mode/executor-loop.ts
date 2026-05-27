/**
 * Executor Loop — step-by-step execution state machine
 *
 * Invariants:
 *   INV-9: Executor does not write code in subagent mode; agent writes code directly in direct mode
 *   INV-11: Strictly sequential — in subagent mode via mutex, in direct mode by plan step order
 *
 * This module provides the orchestration logic for the Agent Mode executor.
 *
 * Subagent mode (≥4 plan steps):
 *   step N → worker → reviewer → approve/reject → step N+1
 *
 * Direct mode (≤3 plan steps):
 *   agent receives all steps → implements directly → marks done → next step
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readPlan, readTask, writeJson, readJson, readExecutionConfig } from "../knowledge/io";
import type { PlanStepData } from "../knowledge/types";
import { resolveModelArg } from "../subagent/model-resolver";
import type { WorkerSpec } from "../subagent/specs";
import { logger } from "../shared/logger";

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

export interface DirectStepInfo {
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
}

export interface DirectExecutionPlan {
  task_id: string;
  task_title: string;
  task_description: string;
  execution_mode: "direct";
  total_steps: number;
  done_steps: number;
  pending_steps: DirectStepInfo[];
  task_complete: boolean;
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
      max_iterations: maxIterations,
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
  const plan = readPlan(dir);
  const task = readTask(dir);

  if (!plan || !task || plan.steps.length === 0) return null;

  const totalSteps = plan.steps.length;
  const doneSteps = plan.steps.filter((s: PlanStepData) => s.status === "done").length;

  for (const step of plan.steps) {
    if (step.status !== "pending") continue;

    // Check dependencies: all depends_on steps must be done
    const deps = step.depends_on ?? [];
    const depsSatisfied = deps.every((depNum: number) => {
      const dep = plan.steps.find((s: PlanStepData) => s.step_number === depNum);
      return dep !== undefined && dep.status === "done";
    });

    if (!depsSatisfied) continue;

    // Build WorkerSpec for this step
    const taskContext = `${task.title} ${step.title} ${step.expected_output ?? ""} ${step.description}`;
    const model = resolveModelArg("worker", taskContext, cwd);

    const workerSpec: WorkerSpec = {
      name: `${taskId}-worker-step${step.step_number}`,
      systemPrompt: "", // Will be filled by loom_spawn_worker
      model,
      tools: ["read", "bash", "edit", "write"],
      task: `Task: ${task.title}\nStep ${step.step_number}: ${step.title}\n${step.description}\nExpected output: ${step.expected_output ?? ""}\nConstraints: ${(step.constraints ?? []).join(", ") || "none"}`,
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
  const plan = readPlan(dir);
  if (!plan || plan.steps.length === 0) return true;
  return plan.steps.every((s: PlanStepData) => s.status === "done");
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
  const plan = readPlan(dir);
  if (!plan) return false;

  const step = plan.steps.find((s: PlanStepData) => s.step_number === stepNumber);
  if (step) {
    step.status = "in_progress";
    writeJson(planPath, plan);

    const state = getLoopState(taskId);
    state.current_step = stepNumber;
    state.status = "running";
    return true;
  }
  return false;
}

// ── Execution Mode Resolution ─────────────────────────────────────────────

export type ExecutionMode = "direct" | "subagent";

/**
 * Resolve execution mode for a task.
 *
 * Logic:
 *   1. If task.json has execution_mode set to "direct" or "subagent" — use it (manual override).
 *   2. If "auto" or unset — read plan.json, count steps:
 *      - ≤3 steps → "direct" (agent implements directly, no worker/reviewer spawn)
 *      - ≥4 steps → "subagent" (worker → reviewer → executor loop)
 *
 * INV-9: Executor does not write code in subagent mode; in direct mode agent writes code itself.
 * INV-11: Sequential steps enforced. In subagent mode via mutex; in direct mode by plan step order.
 */
export function resolveExecutionMode(taskId: string, cwd: string): ExecutionMode {
  const dir = taskDir(cwd, taskId);
  const task = readTask(dir);

  // Manual override from task.json
  if (task?.execution_mode && task.execution_mode !== "auto") {
    logger.info("executor-loop", `Execution mode manually set to "${task.execution_mode}" for ${taskId}`);
    return task.execution_mode as ExecutionMode;
  }

  // Automatic selection based on plan step count
  const plan = readPlan(dir);
  if (!plan || plan.steps.length === 0) {
    logger.warn("executor-loop", `No plan found for ${taskId}, defaulting to subagent mode`);
    return "subagent";
  }

  const mode: ExecutionMode = plan.steps.length <= 3 ? "direct" : "subagent";
  logger.info("executor-loop", `Resolved execution mode "${mode}" for ${taskId} (${plan.steps.length} plan steps)`);
  return mode;
}

// ── Direct Mode ────────────────────────────────────────────────────────────

/**
 * Get the full direct execution plan with all pending steps.
 * Used by loom_get_direct_steps tool to present the agent with all steps at once.
 *
 * INV-9: In direct mode, the agent implements steps directly (no worker/reviewer spawn).
 * INV-11: Steps are returned in plan order; agent iterates sequentially.
 */
export function getDirectSteps(taskId: string, cwd: string): DirectExecutionPlan | null {
  const dir = taskDir(cwd, taskId);
  const plan = readPlan(dir);
  const task = readTask(dir);

  if (!plan || !task || plan.steps.length === 0) return null;

  const totalSteps = plan.steps.length;
  const doneSteps = plan.steps.filter((s: PlanStepData) => s.status === "done").length;
  const taskComplete = plan.steps.every((s: PlanStepData) => s.status === "done");

  // Get pending steps in order
  const pendingSteps: DirectStepInfo[] = [];
  for (const step of plan.steps) {
    if (step.status === "done") continue;

    const deps = step.depends_on ?? [];
    const depsSatisfied = deps.every((depNum: number) => {
      const dep = plan.steps.find((s: PlanStepData) => s.step_number === depNum);
      return dep !== undefined && dep.status === "done";
    });

    pendingSteps.push({
      step_number: step.step_number,
      title: step.title,
      description: step.description,
      expected_output: step.expected_output,
      constraints: step.constraints ?? [],
      depends_on: deps,
      estimated_effort: step.estimated_effort ?? "medium",
      status: depsSatisfied ? step.status : "blocked",
      total_steps: totalSteps,
      done_steps: doneSteps,
    });
  }

  return {
    task_id: taskId,
    task_title: task.title,
    task_description: task.description,
    execution_mode: "direct",
    total_steps: totalSteps,
    done_steps: doneSteps,
    pending_steps: pendingSteps,
    task_complete: taskComplete,
  };
}

/**
 * Mark a step as "done" in plan.json.
 * This is a lightweight function used by loom_complete_direct_step tool.
 */
export function markStepDone(taskId: string, stepNumber: number, cwd: string): boolean {
  const dir = taskDir(cwd, taskId);
  const planPath = path.join(dir, "plan.json");
  const plan = readPlan(dir);
  if (!plan) return false;

  const step = plan.steps.find((s: PlanStepData) => s.step_number === stepNumber);
  if (!step) return false;

  step.status = "done";
  writeJson(planPath, plan);

  logger.info("executor-loop", `Step ${stepNumber} marked as done for ${taskId}`);
  return true;
}

/**
 * Run the localization guard script on files-to-commit.json.
 * Used by loom_complete_direct_step to validate localization after each step.
 */
function runLocalizationGuard(cwd: string): Promise<{ passed: boolean; output: string }> {
  const ftcPath = path.join(cwd, "files-to-commit.json");
  const ftc = readJson<{ files?: string[] }>(ftcPath);
  const files = ftc?.files ?? [];

  if (files.length === 0) {
    return Promise.resolve({ passed: true, output: "No files to check in files-to-commit.json" });
  }

  const scriptPath = path.join(cwd, "scripts", "check-docs-localization.sh");

  return new Promise((resolve) => {
    const proc = spawn("bash", [scriptPath, ...files], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ passed: true, output: stdout });
      } else {
        resolve({ passed: false, output: `stdout:\n${stdout}\n\nstderr:\n${stderr}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ passed: false, output: `Localization guard exception: ${err.message}` });
    });
  });
}

// ── Registered Tools ──────────────────────────────────────────────────────

/**
 * Register executor loop tools for the Agent Mode.
 * These are registered alongside the base agent tools.
 *
 * Provides tools for both subagent mode (loom_get_next_step, loom_check_iteration)
 * and direct mode (loom_get_direct_steps, loom_complete_direct_step).
 */
export function registerExecutorLoopTools(pi: ExtensionAPI): void {
  // ═══════════════════════════════════════════════════════════════════════
  // SUBAGENT MODE TOOLS
  // ═══════════════════════════════════════════════════════════════════════

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
      const execConfig = readExecutionConfig(configPath);
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

  // ═══════════════════════════════════════════════════════════════════════
  // DIRECT MODE TOOLS
  // ═══════════════════════════════════════════════════════════════════════
  // INV-9: In direct mode, the agent implements steps directly.
  // No worker/reviewer spawn. The agent uses write/edit/bash for implementation.
  // INV-11: Steps are presented in plan order; agent iterates sequentially.

  // Tool: Get direct execution plan with all pending steps
  pi.registerTool({
    name: "loom_get_direct_steps",
    label: "Get Direct Steps",
    description: "Get the full direct execution plan with all pending steps. Use when execution_mode is 'direct'.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Verify execution mode
      const mode = resolveExecutionMode(params.task_id, ctx.cwd);
      if (mode !== "direct") {
        return {
          content: [{
            type: "text",
            text: [
              `⚠️ Execution mode for ${params.task_id} is **"${mode}"**, not "direct".`,
              "",
              mode === "subagent"
                ? "Use loom_get_next_step → loom_spawn_worker → loom_spawn_reviewer for subagent mode."
                : "Check task.json execution_mode or plan step count.",
            ].join("\n"),
          }],
          details: { execution_mode: mode },
          isError: true,
        };
      }

      const directPlan = getDirectSteps(params.task_id, ctx.cwd);
      if (!directPlan) {
        return {
          content: [{ type: "text", text: `Task or plan not found for ${params.task_id}` }],
          isError: true,
        };
      }

      // If plan is already complete
      if (directPlan.task_complete) {
        return {
          content: [{
            type: "text",
            text: [
              `✅ План для **${params.task_id}** уже выполнен (${directPlan.done_steps}/${directPlan.total_steps} шагов завершено).`,
              `Используйте \`loom_update_task\` с \`task_status: "completed"\`, чтобы отметить задачу как выполненную.`,
            ].join("\n"),
          }],
          details: { ...directPlan, complete: true },
        };
      }

      // Format pending steps for the agent
      const stepLines: string[] = [];
      stepLines.push(`📋 **План прямого исполнения: ${directPlan.task_title}**`);
      stepLines.push(`Задача: ${params.task_id}`);
      stepLines.push(`Режим: **direct** (агент исполняет шаги самостоятельно)`);
      stepLines.push(`Прогресс: ${directPlan.done_steps}/${directPlan.total_steps} завершено`);
      stepLines.push(`Осталось шагов: ${directPlan.pending_steps.length}`);
      stepLines.push("");
      stepLines.push("## Инструкция:");
      stepLines.push("Для каждого шага по порядку:");
      stepLines.push(`1. Прочитайте \`step.description\` и \`step.expected_output\``);
      stepLines.push(`2. Реализуйте изменения (write/edit/bash)`);
      stepLines.push(`3. Обновите \`files-to-commit.json\` со списком изменённых файлов`);
      stepLines.push(`4. Выполните \`git add\` и \`git commit\``);
      stepLines.push(`5. Вызовите \`loom_complete_direct_step\` с \`step_number\` для отметки шага`);
      stepLines.push(`6. Перейдите к следующему шагу`);
      stepLines.push("");
      stepLines.push("После выполнения ВСЕХ шагов:");
      stepLines.push(`- Вызовите \`loom_update_task\` с \`task_status: "completed"\``);
      stepLines.push("");
      stepLines.push("---");
      stepLines.push("");

      for (const step of directPlan.pending_steps) {
        const blockedLabel = step.status === "blocked" ? " ⚠️ ЗАБЛОКИРОВАН (зависимости не выполнены)" : "";
        stepLines.push(`### Шаг ${step.step_number}/${directPlan.total_steps}: ${step.title}${blockedLabel}`);
        stepLines.push(`- **Статус**: ${step.status}`);
        stepLines.push(`- **Описание**: ${step.description}`);
        stepLines.push(`- **Ожидаемый результат**: ${step.expected_output}`);
        stepLines.push(`- **Оценка усилий**: ${step.estimated_effort}`);
        if (step.constraints.length > 0) {
          stepLines.push(`- **Ограничения**: ${step.constraints.join(", ")}`);
        }
        if (step.depends_on.length > 0) {
          stepLines.push(`- **Зависимости**: шаги ${step.depends_on.join(", ")}`);
        }
        stepLines.push("");
      }

      return {
        content: [{ type: "text", text: stepLines.join("\n") }],
        details: { directPlan },
      };
    },
  });

  // Tool: Complete a step in direct mode
  pi.registerTool({
    name: "loom_complete_direct_step",
    label: "Complete Direct Step",
    description: "Mark a step as 'done' and run localization guard. Use after implementing a step in direct mode.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID" }),
      step_number: Type.Number({ description: "Step number to mark as done" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Mark step as done
      const marked = markStepDone(params.task_id, params.step_number, ctx.cwd);
      if (!marked) {
        return {
          content: [{ type: "text", text: `❌ Не удалось отметить шаг ${params.step_number} как выполненный. Проверьте, что шаг существует в plan.json.` }],
          isError: true,
        };
      }

      // Run localization guard
      let guardResult: { passed: boolean; output: string } | undefined;
      try {
        guardResult = await runLocalizationGuard(ctx.cwd);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        guardResult = { passed: false, output: `Ошибка запуска localization guard: ${msg}` };
      }

      // Check if plan is now complete
      const complete = isPlanComplete(params.task_id, ctx.cwd);
      const dir = taskDir(ctx.cwd, params.task_id);
      const plan = readPlan(dir);
      const totalSteps = plan?.steps.length ?? 0;
      const doneSteps = plan?.steps.filter((s: PlanStepData) => s.status === "done").length ?? 0;

      const lines: string[] = [];
      lines.push(`✅ **Шаг ${params.step_number} отмечен как выполненный**`);
      lines.push(`Прогресс: ${doneSteps}/${totalSteps} шагов завершено`);

      if (guardResult) {
        lines.push("");
        lines.push("---");
        lines.push("### 🔍 Localization Guard");
        if (guardResult.passed) {
          lines.push("✅ **ПРОЙДЕН** — локализация в порядке");
        } else {
          lines.push("❌ **НЕ ПРОЙДЕН** — проверьте вывод:");
          lines.push(guardResult.output.substring(0, 1000));
        }
      }

      if (complete) {
        lines.push("");
        lines.push("---");
        lines.push(`🎉 **Все шаги плана выполнены! (${doneSteps}/${totalSteps})**`);
        lines.push(`Используйте \`loom_update_task\` с \`task_status: "completed"\`, чтобы отметить задачу как выполненную.`);
      } else {
        lines.push("");
        lines.push(`Следующий шаг: вызовите \`loom_get_direct_steps\` чтобы увидеть оставшиеся шаги.`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          step_number: params.step_number,
          done_steps: doneSteps,
          total_steps: totalSteps,
          plan_complete: complete,
          guard_passed: guardResult?.passed,
        },
      };
    },
  });

}
