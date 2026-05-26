/**
 * Tests: retrieval/scope-filter.ts — search path resolution
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveSearchPaths, shouldIncludeFile } from "../retrieval/scope-filter";

describe("ScopeFilter", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-scope-"));
    const knowledge = path.join(testDir, "knowledge");
    const tasks = path.join(knowledge, "tasks", "TASK-0001");
    const project = path.join(knowledge, "project");
    const rules = path.join(project, "rules");
    const extDir = path.join(testDir, ".pi", "extensions", "loom");
    const nodeModules = path.join(testDir, "node_modules", "pkg");

    fs.mkdirSync(tasks, { recursive: true });
    fs.mkdirSync(rules, { recursive: true });
    fs.mkdirSync(extDir, { recursive: true });
    fs.mkdirSync(nodeModules, { recursive: true });

    fs.writeFileSync(path.join(tasks, "task.json"), JSON.stringify({ task_id: "TASK-0001" }));
    fs.writeFileSync(path.join(tasks, "plan.json"), JSON.stringify({ steps: [] }));
    fs.writeFileSync(path.join(rules, "RULE-001.json"), JSON.stringify({ id: "R-1" }));
    fs.writeFileSync(path.join(project, "configs.json"), JSON.stringify({}));
    fs.writeFileSync(path.join(extDir, "index.ts"), "// extension");
    fs.writeFileSync(path.join(nodeModules, "index.js"), "// excluded");
  });

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── resolveSearchPaths ────────────────────────────────────────────────

  describe("resolveSearchPaths", () => {
    it("task scope finds files under task dir", () => {
      const paths = resolveSearchPaths(testDir, "task", "TASK-0001");
      expect(paths.length).toBeGreaterThanOrEqual(2);
      expect(paths.every((p) => p.includes("TASK-0001"))).toBe(true);
    });

    it("task scope returns empty for nonexistent task", () => {
      const paths = resolveSearchPaths(testDir, "task", "TASK-NONEXISTENT");
      expect(paths).toHaveLength(0);
    });

    it("task scope throws without taskId", () => {
      expect(() => resolveSearchPaths(testDir, "task")).toThrow("requires a taskId");
    });

    it("project scope finds files under knowledge/project", () => {
      const paths = resolveSearchPaths(testDir, "project");
      expect(paths.length).toBeGreaterThanOrEqual(2);
      expect(paths.some((p) => p.includes("RULE-001.json"))).toBe(true);
    });

    it("domain scope finds files in knowledge + extension", () => {
      const paths = resolveSearchPaths(testDir, "domain");
      expect(paths.length).toBeGreaterThanOrEqual(3);
      expect(paths.some((p) => p.endsWith(".json"))).toBe(true);
    });

    it("excludes node_modules from search", () => {
      const paths = resolveSearchPaths(testDir, "domain");
      expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    });
  });

  // ── shouldIncludeFile ─────────────────────────────────────────────────

  describe("shouldIncludeFile", () => {
    it("excludes files > 100KB", () => {
      const largePath = path.join(testDir, "large.json");
      fs.writeFileSync(largePath, Buffer.alloc(200 * 1024, "x"));
      expect(shouldIncludeFile(largePath)).toBe(false);
    });

    it("includes small JSON files", () => {
      const smallPath = path.join(testDir, "small.json");
      fs.writeFileSync(smallPath, "{}");
      expect(shouldIncludeFile(smallPath)).toBe(true);
    });

    it("excludes files in node_modules", () => {
      const nmPath = path.join(testDir, "node_modules", "pkg", "index.js");
      expect(shouldIncludeFile(nmPath)).toBe(false);
    });

    it("excludes files in .git", () => {
      const gitPath = path.join(testDir, ".git", "config");
      expect(shouldIncludeFile(gitPath)).toBe(false);
    });
  });
});
