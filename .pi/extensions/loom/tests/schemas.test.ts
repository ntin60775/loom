/**
 * Tests: knowledge/schemas.ts — all runtime validators
 *
 * INV-2: Test coverage >= 70%
 */

import { describe, it, expect } from "vitest";
import {
  validateTaskShape,
  validatePlanShape,
  validateRegistryShape,
  validateReviewShape,
  validateSubagentConfigShape,
  validateExecutionConfigShape,
  validateStackModuleShape,
  validateContextResearchShape,
  validateMigrationAnalysisShape,
} from "../knowledge/schemas";
import { makeTask, makePlan, makeExecutionConfig, makeSubagentConfig, makeReview } from "./fixtures";

// ── Task Schema ────────────────────────────────────────────────────────────

describe("validateTaskShape", () => {
  it("passes for valid task", () => {
    expect(validateTaskShape(makeTask())).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validateTaskShape(null)).toContain("not an object");
    expect(validateTaskShape(undefined)).toContain("not an object");
  });

  it("fails for missing required fields", () => {
    expect(validateTaskShape({})).toContain("missing required field");
    expect(validateTaskShape({ task_id: "X" })).toContain("missing required field: slug");
  });

  it("fails for invalid task_id prefix", () => {
    expect(validateTaskShape(makeTask({ task_id: "WRONG-001" }))).toContain("invalid task_id");
  });

  it("fails for non-array invariants", () => {
    expect(validateTaskShape({ ...makeTask(), invariants: "not-array" })).toContain("invariants must be an array");
  });

  it("fails for non-array delivery_units", () => {
    expect(validateTaskShape({ ...makeTask(), delivery_units: "not-array" })).toContain("delivery_units must be an array");
  });

  it("accepts empty invariants and delivery_units", () => {
    expect(validateTaskShape(makeTask({ invariants: [], delivery_units: [] }))).toBeNull();
  });
});

// ── Plan Schema ────────────────────────────────────────────────────────────

describe("validatePlanShape", () => {
  it("passes for valid plan", () => {
    expect(validatePlanShape(makePlan())).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validatePlanShape(null)).toContain("not an object");
  });

  it("fails for missing task_id", () => {
    expect(validatePlanShape({ steps: [] })).toContain("missing task_id");
  });

  it("fails for empty steps array", () => {
    expect(validatePlanShape({ task_id: "T-001", steps: [] })).toContain("non-empty array");
  });

  it("fails for non-array steps", () => {
    expect(validatePlanShape({ task_id: "T-001", steps: "not-array" })).toContain("non-empty array");
  });
});

// ── Registry Schema ────────────────────────────────────────────────────────

describe("validateRegistryShape", () => {
  it("passes for valid registry", () => {
    expect(validateRegistryShape({ tasks: [] })).toBeNull();
    expect(validateRegistryShape({ tasks: [{ task_id: "T-001" }] })).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validateRegistryShape(null)).toContain("not an object");
  });

  it("fails for missing tasks", () => {
    expect(validateRegistryShape({})).toContain("tasks must be an array");
  });

  it("fails for non-array tasks", () => {
    expect(validateRegistryShape({ tasks: "not-array" })).toContain("tasks must be an array");
  });
});

// ── Review Schema ──────────────────────────────────────────────────────────

describe("validateReviewShape", () => {
  it("passes for valid review", () => {
    expect(validateReviewShape(makeReview())).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validateReviewShape(null)).toContain("not an object");
  });

  it("fails for missing required fields", () => {
    expect(validateReviewShape({})).toContain("missing required field");
    expect(validateReviewShape({ verdict: "approve" })).toContain("missing required field: commit");
  });

  it("fails for invalid verdict", () => {
    expect(validateReviewShape(makeReview({ verdict: "maybe" }))).toContain("invalid verdict");
  });

  it("accepts all valid verdicts", () => {
    expect(validateReviewShape(makeReview({ verdict: "approve" }))).toBeNull();
    expect(validateReviewShape(makeReview({ verdict: "reject" }))).toBeNull();
    expect(validateReviewShape(makeReview({ verdict: "needs_discussion" }))).toBeNull();
  });

  it("fails for non-array findings", () => {
    expect(validateReviewShape({ ...makeReview(), findings: "bad" })).toContain("findings must be an array");
  });
});

// ── Subagent Config ────────────────────────────────────────────────────────

describe("validateSubagentConfigShape", () => {
  it("passes for valid config", () => {
    expect(validateSubagentConfigShape(makeSubagentConfig())).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validateSubagentConfigShape(null)).toContain("not an object");
  });

  it("fails for missing domains", () => {
    expect(validateSubagentConfigShape({})).toContain("domains must be an object");
  });

  it("fails for non-object domains", () => {
    expect(validateSubagentConfigShape({ domains: "bad" })).toContain("domains must be an object");
  });

  it("fails for domain entry missing provider/model", () => {
    expect(validateSubagentConfigShape({ domains: { x: {} } })).toContain("missing provider or model");
  });
});

// ── Execution Config ───────────────────────────────────────────────────────

describe("validateExecutionConfigShape", () => {
  it("passes for valid config", () => {
    expect(validateExecutionConfigShape(makeExecutionConfig())).toBeNull();
  });

  it("fails for null/undefined", () => {
    expect(validateExecutionConfigShape(null)).toContain("not an object");
  });

  it("fails for empty object (no known sections)", () => {
    expect(validateExecutionConfigShape({})).toContain("missing expected config sections");
  });

  it("fails for invalid schema_version type", () => {
    expect(validateExecutionConfigShape({ schema_version: 123, review: {} })).toContain("schema_version must be a string");
  });

  it("fails for recovery.max_retries_per_step < 1", () => {
    expect(validateExecutionConfigShape({ recovery: { max_retries_per_step: 0 } })).toContain("number >= 1");
  });

  it("fails for non-boolean use_memory_v2", () => {
    expect(validateExecutionConfigShape({ use_memory_v2: "yes", review: {} })).toContain("use_memory_v2 must be a boolean");
  });

  it("fails for memory.token_budget < 1", () => {
    expect(validateExecutionConfigShape({ memory: { token_budget: 0 }, review: {} })).toContain("number >= 1");
  });
});

// ── Onboarding Artifacts ───────────────────────────────────────────────────

describe("validateStackModuleShape", () => {
  const validStack = {
    stack: { languages: ["ts"], build_tools: [], frameworks: [], test_frameworks: [], ci_cd: [], containerization: [] },
    modules: [],
    entry_points: [],
  };

  it("passes for valid stack", () => {
    expect(validateStackModuleShape(validStack)).toBeNull();
  });

  it("fails for missing stack", () => {
    expect(validateStackModuleShape({ modules: [], entry_points: [] })).toContain("missing stack");
  });

  it("fails for non-array modules", () => {
    expect(validateStackModuleShape({ ...validStack, modules: "bad" })).toContain("modules must be an array");
  });

  it("fails for non-array entry_points", () => {
    expect(validateStackModuleShape({ ...validStack, entry_points: "bad" })).toContain("entry_points must be an array");
  });
});

describe("validateContextResearchShape", () => {
  const valid = { readme_summary: "test", documentation_quality: "good" };

  it("passes for valid", () => {
    expect(validateContextResearchShape(valid)).toBeNull();
  });

  it("fails for missing readme_summary", () => {
    expect(validateContextResearchShape({ documentation_quality: "good" })).toContain("missing readme_summary");
  });

  it("fails for missing documentation_quality", () => {
    expect(validateContextResearchShape({ readme_summary: "test" })).toContain("missing documentation_quality");
  });
});

describe("validateMigrationAnalysisShape", () => {
  const valid = { foreign_systems_detected: [], migration_plan: [] };

  it("passes for valid", () => {
    expect(validateMigrationAnalysisShape(valid)).toBeNull();
  });

  it("fails for non-array foreign_systems_detected", () => {
    expect(validateMigrationAnalysisShape({ foreign_systems_detected: "bad", migration_plan: [] })).toContain("must be an array");
  });

  it("fails for non-array migration_plan", () => {
    expect(validateMigrationAnalysisShape({ foreign_systems_detected: [], migration_plan: "bad" })).toContain("must be an array");
  });
});
