/**
 * Plan Mode Tools — knowledge artifact management
 *
 * Tools:
 *   loom_create_task        — create task.json
 *   loom_create_plan        — create plan.json
 *   loom_add_invariant      — add invariant to task.json
 *   loom_add_delivery_unit  — add delivery unit to task.json
 *   loom_finalize_plan      — finalize plan, update registry, transition to agent mode
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { readJson, writeJson, readTask, readPlan, readRegistryFile, findKnowledgeRoot } from "../knowledge/io";
import { spawnSubagent } from "../subagent/spawner";
import { resolveModelArg } from "../subagent/model-resolver";
import type { WorkerSpec } from "../subagent/specs";
import { getFinalOutput, loadPrompt, sanitizeId } from "../shared/utils";
import { logger } from "../shared/logger";
import {
  validateStackModuleShape,
  validateContextResearchShape,
  validateMigrationAnalysisShape,
} from "../knowledge/schemas";
import {
  getStackJsonPath,
  getContextResearchPath,
  getMigrationAnalysisPath,
  getGeneratedAgentsMdPath,
  writeRule,
  writeArchitectureComponent,
  listRules,
  listArchitectureComponents,
  generateAgentsMd,
} from "../knowledge/onboarding";

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Onboarding Subagent Helper ────────────────────────────────────────────
// DRY helper for scout/researcher/migrator subagent execution

export async function runOnboardingSubagent(
  name: string,
  promptPath: string,
  taskDesc: string,
  outputPath: string,
  model: string | undefined,
  cwd: string,
  signal?: AbortSignal,
  validator?: (data: unknown) => string | null,
): Promise<{ parsed: unknown; outputPath: string; result: import("../subagent/specs").SubagentResult }> {
  const prompt = loadPrompt(promptPath);
  const spec: WorkerSpec = {
    name,
    systemPrompt: prompt,
    model,
    tools: ["read", "bash", "grep", "find", "ls"],
    task: taskDesc,
    cwd,
  };

  const result = await spawnSubagent(spec, signal);
  const output = getFinalOutput(result.messages);

  let parsed: unknown = null;
  try {
    const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[1]);
    else parsed = JSON.parse(output);
  } catch (err) {
    logger.warn("plan-tools", `Failed to parse subagent JSON output for ${name}`, err);
    parsed = null;
  }

  if (parsed) {
    if (validator) {
      const err = validator(parsed);
      if (err) {
        logger.warn("plan-tools", `${name} output validation failed`, err);
        parsed = null;
      }
    }
    if (parsed) {
      writeJson(outputPath, parsed);
    }
  }

  return { parsed, outputPath, result };
}

export function registerPlanTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "loom_create_task",
    label: "Create Task",
    description: "Create a new task directory with task.json",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID, e.g. TASK-2026-0004" }),
      slug: Type.String({ description: "URL-safe slug, e.g. agent-mode-impl" }),
      title: Type.String({ description: "Human-readable title" }),
      description: Type.String({ description: "Detailed description" }),
      priority: Type.String({ description: "Priority: critical | high | medium | low", default: "medium" }),
      parent_task_id: Type.Optional(Type.String({ description: "Parent task ID if subtask" })),
      parent_delivery_unit: Type.Optional(Type.String({ description: "Parent delivery unit ID" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      ensureDir(dir);

      const taskJson = {
        task_id: params.task_id,
        slug: params.slug,
        title: params.title,
        description: params.description,
        status: "draft",
        priority: params.priority,
        branch: `task/${params.task_id}`,
        parent_task_id: params.parent_task_id ?? undefined,
        parent_delivery_unit: params.parent_delivery_unit ?? undefined,
        invariants: [],
        delivery_units: [],
        created_at: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString().split("T")[0],
        schema_version: "1.0.0",
      };

      writeJson(path.join(dir, "task.json"), taskJson);

      // Create subdirectories
      for (const sub of ["artifacts", "reviews", "subagents"]) {
        ensureDir(path.join(dir, sub));
      }

      return {
        content: [{ type: "text", text: `Task ${params.task_id} created at ${dir}` }],
        details: { taskJson },
      };
    },
  });

  pi.registerTool({
    name: "loom_create_plan",
    label: "Create Plan",
    description: "Create plan.json for a task",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID" }),
      steps: Type.Array(
        Type.Object({
          step_number: Type.Number({ description: "Step number (1-based)" }),
          title: Type.String({ description: "Step title" }),
          description: Type.String({ description: "Step description" }),
          expected_output: Type.String({ description: "Expected output artifact(s)" }),
          constraints: Type.Optional(Type.Array(Type.String({ description: "Invariant IDs that constrain this step" }))),
          depends_on: Type.Optional(Type.Array(Type.Number({ description: "Step numbers this step depends on" }))),
          estimated_effort: Type.String({ description: "small | medium | large", default: "medium" }),
        }),
        { description: "Array of plan steps" },
      ),
      risks: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: "Risk ID" }),
            description: Type.String(),
            severity: Type.String({ default: "medium" }),
            mitigation: Type.String(),
          }),
        ),
      ),
      checkpoints: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: "Checkpoint ID" }),
            description: Type.String(),
            after_step: Type.Number(),
            verification: Type.String(),
          }),
        ),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);

      // Enrich plan context with retrieval if v2 enabled
      const taskDesc = params.steps.slice(0, 3).map((s: { title: string; description: string }) => `${s.title}: ${s.description}`).join(". ");
      const enrichment = taskDesc ? await enrichPlanContext(ctx.cwd, taskDesc) : "";

      const planJson = {
        task_id: params.task_id,
        steps: params.steps.map((s) => ({
          ...s,
          status: "pending",
          constraints: s.constraints ?? [],
          depends_on: s.depends_on ?? [],
        })),
        risks: params.risks ?? [],
        checkpoints: params.checkpoints ?? [],
      };

      writeJson(path.join(dir, "plan.json"), planJson);

      const enrichmentNote = enrichment ? `\n\n--- Knowledge from Previous Tasks ---\n${enrichment}` : "";
      return {
        content: [{ type: "text", text: `Plan created for ${params.task_id} with ${params.steps.length} steps${enrichmentNote}` }],
        details: { planJson },
      };
    },
  });

  pi.registerTool({
    name: "loom_add_invariant",
    label: "Add Invariant",
    description: "Add an invariant to a task.json",
    parameters: Type.Object({
      task_id: Type.String(),
      invariant_id: Type.String(),
      text: Type.String({ description: "Human-readable description" }),
      marker: Type.String({ description: "Machine marker: INVARIANT: ..." }),
      verification_method: Type.String({ description: "How to verify this invariant" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      const filePath = path.join(dir, "task.json");
      const task = readTask(dir);
      if (!task) {
        return { content: [{ type: "text", text: `Task ${params.task_id} not found` }], isError: true };
      }

      task.invariants.push({
        id: params.invariant_id,
        text: params.text,
        marker: params.marker,
        status: "defined",
        verification_method: params.verification_method,
      });
      task.updated_at = new Date().toISOString().split("T")[0];
      writeJson(filePath, task);

      return {
        content: [{ type: "text", text: `Invariant ${params.invariant_id} added to ${params.task_id}` }],
        details: { invariant: params.invariant_id },
      };
    },
  });

  pi.registerTool({
    name: "loom_add_delivery_unit",
    label: "Add Delivery Unit",
    description: "Add a delivery unit to a task.json",
    parameters: Type.Object({
      task_id: Type.String(),
      du_id: Type.String(),
      purpose: Type.String(),
      base_branch: Type.String({ default: "main" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);
      const filePath = path.join(dir, "task.json");
      const task = readTask(dir);
      if (!task) {
        return { content: [{ type: "text", text: `Task ${params.task_id} not found` }], isError: true };
      }

      task.delivery_units.push({
        id: params.du_id,
        status: "draft",
        purpose: params.purpose,
        base_branch: params.base_branch,
      });
      task.updated_at = new Date().toISOString().split("T")[0];
      writeJson(filePath, task);

      return {
        content: [{ type: "text", text: `Delivery unit ${params.du_id} added to ${params.task_id}` }],
        details: { du_id: params.du_id },
      };
    },
  });

  pi.registerTool({
    name: "loom_finalize_plan",
    label: "Finalize Plan",
    description: "Finalize plan: update registry, create markdown derivatives, mark task ready",
    parameters: Type.Object({
      task_id: Type.String(),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = taskDir(ctx.cwd, params.task_id);

      const task = readTask(dir);
      const plan = readPlan(dir);

      if (!task) {
        return { content: [{ type: "text", text: `Task ${params.task_id} not found` }], isError: true };
      }
      if (!plan) {
        return { content: [{ type: "text", text: `Plan for ${params.task_id} not found` }], isError: true };
      }

      // Update task status
      task.status = "draft";
      task.updated_at = new Date().toISOString().split("T")[0];
      writeJson(path.join(dir, "task.json"), task);

      // Update registry
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd) ?? path.join(ctx.cwd, "knowledge");
      const registry = readRegistryFile(knowledgeRoot) ?? { schema_version: "1.0.0", tasks: [] };
      const existingIndex = registry.tasks.findIndex((t) => t.task_id === params.task_id);
      const entry = {
        task_id: params.task_id,
        slug: task.slug,
        title: task.title,
        status: "draft",
        priority: task.priority,
        branch: task.branch,
        parent_task_id: task.parent_task_id,
        parent_delivery_unit: task.parent_delivery_unit,
        created_at: task.created_at,
        updated_at: task.updated_at,
      };

      if (existingIndex >= 0) {
        registry.tasks[existingIndex] = entry;
      } else {
        registry.tasks.push(entry);
      }
      writeJson(path.join(knowledgeRoot, "tasks", "registry.json"), registry);

      // Generate derivative markdown (basic)
      const taskMd = `# ${task.title}\n\n**Task ID:** ${task.task_id}\n\n**Status:** ${task.status}\n**Priority:** ${task.priority}\n**Branch:** ${task.branch}\n\n## Description\n\n${task.description}\n\n## Invariants\n\n${task.invariants.map((i) => `- **${i.id}**: ${i.text}`).join("\n")}\n\n## Delivery Units\n\n${task.delivery_units.map((d) => `- **${d.id}**: ${d.purpose} (status: ${d.status})`).join("\n")}\n\n---\n\n*Generated from task.json*\n`;
      fs.writeFileSync(path.join(dir, "task.md"), taskMd, "utf-8");

      const planMd = `# Plan: ${task.title}\n\n**Task ID:** ${task.task_id}\n\n## Steps\n\n${plan.steps.map((s) => `${s.step_number}. **${s.title}** — ${s.description}\n   - Expected: ${s.expected_output}\n   - Effort: ${s.estimated_effort}\n   - Status: ${s.status}`).join("\n\n")}\n\n---\n\n*Generated from plan.json*\n`;
      fs.writeFileSync(path.join(dir, "plan.md"), planMd, "utf-8");

      return {
        content: [
          { type: "text", text: `Plan finalized for ${params.task_id}. Registry updated. Markdown derivatives generated.` },
        ],
        details: { task_id: params.task_id, registry_updated: true },
      };
    },
  });

  pi.registerTool({
    name: "loom_spawn_subagent",
    label: "Spawn Subagent",
    description: "Spawn a research/analysis subagent during planning phase",
    parameters: Type.Object({
      task_id: Type.String({ description: "Task ID context" }),
      name: Type.String({ description: "Subagent name" }),
      instruction: Type.String({ description: "Task instruction for the subagent" }),
      model: Type.Optional(Type.String({ description: "Override model" })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const scoutModel = params.model ?? resolveModelArg("scout", params.instruction, ctx.cwd);

      const spec: WorkerSpec = {
        name: `${params.task_id}-${params.name}`,
        systemPrompt: "You are a research/analysis subagent for loom Plan Mode. Analyze the given task and return structured findings.",
        model: scoutModel,
        tools: ["read", "bash", "grep", "find", "ls"],
        task: params.instruction,
        cwd: ctx.cwd,
      };

      const result = await spawnSubagent(spec, signal);
      const output = getFinalOutput(result.messages);

      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { result: { exitCode: result.exitCode, usage: result.usage, model: result.model, stopReason: result.stopReason } },
        isError: result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted",
      };
    },
  });

  // ── Onboarding Subagent Tools ───────────────────────────────────────────

  pi.registerTool({
    name: "loom_run_scout",
    label: "Run Scout",
    description: "Run the scout subagent to analyze codebase and produce stack.json",
    parameters: Type.Object({
      output_path: Type.Optional(Type.String({ description: "Override output path for stack.json" })),
      model: Type.Optional(Type.String()),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outputPath = params.output_path ?? getStackJsonPath(ctx.cwd);
      const model = params.model ?? resolveModelArg("scout", "scout codebase analysis", ctx.cwd);
      const { parsed, outputPath: out, result } = await runOnboardingSubagent(
        "loom-scout",
        "subagent/prompts/scout",
        `Analyze the project at ${ctx.cwd}. Produce a stack.json artifact describing the technology stack and module map. Save the final JSON to ${outputPath}.`,
        outputPath,
        model,
        ctx.cwd,
        signal,
        validateStackModuleShape,
      );
      return {
        content: [{ type: "text", text: `Scout completed. Output saved to ${out}.` }],
        details: { outputPath: out, parsed: !!parsed, result: { exitCode: result.exitCode, usage: result.usage } },
        isError: !parsed || result.exitCode !== 0,
      };
    },
  });

  pi.registerTool({
    name: "loom_run_researcher",
    label: "Run Researcher",
    description: "Run the research subagent to analyze docs and produce context-research.json",
    parameters: Type.Object({
      output_path: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outputPath = params.output_path ?? getContextResearchPath(ctx.cwd);
      const model = params.model ?? resolveModelArg("general", "documentation research", ctx.cwd);
      const { parsed, outputPath: out, result } = await runOnboardingSubagent(
        "loom-researcher",
        "subagent/prompts/researcher",
        `Analyze documentation and configuration in ${ctx.cwd}. Produce context-research.json. Save to ${outputPath}.`,
        outputPath,
        model,
        ctx.cwd,
        signal,
        validateContextResearchShape,
      );
      return {
        content: [{ type: "text", text: `Researcher completed. Output saved to ${out}.` }],
        details: { outputPath: out, parsed: !!parsed, result: { exitCode: result.exitCode, usage: result.usage } },
        isError: !parsed || result.exitCode !== 0,
      };
    },
  });

  pi.registerTool({
    name: "loom_run_migrator",
    label: "Run Migrator",
    description: "Run the migration subagent to detect foreign systems and produce migration-analysis.json",
    parameters: Type.Object({
      output_path: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outputPath = params.output_path ?? getMigrationAnalysisPath(ctx.cwd);
      const model = params.model ?? resolveModelArg("general", "migration analysis", ctx.cwd);
      const { parsed, outputPath: out, result } = await runOnboardingSubagent(
        "loom-migrator",
        "subagent/prompts/migrator",
        `Analyze ${ctx.cwd} for foreign task/knowledge systems. Produce migration-analysis.json. Save to ${outputPath}.`,
        outputPath,
        model,
        ctx.cwd,
        signal,
        validateMigrationAnalysisShape,
      );
      return {
        content: [{ type: "text", text: `Migrator completed. Output saved to ${out}.` }],
        details: { outputPath: out, parsed: !!parsed, result: { exitCode: result.exitCode, usage: result.usage } },
        isError: !parsed || result.exitCode !== 0,
      };
    },
  });

  // ── Catalog Tools ───────────────────────────────────────────────────────

  pi.registerTool({
    name: "loom_add_rule",
    label: "Add Rule",
    description: "Add a project rule to the rules catalog (knowledge/project/rules/)",
    parameters: Type.Object({
      id: Type.String(),
      category: Type.String({ enum: ["naming", "error-handling", "testing", "api-design", "dependencies", "style", "security", "performance", "documentation", "git", "localization", "other"] }),
      title: Type.String(),
      body: Type.String(),
      scope: Type.Optional(Type.Array(Type.String())),
      source_type: Type.String({ default: "operator" }),
      source_ref: Type.String({ default: "manual" }),
      status: Type.String({ default: "proposed" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const today = new Date().toISOString().split("T")[0];
      const rule = {
        id: params.id,
        category: params.category,
        title: params.title,
        body: params.body,
        scope: params.scope ?? ["*"],
        source: {
          type: params.source_type,
          ref: params.source_ref,
        },
        status: params.status,
        evidence: [],
        created_at: today,
        updated_at: today,
        version: 1,
      };

      const safeId = sanitizeId(params.id);
      const sanitizedRule = { ...rule, id: safeId };
      const filePath = writeRule(ctx.cwd, sanitizedRule);
      return {
        content: [{ type: "text", text: `Rule ${safeId} added. File: ${filePath}` }],
        details: { rule: sanitizedRule, filePath },
      };
    },
  });

  pi.registerTool({
    name: "loom_list_rules",
    label: "List Rules",
    description: "List all rules in the project rules catalog",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const rules = listRules(ctx.cwd);
      if (rules.length === 0) {
        return { content: [{ type: "text", text: "Нет зарегистрированных правил." }] };
      }
      const lines = rules.map((r) => `- ${r.id} [${r.category}] ${r.title} (${r.status})`);
      return {
        content: [{ type: "text", text: `Правил: ${rules.length}\n${lines.join("\n")}` }],
        details: { count: rules.length, rules },
      };
    },
  });

  pi.registerTool({
    name: "loom_add_architecture_component",
    label: "Add Architecture Component",
    description: "Add an architecture component to the catalog (knowledge/project/architecture/components/)",
    parameters: Type.Object({
      id: Type.String(),
      name: Type.String(),
      layer: Type.String({ enum: ["domain", "application", "infrastructure", "presentation", "external"] }),
      responsibilities: Type.Array(Type.String()),
      files: Type.Array(Type.String()),
      dependencies: Type.Optional(Type.Array(Type.String())),
      interfaces: Type.Optional(Type.Array(Type.Object({
        name: Type.String(),
        type: Type.String({ enum: ["api", "event", "db", "file", "cli"] }),
        contract: Type.String(),
        consumers: Type.Array(Type.String()),
      }))),
      status: Type.String({ default: "discovered" }),
      source_type: Type.String({ default: "operator-defined" }),
      source_ref: Type.String({ default: "manual" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const comp = {
        id: params.id,
        name: params.name,
        layer: params.layer,
        responsibilities: params.responsibilities,
        files: params.files,
        dependencies: params.dependencies ?? [],
        interfaces: params.interfaces ?? [],
        status: params.status,
        source: {
          type: params.source_type,
          ref: params.source_ref,
        },
      };

      const safeId = sanitizeId(params.id);
      const sanitizedComp = { ...comp, id: safeId };
      const filePath = writeArchitectureComponent(ctx.cwd, sanitizedComp);
      return {
        content: [{ type: "text", text: `Component ${safeId} added. File: ${filePath}` }],
        details: { component: sanitizedComp, filePath },
      };
    },
  });

  pi.registerTool({
    name: "loom_list_architecture_components",
    label: "List Architecture Components",
    description: "List all architecture components in the catalog",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const comps = listArchitectureComponents(ctx.cwd);
      if (comps.length === 0) {
        return { content: [{ type: "text", text: "Нет зарегистрированных компонентов." }] };
      }
      const lines = comps.map((c) => `- ${c.id} [${c.layer}] ${c.name} (${c.status})`);
      return {
        content: [{ type: "text", text: `Компонентов: ${comps.length}\n${lines.join("\n")}` }],
        details: { count: comps.length, components: comps },
      };
    },
  });

  pi.registerTool({
    name: "loom_generate_agents_md",
    label: "Generate AGENTS.md",
    description: "Generate AGENTS.md from onboarding artifacts and catalogs",
    parameters: Type.Object({
      project_name: Type.String({ default: "Project" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stack = readJson<Record<string, unknown>>(getStackJsonPath(ctx.cwd));
      const research = readJson<Record<string, unknown>>(getContextResearchPath(ctx.cwd));
      const rulesRaw = listRules(ctx.cwd);
      const compsRaw = listArchitectureComponents(ctx.cwd);
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd) ?? path.join(ctx.cwd, "knowledge");
      const registry = readRegistryFile(knowledgeRoot);

      const rules = rulesRaw.map((r) => {
        const full = readJson(path.join(ctx.cwd, "knowledge", "project", "rules", `${r.id}.json`));
        return full ?? r;
      });
      const components = compsRaw.map((c) => {
        const full = readJson(path.join(ctx.cwd, "knowledge", "project", "architecture", "components", `${c.id}.json`));
        return full ?? c;
      });

      // Auto-detect project name: stack.json name > package.json name > directory basename
      let projectName = params.project_name ?? "Project";
      if (projectName === "Project") {
        const stackName = stack?.name as string | undefined;
        if (stackName) {
          projectName = stackName;
        } else {
          const pkgJson = readJson<{ name?: string }>(path.join(ctx.cwd, "package.json"));
          if (pkgJson?.name) projectName = pkgJson.name;
          else projectName = path.basename(ctx.cwd);
        }
      }

      // Load invariants from task.json for each task
      const tasksWithInvariants = registry?.tasks?.map((t) => {
        const taskJsonPath = path.join(ctx.cwd, "knowledge", "tasks", t.task_id, "task.json");
        const taskJson = readJson<{ invariants?: Array<{ id: string; text: string; marker: string; status: string }> }>(taskJsonPath);
        return {
          task_id: t.task_id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          branch: t.branch,
          invariants: taskJson?.invariants,
        };
      }) ?? undefined;

      const md = generateAgentsMd({
        projectName,
        stack,
        research,
        rules,
        components,
        tasks: tasksWithInvariants,
      });

      const outPath = getGeneratedAgentsMdPath(ctx.cwd);
      fs.writeFileSync(outPath, md, "utf-8");

      return {
        content: [{ type: "text", text: `AGENTS.md generated at ${outPath}` }],
        details: { path: outPath, tasks_included: registry?.tasks?.length ?? 0 },
      };
    },
  });
}
