/**
 * Knowledge Schemas — TypeBox definitions for loom artifacts
 *
 * Invariant: JSON primary, markdown derivative (INV-1)
 */

import { Type } from "typebox";

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
