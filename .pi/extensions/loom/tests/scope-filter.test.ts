/**
 * Unit tests for ScopeFilter
 *
 * Covers: path resolution for task/project/domain scopes,
 * exclusion rules (node_modules, .git, large files).
 *
 * Run: npx tsx .pi/extensions/loom/tests/scope-filter.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveSearchPaths, shouldIncludeFile } from "../retrieval/scope-filter";

let testDir: string;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✅ ${message}`);
}

function setup(): void {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-scope-"));
  // Create a minimal knowledge structure
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
}

function teardown(): void {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────

function testTaskScope(): void {
  const paths = resolveSearchPaths(testDir, "task", "TASK-0001");
  assert(paths.length >= 2, "task scope finds files");
  assert(paths.every((p) => p.includes("TASK-0001")), "all paths under task dir");
}

function testProjectScope(): void {
  const paths = resolveSearchPaths(testDir, "project");
  assert(paths.length >= 2, "project scope finds files");
  assert(paths.some((p) => p.includes("RULE-001.json")), "finds rule file");
}

function testDomainScope(): void {
  const paths = resolveSearchPaths(testDir, "domain");
  assert(paths.length >= 3, "domain scope finds files in knowledge + extension");
  assert(paths.some((p) => p.endsWith(".json")), "finds JSON knowledge files");
}

function testExcludedDirs(): void {
  const paths = resolveSearchPaths(testDir, "domain");
  const hasNodeModules = paths.some((p) => p.includes("node_modules"));
  assert(!hasNodeModules, "node_modules excluded from search");
}

function testShouldExcludeLargeFiles(): void {
  const largePath = path.join(testDir, "large.json");
  // Write 200KB file
  const buf = Buffer.alloc(200 * 1024, "x");
  fs.writeFileSync(largePath, buf);
  const result = shouldIncludeFile(largePath);
  assert(!result, "files > 100KB excluded");
  fs.unlinkSync(largePath);
}

function testShouldIncludeSmallJson(): void {
  const smallPath = path.join(testDir, "small.json");
  fs.writeFileSync(smallPath, "{}");
  const result = shouldIncludeFile(smallPath);
  assert(result, "small JSON files included");
  fs.unlinkSync(smallPath);
}

// ── Runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  setup();
  try {
    console.log(`\n${name}`);
    fn();
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${err.message}`);
    failed++;
  }
  teardown();
}

run("Task Scope Resolution", testTaskScope);
run("Project Scope Resolution", testProjectScope);
run("Domain Scope Resolution", testDomainScope);
run("Excluded Directories", testExcludedDirs);
run("Large File Exclusion", testShouldExcludeLargeFiles);
run("Small File Inclusion", testShouldIncludeSmallJson);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
