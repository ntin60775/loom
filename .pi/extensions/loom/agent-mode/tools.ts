/**
 * Agent Mode Tools — executor orchestration
 *
 * Tools:
 *   loom_spawn_worker    — spawn worker subagent for a plan step
 *   loom_spawn_reviewer  — spawn reviewer subagent for a worker commit
 *   loom_update_task     — update task.json / plan.json status
 *   loom_read_artifact   — read artifact file
 */

import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readJson, writeJson, readTask, readPlan, readRegistryFile, findKnowledgeRoot, readSubagentConfig } from "../knowledge/io";
import { spawnSubagent } from "../subagent/spawner";
import { resolveModelArg } from "../subagent/model-resolver";
import type { WorkerSpec, ReviewerSpec } from "../subagent/specs";
import { loadPrompt, getFinalOutput } from "../shared/utils";
import { registerSubagent, updateSubagentStatus, removeSubagent } from "../shared/subagent-state";
import { generateVerificationMatrix } from "../knowledge/verification";
import { validateExecutionConfigShape, validateSubagentConfigShape } from "../knowledge/schemas";

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

/**
 * Run localization guard on files-to-commit.json.
 * Returns pass/fail with guard output. Used automatically after worker commit.
 */
function runLocalizationGuard(cwd: string): { passed: boolean; output: string; isError: boolean } {
  const ftcPath = path.join(cwd, "files-to-commit.json");
  const ftc = readJson<{ files?: string[] }>(ftcPath);
  const files = ftc?.files ?? [];

  if (files.length === 0) {
    return { passed: true, output: "No files to check in files-to-commit.json", isError: false };
  }

  const scriptPath = path.join(cwd, "scripts", "check-docs-localization.sh");

  try {
    const result = spawnSync("bash", [scriptPath, ...files], {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
    });
    if (result.status === 0) {
      return { passed: true, output: result.stdout, isError: false };
    }
    return { passed: false, output: `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`, isError: true };
  } catch (err: any) {
    return { passed: false, output: `Localization guard exception: ${err.message}`, isError: true };
  }
}

// INV-11: Strictly sequential execution — state machine
let activeWorkerId: string | null = null;

export function registerAgentTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "loom_spawn_worker",
    label: "Spawn Worker",
    description: "Spawn a worker subagent to execute a plan step. Returns worker output.",
    parameters: Type.Object({
      task_id: Type.String(),
      step_number: Type.Number(),
      additional_context: Type.Optional(Type.String({ description: "Extra context for the worker" })),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      const plan = readPlan(dir);
      const task = readTask(dir);
      const config = readSubagentConfig(path.join(ctx.cwd, "knowledge", "project", "configs", "subagent-config.json"));

      if (!plan || !task) {
        return { content: [{ type: "text", text: `Task or plan not found for ${params.task_id}` }], isError: true };
      }

      const step = plan.steps.find((s: PlanStepData) => s.step_number === params.step_number);
      if (!step) {
        return { content: [{ type: "text", text: `Step ${params.step_number} not found` }], isError: true };
      }

      const workerPrompt = loadPrompt("subagent/prompts/worker");
      const taskContext = `${task.title} ${step.title} ${step.expected_output ?? ""} ${step.description}`;
      const model = resolveModelArg("worker", taskContext, ctx.cwd);
      const tools = config?.worker?.tools ?? ["read", "bash", "edit", "write"];

      // INV-11: Block concurrent worker spawn
      if (activeWorkerId) {
        return {
          content: [{ type: "text", text: `Worker "${activeWorkerId}" is already active. Cannot spawn another worker until it completes. Sequential execution enforced (INV-11).` }],
          isError: true,
        };
      }

      const workerId = `${params.task_id}-worker-step${params.step_number}`;
      activeWorkerId = workerId;

      try {
        const spec: WorkerSpec = {
          name: workerId,
          systemPrompt: workerPrompt,
          model,
          tools,
          task: `Task: ${task.title}\nStep ${step.step_number}: ${step.title}\n${step.description}\nExpected output: ${step.expected_output}\nConstraints: ${step.constraints?.join(", ") ?? "none"}\n${params.additional_context ?? ""}`,
          cwd: ctx.cwd,
        };

        const result = await spawnSubagent(spec, signal, (output) => {
          if (onUpdate) {
            onUpdate({ content: [{ type: "text", text: output }], details: { phase: "worker", step: params.step_number } });
          }
        });

        const output = getFinalOutput(result.messages);
        let workerError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";

        // Auto-run localization guard after successful worker commit
        let guardResult: { passed: boolean; output: string; isError: boolean } | undefined;
        if (!workerError) {
          guardResult = runLocalizationGuard(ctx.cwd);
          if (guardResult.isError) {
            workerError = true;
          }
        }

        const lines = [
          output || "(no output)",
          guardResult ? `\n--- Localization Guard ---\n${guardResult.passed ? "✅ PASSED" : "❌ FAILED"}\n${guardResult.output}` : "",
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text", text: lines }],
          details: { result: { exitCode: result.exitCode, usage: result.usage, model: result.model, stopReason: result.stopReason }, guardResult },
          isError: workerError,
        };
      } finally {
        activeWorkerId = null;
        updateSubagentStatus(workerId, "completed");
        removeSubagent(workerId);
      }
    },
  });

  pi.registerTool({
    name: "loom_spawn_reviewer",
    label: "Spawn Reviewer",
    description: "Spawn a reviewer subagent to review a worker commit. Returns review JSON.",
    parameters: Type.Object({
      task_id: Type.String(),
      step_number: Type.Number(),
      commit_hash: Type.String({ description: "Git commit hash to review" }),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      const plan = readPlan(dir);
      const task = readTask(dir);
      const config = readSubagentConfig(path.join(ctx.cwd, "knowledge", "project", "configs", "subagent-config.json"));

      if (!plan || !task) {
        return { content: [{ type: "text", text: `Task or plan not found for ${params.task_id}` }], isError: true };
      }

      const step = plan.steps.find((s: PlanStepData) => s.step_number === params.step_number);
      if (!step) {
        return { content: [{ type: "text", text: `Step ${params.step_number} not found` }], isError: true };
      }

      const reviewerPrompt = loadPrompt("subagent/prompts/reviewer");
      const invariantsStr = task.invariants.map((i: InvariantData) => i.id).join(", ");
      const reviewContext = `Review commit ${params.commit_hash}. Expected: ${step.expected_output}. Invariants: ${invariantsStr}`;
      const model = resolveModelArg("reviewer", reviewContext, ctx.cwd);
      const tools = config?.reviewer?.tools ?? ["read", "bash", "grep", "find", "ls"];

      const reviewerId = `${params.task_id}-reviewer-step${params.step_number}`;
      registerSubagent(reviewerId, {
        id: reviewerId,
        name: reviewerId,
        type: "reviewer",
        status: "running",
        model,
        step: params.step_number,
        taskId: params.task_id,
      });

      const spec: ReviewerSpec = {
        name: reviewerId,
        systemPrompt: reviewerPrompt,
        model,
        tools,
        task: `Review commit ${params.commit_hash} for task ${params.task_id} step ${params.step_number}.\nExpected output: ${step.expected_output ?? ""}\nInvariants: ${invariantsStr}`,
        targetCommit: params.commit_hash,
        planJsonPath: path.join(dir, "plan.json"),
        stepNumber: params.step_number,
        cwd: ctx.cwd,
      };

      try {
      const result = await spawnSubagent(spec, signal, (output) => {
        if (onUpdate) {
          onUpdate({ content: [{ type: "text", text: output }], details: { phase: "reviewer", step: params.step_number } });
        }
      });

      const output = getFinalOutput(result.messages);
      const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";

      // Attempt to parse review JSON from output
      let reviewJson: Record<string, unknown> | null = null;
      try {
        const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) reviewJson = JSON.parse(jsonMatch[1]);
        else reviewJson = JSON.parse(output);
      } catch {
        reviewJson = null;
      }

      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { reviewJson, result: { exitCode: result.exitCode, usage: result.usage } },
        isError: isError && !reviewJson,
      };
      } finally {
        updateSubagentStatus(reviewerId, isError ? "error" : "completed");
        removeSubagent(reviewerId);
      }
    },
  });

  pi.registerTool({
    name: "loom_update_task",
    label: "Update Task",
    description: "Update task.json or plan.json status, step status, etc.",
    parameters: Type.Object({
      task_id: Type.String(),
      step_number: Type.Optional(Type.Number()),
      step_status: Type.Optional(Type.String({ description: "pending | in_progress | done | blocked" })),
      task_status: Type.Optional(Type.String({ description: "draft | in_progress | completed | rejected" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      const taskPath = path.join(dir, "task.json");
      const planPath = path.join(dir, "plan.json");
      const registryPath = path.join(ctx.cwd, "knowledge", "tasks", "registry.json");

      if (params.task_status) {
        const task = readTask(dir);
        if (task) {
          task.status = params.task_status;
          task.updated_at = new Date().toISOString().split("T")[0];
          writeJson(taskPath, task);
        }

        const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
        const registry = knowledgeRoot ? readRegistryFile(knowledgeRoot) : null;
        if (registry) {
          const entry = registry.tasks.find((t) => t.task_id === params.task_id);
          if (entry) {
            entry.status = params.task_status;
            entry.updated_at = task?.updated_at ?? new Date().toISOString().split("T")[0];
            writeJson(registryPath, registry);
          }
        }
      }

      if (params.step_number && params.step_status) {
        const plan = readPlan(dir);
        if (plan) {
          const step = plan.steps.find((s: PlanStepData) => s.step_number === params.step_number);
          if (step) {
            step.status = params.step_status;
            writeJson(planPath, plan);
          }
        }
      }

      return {
        content: [{ type: "text", text: `Updated ${params.task_id}${params.step_number ? ` step ${params.step_number}` : ""}` }],
        details: { task_id: params.task_id, step_number: params.step_number, step_status: params.step_status, task_status: params.task_status },
      };
    },
  });

  pi.registerTool({
    name: "loom_read_artifact",
    label: "Read Artifact",
    description: "Read an artifact file from a task directory",
    parameters: Type.Object({
      task_id: Type.String(),
      artifact_path: Type.String({ description: "Relative path inside task dir, e.g. artifacts/summary.json" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const filePath = path.join(taskDir(ctx.cwd, params.task_id), params.artifact_path);
      const data = readJson<Record<string, unknown>>(filePath);
      if (data === null) {
        return { content: [{ type: "text", text: `Artifact not found: ${params.artifact_path}` }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        details: { artifact_path: params.artifact_path },
      };
    },
  });

  // Tool: Run localization guard on files from files-to-commit.json
  pi.registerTool({
    name: "loom_run_localization_guard",
    label: "Run Localization Guard",
    description: "Run localization guard on files listed in files-to-commit.json. Returns pass/fail with guard output.",
    parameters: Type.Object({
      task_id: Type.String(),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const ftcPath = path.join(ctx.cwd, "files-to-commit.json");
      const ftc = readJson<{ files?: string[] }>(ftcPath);
      const files = ftc?.files ?? [];

      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "No files to check in files-to-commit.json" }],
          details: { passed: true, files: [] },
        };
      }

      const scriptPath = path.join(ctx.cwd, "scripts", "check-docs-localization.sh");

      try {
        const result = spawnSync("bash", [scriptPath, ...files], {
          cwd: ctx.cwd,
          encoding: "utf-8",
          timeout: 30000,
        });
        if (result.status === 0) {
          return {
            content: [{ type: "text", text: `✅ Localization guard passed.\n\n${result.stdout}` }],
            details: { passed: true, files, output: result.stdout },
          };
        }
        return {
          content: [{ type: "text", text: `❌ Localization guard FAILED.\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}` }],
          details: { passed: false, files, stdout: result.stdout, stderr: result.stderr },
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `❌ Localization guard FAILED with exception: ${err.message}` }],
          details: { passed: false, files, error: err.message },
          isError: true,
        };
      }
    },
  });

  // Tool: Generate verification matrix
  pi.registerTool({
    name: "loom_verify_invariants",
    label: "Verify Invariants",
    description: "Generate verification matrix from all task invariants. Writes to knowledge/project/artifacts/verification-matrix.json.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const matrix = generateVerificationMatrix(ctx.cwd);
      const lines = [
        `Verification matrix generated: ${matrix.summary.total} invariants`,
        `  ✅ verified: ${matrix.summary.verified}`,
        `  🟡 defined: ${matrix.summary.defined}`,
        `  🔍 needs_audit: ${matrix.summary.needs_audit}`,
        `  ❌ failed: ${matrix.summary.failed}`,
        `  ⚪ unknown: ${matrix.summary.unknown}`,
        ``,
        `Written to: knowledge/project/artifacts/verification-matrix.json`,
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { summary: matrix.summary },
      };
    },
  });

  // Tool: Edit execution-config or subagent-config
  pi.registerTool({
    name: "loom_edit_config",
    label: "Edit Config",
    description: "Edit execution-config.json or subagent-config.json with partial updates. Deep-merges updates into existing config.",
    parameters: Type.Object({
      config_type: Type.String({ description: "execution | subagent" }),
      updates: Type.Record(Type.String(), Type.Any(), { description: "Partial JSON object to merge" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const configsDir = path.join(ctx.cwd, "knowledge", "project", "configs");
      const fileName = params.config_type === "subagent" ? "subagent-config.json" : "execution-config.json";
      const filePath = path.join(configsDir, fileName);

      const existing = readJson<Record<string, unknown>>(filePath) ?? {};

      function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        const result = { ...target };
        for (const key of Object.keys(source)) {
          const sv = source[key];
          const tv = result[key];
          if (sv !== null && typeof sv === "object" && !Array.isArray(sv) && tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
            result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
          } else {
            result[key] = sv;
          }
        }
        return result;
      }

      const merged = deepMerge(existing, params.updates as Record<string, unknown>);

      // Schema validation
      const validate = params.config_type === "subagent" ? validateSubagentConfigShape : validateExecutionConfigShape;
      const validationError = validate(merged);
      if (validationError) {
        return {
          content: [{ type: "text", text: `❌ Schema validation FAILED for ${fileName}:\n${validationError}\n\nMerged config was NOT saved.` }],
          details: { config_type: params.config_type, filePath, validationError },
          isError: true,
        };
      }

      writeJson(filePath, merged);

      return {
        content: [{ type: "text", text: `Updated ${fileName} at ${filePath}` }],
        details: { config_type: params.config_type, filePath },
      };
    },
  });
}


