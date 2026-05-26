/**
 * Tests: knowledge/verification.ts — generateVerificationMatrix edge cases
 * Tests: knowledge/schemas.ts — additional validation edge cases
 * Tests: knowledge/io.ts — read/write edge cases
 * Tests: retrieval/scope-filter.ts — shouldIncludeFile edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generateVerificationMatrix } from "../knowledge/verification";
import { writeJson, readJson, readTask, readPlan, readRegistryFile, findKnowledgeRoot } from "../knowledge/io";
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
  validateProjectRuleShape,
  validateArchitectureComponentShape,
} from "../knowledge/schemas";
import { shouldIncludeFile } from "../retrieval/scope-filter";

// ── Helpers ──────────────────────────────────────────────────────────────

function tmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `loom-test-extra-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setupKnowledge(cwd: string) {
  const kd = path.join(cwd, "knowledge");
  fs.mkdirSync(path.join(kd, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "configs"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "rules"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "architecture", "components"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "artifacts"), { recursive: true });
  return kd;
}

// ── verification.ts ──────────────────────────────────────────────────────

describe("generateVerificationMatrix", () => {
  it("returns empty matrix for empty registry", () => {
    const cwd = tmpDir("gvm-empty");
    setupKnowledge(cwd);
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), { schema_version: "1.0.0", tasks: [] });

    const matrix = generateVerificationMatrix(cwd);
    expect(matrix.summary.total).toBe(0);
    expect(matrix.entries).toEqual([]);
  });

  it("writes matrix file", () => {
    const cwd = tmpDir("gvm-write");
    setupKnowledge(cwd);
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), { schema_version: "1.0.0", tasks: [] });

    generateVerificationMatrix(cwd);
    const matrixPath = path.join(cwd, "knowledge", "project", "artifacts", "verification-matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
  });

  it("marks completed task invariants as needs_audit", () => {
    const cwd = tmpDir("gvm-audit");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "T-001");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "T-001", slug: "t", title: "T", description: "D",
      status: "completed", priority: "medium", branch: "task/t",
      invariants: [{ id: "INV-A", text: "Some invariant", marker: "INV:", status: "defined", verification_method: "review" }],
      delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "T-001",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" }],
    });
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "T-001", slug: "t", title: "T", status: "completed", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const matrix = generateVerificationMatrix(cwd);
    expect(matrix.summary.total).toBe(1);
    expect(matrix.summary.needs_audit).toBe(1);
  });

  it("marks in-progress task invariants as defined", () => {
    const cwd = tmpDir("gvm-defined");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "T-002");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "T-002", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [{ id: "INV-B", text: "In progress", marker: "INV:", status: "defined", verification_method: "test" }],
      delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "T-002", slug: "t", title: "T", status: "active", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const matrix = generateVerificationMatrix(cwd);
    expect(matrix.summary.total).toBe(1);
    expect(matrix.summary.defined).toBe(1); // active task → defined, not needs_audit
  });

  it("preserves verified status", () => {
    const cwd = tmpDir("gvm-verified");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "T-003");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "T-003", slug: "t", title: "T", description: "D",
      status: "completed", priority: "medium", branch: "task/t",
      invariants: [{ id: "INV-C", text: "Already verified", marker: "INV:", status: "verified", verification_method: "audit" }],
      delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "T-003",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" }],
    });
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "T-003", slug: "t", title: "T", status: "completed", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const matrix = generateVerificationMatrix(cwd);
    expect(matrix.summary.total).toBe(1);
    expect(matrix.summary.verified).toBe(1);
  });
});

// ── IO edge cases ────────────────────────────────────────────────────────

describe("IO edge cases", () => {
  it("findKnowledgeRoot returns null for missing knowledge/", () => {
    const cwd = tmpDir("io-noknow");
    expect(findKnowledgeRoot(cwd)).toBeNull();
  });

  it("findKnowledgeRoot returns path for existing knowledge/", () => {
    const cwd = tmpDir("io-know");
    fs.mkdirSync(path.join(cwd, "knowledge"));
    expect(findKnowledgeRoot(cwd)).toBe(path.join(cwd, "knowledge"));
  });

  it("readJson returns null for invalid JSON", () => {
    const cwd = tmpDir("io-invalid");
    const p = path.join(cwd, "bad.json");
    fs.writeFileSync(p, "not json at all");
    const result = readJson(p);
    expect(result).toBeNull();
  });

  it("readJson returns null for missing file", () => {
    const result = readJson("/tmp/nonexistent-file-xyz.json");
    expect(result).toBeNull();
  });

  it("readJson validates with validator", () => {
    const cwd = tmpDir("io-validate");
    const p = path.join(cwd, "data.json");
    writeJson(p, { name: "test" });

    const result = readJson<{ name: string }>(p, (data) => {
      if (typeof data !== "object" || !("name" in data!)) return "missing name";
      return null;
    });
    expect(result).toBeTruthy();
    expect(result!.name).toBe("test");
  });

  it("readJson returns null on validation failure", () => {
    const cwd = tmpDir("io-valfail");
    const p = path.join(cwd, "data.json");
    writeJson(p, { wrong: true });

    const result = readJson<{ name: string }>(p, (data) => {
      if (typeof data !== "object" || !("name" in data!)) return "missing name";
      return null;
    });
    expect(result).toBeNull();
  });

  it("writeJson creates directories", () => {
    const cwd = tmpDir("io-write");
    writeJson(path.join(cwd, "deep", "nested", "file.json"), { ok: true });
    expect(fs.existsSync(path.join(cwd, "deep", "nested", "file.json"))).toBe(true);
  });

  it("readTask and readPlan return null for missing dirs", () => {
    expect(readTask("/tmp/no-such-dir")).toBeNull();
    expect(readPlan("/tmp/no-such-dir")).toBeNull();
  });

  it("readRegistryFile returns null for missing file", () => {
    const cwd = tmpDir("io-noreg");
    expect(readRegistryFile(cwd)).toBeNull();
  });
});

// ── Schema validation edge cases ─────────────────────────────────────────

describe("schema validators", () => {
  it("validateTaskShape rejects non-object", () => {
    expect(validateTaskShape(null)).toContain("not an object");
    expect(validateTaskShape(42)).toContain("not an object");
  });

  it("validateTaskShape requires all fields", () => {
    expect(validateTaskShape({})).toContain("missing required field");
    expect(validateTaskShape({ task_id: 123 })).toContain("missing required field");
  });

  it("validateTaskShape rejects invalid task_id", () => {
    expect(validateTaskShape({
      task_id: "BAD", slug: "t", title: "T", description: "D",
      status: "draft", branch: "b",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01",
    })).toContain("invalid task_id");
  });

  it("validatePlanShape requires non-empty steps", () => {
    expect(validatePlanShape({ task_id: "T-1" })).toContain("steps must be");
    expect(validatePlanShape({ task_id: "T-1", steps: [] })).toContain("steps must be");
  });

  it("validatePlanShape accepts valid plan", () => {
    expect(validatePlanShape({
      task_id: "T-1",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1" }],
    })).toBeNull();
  });

  it("validateRegistryShape rejects missing tasks", () => {
    expect(validateRegistryShape({})).toContain("tasks must be");
  });

  it("validateReviewShape rejects invalid verdict", () => {
    expect(validateReviewShape({
      verdict: "maybe", commit: "abc", step_number: 1, findings: [], reviewed_at: "2026-01-01",
    })).toContain("invalid verdict");
  });

  it("validateReviewShape accepts valid review", () => {
    expect(validateReviewShape({
      verdict: "approve", commit: "abc", step_number: 1, findings: [], reviewed_at: "2026-01-01",
    })).toBeNull();
  });

  it("validateSubagentConfigShape rejects missing domains", () => {
    expect(validateSubagentConfigShape({})).toContain("domains");
  });

  it("validateSubagentConfigShape rejects domain without provider", () => {
    expect(validateSubagentConfigShape({
      domains: { test: { model: "m1" } },
    })).toContain("missing provider or model");
  });

  it("validateSubagentConfigShape accepts valid config", () => {
    expect(validateSubagentConfigShape({
      domains: { general: { provider: "p", model: "m" } },
    })).toBeNull();
  });

  it("validateExecutionConfigShape rejects missing sections", () => {
    expect(validateExecutionConfigShape({})).toContain("missing expected config sections");
  });

  it("validateExecutionConfigShape rejects non-boolean use_memory_v2", () => {
    expect(validateExecutionConfigShape({
      review: { enabled: true },
      use_memory_v2: "yes",
    })).toContain("use_memory_v2 must be a boolean");
  });

  it("validateExecutionConfigShape accepts valid config", () => {
    expect(validateExecutionConfigShape({
      review: { enabled: true, max_iterations: 10, auto_select_reviewer: { enabled: true, domain_rules: [] } },
    })).toBeNull();
  });

  it("validateStackModuleShape rejects missing modules", () => {
    expect(validateStackModuleShape({ stack: { languages: [] } })).toContain("modules");
  });

  it("validateContextResearchShape rejects missing readme_summary", () => {
    expect(validateContextResearchShape({})).toContain("readme_summary");
  });

  it("validateMigrationAnalysisShape rejects non-array foreign_systems", () => {
    expect(validateMigrationAnalysisShape({ foreign_systems_detected: "nope", migration_plan: [] })).toContain("foreign_systems_detected");
  });

  it("validateProjectRuleShape requires all fields", () => {
    expect(validateProjectRuleShape({})).toContain("missing required field");
  });

  it("validateProjectRuleShape rejects version < 1", () => {
    expect(validateProjectRuleShape({
      id: "R1", category: "style", title: "T", body: "B", scope: [], source: {}, status: "active", evidence: [], created_at: "2026-01-01", updated_at: "2026-01-01", version: 0,
    })).toContain("version must be >= 1");
  });

  it("validateArchitectureComponentShape requires all fields", () => {
    expect(validateArchitectureComponentShape({})).toContain("missing required field");
  });
});

// ── scope-filter ─────────────────────────────────────────────────────────

describe("shouldIncludeFile", () => {
  it("excludes files in node_modules (by directory segment)", () => {
    expect(shouldIncludeFile(path.join("proj", "node_modules", "pkg", "index.js"))).toBe(false);
  });

  it("excludes files in .git (by directory segment)", () => {
    expect(shouldIncludeFile(path.join("proj", ".git", "objects", "abc"))).toBe(false);
  });

  it("excludes .lock files (by basename pattern)", () => {
    expect(shouldIncludeFile(path.join("proj", "package-lock.json"))).toBe(false);
    expect(shouldIncludeFile(path.join("proj", "yarn.lock"))).toBe(false);
  });

  it("includes regular .json and .md files that exist on disk", () => {
    const cwd = tmpDir("sf-include");
    const jsonPath = path.join(cwd, "task.json");
    const mdPath = path.join(cwd, "README.md");
    fs.writeFileSync(jsonPath, "{}");
    fs.writeFileSync(mdPath, "# Hello");
    expect(shouldIncludeFile(jsonPath)).toBe(true);
    expect(shouldIncludeFile(mdPath)).toBe(true);
  });

  it("excludes large files", () => {
    const cwd = tmpDir("sf-large");
    const largeFile = path.join(cwd, "big.json");
    // Create a file larger than 100KB
    const buf = Buffer.alloc(150 * 1024, "x");
    fs.writeFileSync(largeFile, buf);
    expect(shouldIncludeFile(largeFile)).toBe(false);
  });

  it("returns false for non-existent files", () => {
    expect(shouldIncludeFile("/tmp/nonexistent-xyz-file.xyz")).toBe(false);
  });
});

// ── Memory store utilities ───────────────────────────────────────────────

import { applyFilters, updateAccessMeta } from "../memory/store-utils";
import type { MemoryEntry } from "../memory/types";
import { makeMemoryEntry, makeMemoryQuery } from "./fixtures";

describe("applyFilters", () => {
  it("filters by task_id", () => {
    const entries: MemoryEntry[] = [
      makeMemoryEntry({ task_id: "T-1", track_type: "episodic" }),
      makeMemoryEntry({ task_id: "T-2", track_type: "episodic" }),
    ];
    const filtered = applyFilters(entries, makeMemoryQuery({ task_id: "T-1" }), "episodic");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].task_id).toBe("T-1");
  });

  it("filters by min_relevance", () => {
    const entries: MemoryEntry[] = [
      makeMemoryEntry({ relevance_score: 0.9, track_type: "episodic" }),
      makeMemoryEntry({ relevance_score: 0.05, track_type: "episodic" }),
    ];
    const filtered = applyFilters(entries, makeMemoryQuery({ min_relevance: 0.5 }), "episodic");
    expect(filtered).toHaveLength(1);
  });

  it("filters by tags", () => {
    const entries: MemoryEntry[] = [
      makeMemoryEntry({ tags: ["important"], track_type: "episodic" }),
      makeMemoryEntry({ tags: ["low"], track_type: "episodic" }),
    ];
    const filtered = applyFilters(entries, makeMemoryQuery({ tags: ["important"] }), "episodic");
    expect(filtered).toHaveLength(1);
  });

  it("filters by date range", () => {
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const entries: MemoryEntry[] = [
      makeMemoryEntry({ timestamp: past, track_type: "episodic" }),
      makeMemoryEntry({ timestamp: now, track_type: "episodic" }),
    ];
    const filtered = applyFilters(entries, makeMemoryQuery({ since: new Date(Date.now() - 3600000).toISOString() }), "episodic");
    expect(filtered).toHaveLength(1);
  });
});

describe("updateAccessMeta", () => {
  it("bumps access_count and sets last_accessed_at", () => {
    const entry = makeMemoryEntry();
    const prevCount = entry.access_count;
    updateAccessMeta([entry]);
    expect(entry.access_count).toBe(prevCount + 1);
    expect(entry.last_accessed_at).not.toBeNull();
  });
});
