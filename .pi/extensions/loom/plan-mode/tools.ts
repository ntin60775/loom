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
import { Type } from "typebox";
import { readJson, writeJson } from "../knowledge/io";

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
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

      return {
        content: [{ type: "text", text: `Plan created for ${params.task_id} with ${params.steps.length} steps` }],
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
      const filePath = path.join(taskDir(ctx.cwd, params.task_id), "task.json");
      const task = readJson<any>(filePath);
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
      const filePath = path.join(taskDir(ctx.cwd, params.task_id), "task.json");
      const task = readJson<any>(filePath);
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
      const taskPath = path.join(dir, "task.json");
      const planPath = path.join(dir, "plan.json");

      const task = readJson<any>(taskPath);
      const plan = readJson<any>(planPath);

      if (!task) {
        return { content: [{ type: "text", text: `Task ${params.task_id} not found` }], isError: true };
      }
      if (!plan) {
        return { content: [{ type: "text", text: `Plan for ${params.task_id} not found` }], isError: true };
      }

      // Update task status
      task.status = "draft";
      task.updated_at = new Date().toISOString().split("T")[0];
      writeJson(taskPath, task);

      // Update registry
      const registryPath = path.join(ctx.cwd, "knowledge", "tasks", "registry.json");
      const registry = readJson<any>(registryPath) ?? { schema_version: "1.0.0", tasks: [] };
      const existingIndex = registry.tasks.findIndex((t: any) => t.task_id === params.task_id);
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
      writeJson(registryPath, registry);

      // Generate derivative markdown (basic)
      const taskMd = `# ${task.title}\n\n**Task ID:** ${task.task_id}\n\n**Status:** ${task.status}\n**Priority:** ${task.priority}\n**Branch:** ${task.branch}\n\n## Description\n\n${task.description}\n\n## Invariants\n\n${task.invariants.map((i: any) => `- **${i.id}**: ${i.text}`).join("\n")}\n\n## Delivery Units\n\n${task.delivery_units.map((d: any) => `- **${d.id}**: ${d.purpose} (status: ${d.status})`).join("\n")}\n\n---\n\n*Generated from task.json*\n`;
      fs.writeFileSync(path.join(dir, "task.md"), taskMd, "utf-8");

      const planMd = `# Plan: ${task.title}\n\n**Task ID:** ${task.task_id}\n\n## Steps\n\n${plan.steps.map((s: any) => `${s.step_number}. **${s.title}** — ${s.description}\n   - Expected: ${s.expected_output}\n   - Effort: ${s.estimated_effort}\n   - Status: ${s.status}`).join("\n\n")}\n\n---\n\n*Generated from plan.json*\n`;
      fs.writeFileSync(path.join(dir, "plan.md"), planMd, "utf-8");

      return {
        content: [
          { type: "text", text: `Plan finalized for ${params.task_id}. Registry updated. Markdown derivatives generated.` },
        ],
        details: { task_id: params.task_id, registry_updated: true },
      };
    },
  });
}
