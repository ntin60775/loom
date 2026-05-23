/**
 * Knowledge Schemas — TypeBox definitions for loom artifacts
 *
 * Invariant: JSON primary, markdown derivative (INV-1)
 */

import { Type } from "@earendil-works/pi-ai";

export const TaskSchema = Type.Object({
  task_id: Type.String(),
  slug: Type.String(),
  title: Type.String(),
  description: Type.String(),
  status: Type.String({ default: "draft" }),
  priority: Type.String({ default: "medium" }),
  branch: Type.String(),
  parent_task_id: Type.Optional(Type.String()),
  parent_delivery_unit: Type.Optional(Type.String()),
  invariants: Type.Array(
    Type.Object({
      id: Type.String(),
      text: Type.String(),
      marker: Type.String(),
      status: Type.String({ default: "defined" }),
      verification_method: Type.String(),
    }),
  ),
  delivery_units: Type.Array(
    Type.Object({
      id: Type.String(),
      status: Type.String({ default: "draft" }),
      purpose: Type.String(),
      base_branch: Type.String({ default: "main" }),
    }),
  ),
  created_at: Type.String(),
  updated_at: Type.String(),
  schema_version: Type.String({ default: "1.0.0" }),
});

export const PlanStepSchema = Type.Object({
  step_number: Type.Number(),
  title: Type.String(),
  description: Type.String(),
  expected_output: Type.String(),
  constraints: Type.Optional(Type.Array(Type.String())),
  depends_on: Type.Optional(Type.Array(Type.Number())),
  estimated_effort: Type.String({ default: "medium" }),
  status: Type.String({ default: "pending" }),
});

export const PlanSchema = Type.Object({
  task_id: Type.String(),
  steps: Type.Array(PlanStepSchema),
  risks: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        description: Type.String(),
        severity: Type.String({ default: "medium" }),
        mitigation: Type.String(),
      }),
    ),
  ),
  checkpoints: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        description: Type.String(),
        after_step: Type.Number(),
        verification: Type.String(),
      }),
    ),
  ),
});

export const RegistryEntrySchema = Type.Object({
  task_id: Type.String(),
  slug: Type.String(),
  title: Type.String(),
  status: Type.String(),
  priority: Type.String(),
  branch: Type.String(),
  parent_task_id: Type.Optional(Type.String()),
  parent_delivery_unit: Type.Optional(Type.String()),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export const RegistrySchema = Type.Object({
  schema_version: Type.String({ default: "1.0.0" }),
  tasks: Type.Array(RegistryEntrySchema),
});

export const ReviewFindingSchema = Type.Object({
  severity: Type.String({ enum: ["blocker", "warning", "note"] }),
  message: Type.String(),
  file_path: Type.Optional(Type.String()),
  line_number: Type.Optional(Type.Number()),
});

export const ReviewSchema = Type.Object({
  verdict: Type.String({ enum: ["approve", "reject", "needs_discussion"] }),
  commit: Type.String(),
  step_number: Type.Number(),
  findings: Type.Array(ReviewFindingSchema),
  recommendations: Type.Optional(Type.String()),
  reviewer_model: Type.Optional(Type.String()),
  reviewed_at: Type.String(),
});

// ── Runtime Validators ────────────────────────────────────────────────────
// Simple structural checks without TypeGuard dependency

type ValidatorFn = (data: unknown) => string | null;

export function validateTaskShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  const required = ["task_id", "slug", "title", "description", "status", "branch", "created_at", "updated_at"];
  for (const key of required) {
    if (!(key in obj)) return `missing required field: ${key}`;
  }
  if (typeof obj.task_id !== "string" || !obj.task_id.startsWith("TASK-")) return "invalid task_id";
  if (!Array.isArray(obj.invariants)) return "invariants must be an array";
  if (!Array.isArray(obj.delivery_units)) return "delivery_units must be an array";
  return null;
}

export function validatePlanShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("task_id" in obj)) return "missing task_id";
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) return "steps must be a non-empty array";
  return null;
}

export function validateRegistryShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("tasks" in obj) || !Array.isArray(obj.tasks)) return "tasks must be an array";
  return null;
}

export function validateReviewShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  const required = ["verdict", "commit", "step_number", "findings", "reviewed_at"];
  for (const key of required) {
    if (!(key in obj)) return `missing required field: ${key}`;
  }
  if (!["approve", "reject", "needs_discussion"].includes(obj.verdict as string)) return "invalid verdict";
  if (!Array.isArray(obj.findings)) return "findings must be an array";
  return null;
}
