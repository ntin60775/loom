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
import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readJson, writeJson, readTask, readPlan, readRegistryFile, findKnowledgeRoot, readSubagentConfig, readExecutionConfig } from "../knowledge/io";
import { spawnSubagent } from "../subagent/spawner";
import { resolveModelArg } from "../subagent/model-resolver";
import type { WorkerSpec, ReviewerSpec } from "../subagent/specs";
import { loadPrompt, getFinalOutput } from "../shared/utils";
import { logger } from "../shared/logger";
import { registerSubagent, updateSubagentStatus, removeSubagent } from "../shared/subagent-state";
import { registerPersistentSubagent, updatePersistentSubagent } from "../subagent/persistent-registry";
import { generateVerificationMatrix } from "../knowledge/verification";
import type { PlanStepData, InvariantData } from "../knowledge/types";
import { validateExecutionConfigShape, validateSubagentConfigShape } from "../knowledge/schemas";
import { buildMemoryContext } from "../memory";
import { assembleV2Context } from "../shared/context-provider";

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

/**
 * Run localization guard on files-to-commit.json.
 * Returns pass/fail with guard output. Used automatically after worker commit.
 * Async — uses spawn instead of spawnSync.
 */
async function runLocalizationGuard(cwd: string): Promise<{ passed: boolean; output: string; isError: boolean }> {
  const ftcPath = path.join(cwd, "files-to-commit.json");
  const ftc = readJson<{ files?: string[] }>(ftcPath);
  const files = ftc?.files ?? [];

  if (files.length === 0) {
    return { passed: true, output: "No files to check in files-to-commit.json", isError: false };
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
        resolve({ passed: true, output: stdout, isError: false });
      } else {
        resolve({ passed: false, output: `stdout:\n${stdout}\n\nstderr:\n${stderr}`, isError: true });
      }
    });

    proc.on("error", (err) => {
      resolve({ passed: false, output: `Localization guard exception: ${err.message}`, isError: true });
    });
  });
}

// INV-11: Strictly sequential execution — mutex prevents concurrent worker spawn
const workerLock = (() => {
  let locked = false;
  return {
    tryAcquire(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    release(): void {
      locked = false;
    },
  };
})();
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

      // v2 context: memory + scout retrieval via unified provider
      const v2Result = await assembleV2Context(ctx.cwd, params.task_id, step.description, "project", 5);
      const v2Context = v2Result.disabled ? "" : v2Result.combined;

      // INV-11: Block concurrent worker spawn via mutex
      if (!workerLock.tryAcquire()) {
        return {
          content: [{ type: "text", text: `Worker "${activeWorkerId}" is already active. Cannot spawn another worker until it completes. Sequential execution enforced (INV-11).` }],
          isError: true,
        };
      }

      const workerId = `${params.task_id}-worker-step${params.step_number}`;
      activeWorkerId = workerId;

      // P2 fix: create AbortController for real subagent kill
      const abortController = new AbortController();
      // Cascade: if tool signal fires, abort our controller too
      if (signal) {
        if (signal.aborted) abortController.abort();
        else signal.addEventListener("abort", () => abortController.abort(), { once: true });
      }
      registerSubagent(workerId, {
        id: workerId,
        name: workerId,
        type: "worker",
        status: "running",
        model,
        step: params.step_number,
        taskId: params.task_id,
        controller: abortController,
      });
      registerPersistentSubagent(ctx.cwd, {
        id: workerId,
        name: workerId,
        type: "worker",
        task_id: params.task_id,
        step_number: params.step_number,
        model,
        status: "running",
      });

      try {
        const spec: WorkerSpec = {
          name: workerId,
          systemPrompt: workerPrompt,
          model,
          tools,
          task: `Task: ${task.title}\nStep ${step.step_number}: ${step.title}\n${step.description}\nExpected output: ${step.expected_output}\nConstraints: ${step.constraints?.join(", ") ?? "none"}\n${v2Context}${params.additional_context ?? ""}`,
          cwd: ctx.cwd,
        };

        const result = await spawnSubagent(spec, abortController.signal, (output) => {
          if (onUpdate) {
            onUpdate({ content: [{ type: "text", text: output }], details: { phase: "worker", step: params.step_number } });
          }
        }, (readExecutionConfig(path.join(ctx.cwd, "knowledge", "project", "configs", "execution-config.json"))?.timeout?.worker ?? 3600) * 1000);

        const output = getFinalOutput(result.messages);
        let workerError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";

        // Auto-run localization guard after successful worker commit
        let guardResult: { passed: boolean; output: string; isError: boolean } | undefined;
        if (!workerError) {
          guardResult = await runLocalizationGuard(ctx.cwd);
          if (guardResult.isError) {
            workerError = true;
          }
        }

        // P1 fix: rollback step to "pending" on worker error
        if (workerError && step) {
          const planPath = path.join(dir, "plan.json");
          step.status = "pending";
          writeJson(planPath, plan);
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
        workerLock.release();
        updateSubagentStatus(workerId, "completed");
        removeSubagent(workerId);
        updatePersistentSubagent(ctx.cwd, workerId, {
          status: workerError ? "error" : "completed",
          exit_code: 0,
        });
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

      // v2 context: memory for reviewer via unified provider
      const v2Result = await assembleV2Context(ctx.cwd, params.task_id);
      const v2Context = v2Result.disabled ? "" : v2Result.combined;

      const reviewerId = `${params.task_id}-reviewer-step${params.step_number}`;

      // P2 fix: create AbortController for real subagent kill
      const reviewAbortController = new AbortController();
      if (signal) {
        if (signal.aborted) reviewAbortController.abort();
        else signal.addEventListener("abort", () => reviewAbortController.abort(), { once: true });
      }
      registerSubagent(reviewerId, {
        id: reviewerId,
        name: reviewerId,
        type: "reviewer",
        status: "running",
        model,
        step: params.step_number,
        taskId: params.task_id,
        controller: reviewAbortController,
      });
      registerPersistentSubagent(ctx.cwd, {
        id: reviewerId,
        name: reviewerId,
        type: "reviewer",
        task_id: params.task_id,
        step_number: params.step_number,
        model,
        status: "running",
      });

      const spec: ReviewerSpec = {
        name: reviewerId,
        systemPrompt: reviewerPrompt,
        model,
        tools,
        task: `Review commit ${params.commit_hash} for task ${params.task_id} step ${params.step_number}.\nExpected output: ${step.expected_output ?? ""}\nInvariants: ${invariantsStr}${v2Context}`,
        targetCommit: params.commit_hash,
        planJsonPath: path.join(dir, "plan.json"),
        stepNumber: params.step_number,
        cwd: ctx.cwd,
      };

      let reviewerError = false;
      let reviewJson: Record<string, unknown> | null = null;
      try {
        const result = await spawnSubagent(spec, reviewAbortController.signal, (output) => {
          if (onUpdate) {
            onUpdate({ content: [{ type: "text", text: output }], details: { phase: "reviewer", step: params.step_number } });
          }
        }, (readExecutionConfig(path.join(ctx.cwd, "knowledge", "project", "configs", "execution-config.json"))?.timeout?.reviewer ?? 1800) * 1000);

        const output = getFinalOutput(result.messages);
        reviewerError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";

        // Attempt to parse review JSON from output
        try {
          const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/);
          if (jsonMatch) reviewJson = JSON.parse(jsonMatch[1]);
          else reviewJson = JSON.parse(output);
        } catch (err) {
          logger.warn("tools", "Failed to parse reviewer JSON output", err);
          reviewJson = null;
        }

        return {
          content: [{ type: "text", text: output || "(no output)" }],
          details: { reviewJson, result: { exitCode: result.exitCode, usage: result.usage } },
          isError: reviewerError && !reviewJson,
        };
      } finally {
        updateSubagentStatus(reviewerId, reviewerError ? "error" : "completed");
        removeSubagent(reviewerId);
        updatePersistentSubagent(ctx.cwd, reviewerId, {
          status: reviewerError ? "error" : "completed",
          exit_code: 0,
        });
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
      task_status: Type.Optional(Type.String({ description: "draft | active | completed | rejected" })),
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

        // P3 fix: auto-regenerate verification matrix on task completion
        if (params.task_status === "completed") {
          generateVerificationMatrix(ctx.cwd);
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

      const guardResult = await runLocalizationGuard(ctx.cwd);
      if (guardResult.passed) {
        return {
          content: [{ type: "text", text: `✅ Localization guard passed.\n\n${guardResult.output}` }],
          details: { passed: true, files, output: guardResult.output },
        };
      }
      return {
        content: [{ type: "text", text: `❌ Localization guard FAILED.\n\n${guardResult.output}` }],
        details: { passed: false, files, output: guardResult.output },
        isError: true,
      };
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

  // Tool: Search knowledge via scout retrieval (v2 only)
  pi.registerTool({
    name: "loom_search_knowledge",
    label: "Поиск знаний",
    description: "Поиск релевантных знаний через scout subagent. Доступен только при use_memory_v2: true.",
    parameters: Type.Object({
      query: Type.String({ description: "Поисковый запрос на естественном языке" }),
      scope: Type.String({ default: "project", description: "Область поиска: task | project | domain" }),
      limit: Type.Number({ default: 10, description: "Максимальное количество результатов" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const execConfigPath = path.join(ctx.cwd, "knowledge", "project", "configs", "execution-config.json");
      const execConfig = readJson<Record<string, unknown>>(execConfigPath);
      if (!execConfig || execConfig.use_memory_v2 !== true) {
        return {
          content: [{ type: "text", text: "Ошибка: поиск знаний доступен только при use_memory_v2: true в execution-config.json" }],
          isError: true,
        };
      }

      try {
        const { ScoutRetrieval } = await import("../retrieval/scout-retrieval");
        const retrieval = new ScoutRetrieval({ cwd: ctx.cwd });
        const validScope = ["task", "project", "domain"].includes(params.scope) ? params.scope as import("../retrieval/scope-filter").Scope : "project";
        const result = await retrieval.searchKnowledge(params.query, validScope, params.limit);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { query: params.query, scope: params.scope, resultCount: result.results.length, cached: result.cached },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `❌ Ошибка поиска знаний: ${msg}` }],
          isError: true,
        };
      }
    },
  });
}


