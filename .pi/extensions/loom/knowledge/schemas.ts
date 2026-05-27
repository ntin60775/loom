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
  execution_mode: Type.Optional(Type.String({ default: "auto", enum: ["auto", "direct", "subagent"] })),
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
      subtask_id: Type.Optional(Type.String()),
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

export const DomainRuleSchema = Type.Object({
  extension: Type.Optional(Type.String()),
  domain: Type.String(),
  default: Type.Optional(Type.String()),
});

export const SubagentConfigSchema = Type.Object({
  domains: Type.Record(
    Type.String(),
    Type.Object({
      provider: Type.String(),
      model: Type.String(),
      thinking: Type.Optional(Type.String()),
    }),
  ),
  reviewer: Type.Optional(
    Type.Object({
      thinking: Type.Optional(Type.String()),
      domain_rules: Type.Array(DomainRuleSchema),
    }),
  ),
  worker: Type.Optional(
    Type.Object({
      domain_rules: Type.Array(DomainRuleSchema),
    }),
  ),
  scout: Type.Optional(
    Type.Object({
      thinking: Type.Optional(Type.String()),
    }),
  ),
});

// ── Onboarding Artifacts ──────────────────────────────────────────────────

export const StackModuleSchema = Type.Object({
  stack: Type.Object({
    languages: Type.Array(Type.String()),
    build_tools: Type.Array(Type.String()),
    frameworks: Type.Array(Type.String()),
    test_frameworks: Type.Array(Type.String()),
    ci_cd: Type.Array(Type.String()),
    containerization: Type.Array(Type.String()),
  }),
  modules: Type.Array(
    Type.Object({
      name: Type.String(),
      path: Type.String(),
      type: Type.String({ enum: ["source", "test", "config", "asset", "doc"] }),
      language: Type.String(),
      entry_points: Type.Array(Type.String()),
      description: Type.String(),
    }),
  ),
  entry_points: Type.Array(
    Type.Object({
      path: Type.String(),
      type: Type.String({ enum: ["cli", "web", "lib", "test"] }),
      description: Type.String(),
    }),
  ),
  confidence: Type.String({ enum: ["high", "medium", "low"] }),
});

export const ContextResearchSchema = Type.Object({
  readme_summary: Type.String(),
  conventions: Type.Object({
    naming: Type.Union([Type.String(), Type.Null()]),
    style_guide: Type.Union([Type.String(), Type.Null()]),
    git_workflow: Type.Union([Type.String(), Type.Null()]),
    testing: Type.Union([Type.String(), Type.Null()]),
  }),
  ci_cd: Type.Object({
    platform: Type.Union([Type.String(), Type.Null()]),
    workflows: Type.Array(Type.String()),
    summary: Type.Union([Type.String(), Type.Null()]),
  }),
  external_dependencies: Type.Array(
    Type.Object({
      name: Type.String(),
      type: Type.String({ enum: ["api", "database", "service", "library"] }),
      purpose: Type.String(),
    }),
  ),
  documentation_quality: Type.String({ enum: ["good", "partial", "minimal", "none"] }),
  recommendations: Type.Array(Type.String()),
});

export const MigrationAnalysisSchema = Type.Object({
  foreign_systems_detected: Type.Array(
    Type.Object({
      system: Type.String(),
      evidence: Type.Array(Type.String()),
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
    }),
  ),
  migration_plan: Type.Array(
    Type.Object({
      source: Type.String(),
      target: Type.String(),
      action: Type.String({ enum: ["migrate", "merge", "skip", "manual"] }),
      risk: Type.String({ enum: ["none", "low", "medium", "high"] }),
      effort: Type.String({ enum: ["small", "medium", "large"] }),
    }),
  ),
  data_loss_risks: Type.Array(
    Type.Object({
      description: Type.String(),
      mitigation: Type.String(),
    }),
  ),
  estimated_effort: Type.String({ enum: ["small", "medium", "large"] }),
  recommendation: Type.String(),
});

// ── Catalog Schemas ───────────────────────────────────────────────────────

export const ProjectRuleSchema = Type.Object({
  id: Type.String(),
  category: Type.String({
    enum: [
      "naming", "error-handling", "testing", "api-design",
      "dependencies", "style", "security", "performance",
      "documentation", "git", "localization", "other",
    ],
  }),
  title: Type.String(),
  body: Type.String(),
  scope: Type.Array(Type.String()),
  source: Type.Object({
    type: Type.String({ enum: ["operator", "auto-extracted", "agent-decision", "migration"] }),
    ref: Type.String(),
    confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  }),
  status: Type.String({ enum: ["proposed", "active", "deprecated", "rejected"] }),
  evidence: Type.Array(Type.String()),
  created_at: Type.String(),
  updated_at: Type.String(),
  version: Type.Integer({ minimum: 1 }),
});

export const ArchitectureComponentSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  layer: Type.String({ enum: ["domain", "application", "infrastructure", "presentation", "external"] }),
  responsibilities: Type.Array(Type.String()),
  interfaces: Type.Array(
    Type.Object({
      name: Type.String(),
      type: Type.String({ enum: ["api", "event", "db", "file", "cli"] }),
      contract: Type.String(),
      consumers: Type.Array(Type.String()),
    }),
  ),
  dependencies: Type.Array(Type.String()),
  files: Type.Array(Type.String()),
  invariants: Type.Optional(Type.Array(Type.String())),
  status: Type.String({ enum: ["discovered", "verified", "deprecated"] }),
  source: Type.Object({
    type: Type.String({ enum: ["auto-detected", "agent-documented", "operator-defined"] }),
    ref: Type.String(),
  }),
});

export const ExecutionConfigSchema = Type.Object({
  schema_version: Type.Optional(Type.String({ default: "1.0.0" })),
  review: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    max_iterations: Type.Number(),
    auto_select_reviewer: Type.Object({
      enabled: Type.Boolean(),
      domain_rules: Type.Array(DomainRuleSchema),
    }),
  })),
  parallelism: Type.Optional(Type.Object({
    plan_mode_max_subagents: Type.Number(),
  })),
  timeout: Type.Optional(Type.Object({
    worker: Type.Number(),
    reviewer: Type.Number(),
    scout: Type.Number(),
  })),
  session_retention_days: Type.Optional(Type.Number()),
  human_in_the_loop: Type.Optional(Type.Object({
    on_reject_max_iterations: Type.Boolean(),
    on_timeout: Type.Boolean(),
    on_ambiguity: Type.Boolean(),
    on_worker_blocker: Type.Boolean(),
  })),
  recovery: Type.Optional(Type.Object({
    default_strategy: Type.String(),
    max_retries_per_step: Type.Number(),
    escalate_after_total_failures: Type.Number(),
  })),
  localization_guard: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    check_on_review: Type.Boolean(),
    check_on_finalize: Type.Boolean(),
    script_path: Type.String(),
  })),
  git: Type.Optional(Type.Object({
    commit_mode: Type.String(),
    commit_message_template: Type.String(),
    require_clean_worktree: Type.Boolean(),
  })),
  use_memory_v2: Type.Optional(Type.Boolean({ default: false })),
  memory: Type.Optional(Type.Object({
    token_budget: Type.Optional(Type.Number({ default: 4000 })),
    relevance_weights: Type.Optional(Type.Object({
      freshness: Type.Number(),
      frequency: Type.Number(),
      explicit_rating: Type.Number(),
    })),
    retention: Type.Optional(Type.Object({
      max_entries_session: Type.Optional(Type.Number()),
      max_entries_episodic: Type.Optional(Type.Number()),
      max_entries_semantic: Type.Optional(Type.Number()),
      max_entries_procedural: Type.Optional(Type.Number()),
      max_age_days: Type.Optional(Type.Number()),
      min_relevance: Type.Optional(Type.Number()),
    })),
  })),
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

export function validateSubagentConfigShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("domains" in obj) || typeof obj.domains !== "object" || obj.domains === null) return "domains must be an object";
  const domains = obj.domains as Record<string, unknown>;
  for (const [key, val] of Object.entries(domains)) {
    if (!val || typeof val !== "object") return `domain ${key} must be an object`;
    const d = val as Record<string, unknown>;
    if (!("provider" in d) || !("model" in d)) return `domain ${key} missing provider or model`;
  }
  return null;
}

export function validateExecutionConfigShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  const knownSections = [
    "schema_version", "review", "parallelism", "timeout", "session_retention_days",
    "human_in_the_loop", "recovery", "localization_guard", "git", "use_memory_v2", "memory",
  ];
  const hasAnySection = knownSections.some((s) => s in obj);
  if (!hasAnySection) {
    return `missing expected config sections (${knownSections.join(", ")})`;
  }

  if ("schema_version" in obj && typeof obj.schema_version !== "string") {
    return "schema_version must be a string";
  }

  if ("recovery" in obj) {
    const rec = obj.recovery as Record<string, unknown>;
    if ("max_retries_per_step" in rec && (typeof rec.max_retries_per_step !== "number" || rec.max_retries_per_step < 1)) {
      return "recovery.max_retries_per_step must be a number >= 1";
    }
    if ("max_worker_iterations" in rec && (typeof rec.max_worker_iterations !== "number" || rec.max_worker_iterations < 1)) {
      return "recovery.max_worker_iterations must be a number >= 1";
    }
    if ("timeout_reviewer_seconds" in rec && (typeof rec.timeout_reviewer_seconds !== "number" || rec.timeout_reviewer_seconds < 1)) {
      return "recovery.timeout_reviewer_seconds must be a number >= 1";
    }
    if ("on_worker_crash" in rec && typeof rec.on_worker_crash !== "string") {
      return "recovery.on_worker_crash must be a string";
    }
  }

  if ("localization_guard" in obj) {
    const loc = obj.localization_guard as Record<string, unknown>;
    if (typeof loc.enabled !== "boolean") {
      return "localization_guard.enabled must be a boolean";
    }
    if ("command" in loc && (typeof loc.command !== "string" || loc.command.length === 0)) {
      return "localization_guard.command must be a non-empty string";
    }
    if ("script_path" in loc && (typeof loc.script_path !== "string" || loc.script_path.length === 0)) {
      return "localization_guard.script_path must be a non-empty string";
    }
  }

  if ("git" in obj) {
    const git = obj.git as Record<string, unknown>;
    if (typeof git.commit_mode !== "string") {
      return "git.commit_mode must be a string";
    }
    if (typeof git.commit_message_template !== "string") {
      return "git.commit_message_template must be a string";
    }
    if (typeof git.require_clean_worktree !== "boolean") {
      return "git.require_clean_worktree must be a boolean";
    }
  }

  if ("use_memory_v2" in obj && typeof obj.use_memory_v2 !== "boolean") {
    return "use_memory_v2 must be a boolean";
  }

  if ("memory" in obj) {
    const mem = obj.memory as Record<string, unknown>;
    if ("token_budget" in mem && (typeof mem.token_budget !== "number" || mem.token_budget < 1)) {
      return "memory.token_budget must be a number >= 1";
    }
  }

  return null;
}

export function validateStackModuleShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("stack" in obj) || typeof obj.stack !== "object" || obj.stack === null) return "missing stack";
  if (!("modules" in obj) || !Array.isArray(obj.modules)) return "modules must be an array";
  if (!("entry_points" in obj) || !Array.isArray(obj.entry_points)) return "entry_points must be an array";
  return null;
}

export function validateContextResearchShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("readme_summary" in obj)) return "missing readme_summary";
  if (!("documentation_quality" in obj)) return "missing documentation_quality";
  return null;
}

export function validateMigrationAnalysisShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  if (!("foreign_systems_detected" in obj) || !Array.isArray(obj.foreign_systems_detected)) return "foreign_systems_detected must be an array";
  if (!("migration_plan" in obj) || !Array.isArray(obj.migration_plan)) return "migration_plan must be an array";
  return null;
}

export function validateProjectRuleShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  const required = ["id", "category", "title", "body", "scope", "source", "status", "evidence", "created_at", "updated_at", "version"];
  for (const key of required) {
    if (!(key in obj)) return `missing required field: ${key}`;
  }
  if (typeof obj.version !== "number" || (obj.version as number) < 1) return "version must be >= 1";
  return null;
}

export function validateArchitectureComponentShape(data: unknown): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const obj = data as Record<string, unknown>;
  const required = ["id", "name", "layer", "responsibilities", "interfaces", "dependencies", "files", "status", "source"];
  for (const key of required) {
    if (!(key in obj)) return `missing required field: ${key}`;
  }
  return null;
}
