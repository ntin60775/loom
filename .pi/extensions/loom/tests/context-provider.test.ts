/**
 * Tests: shared/context-provider.ts — v2 context assembly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assembleV2Context } from "../shared/context-provider";

describe("assembleV2Context", () => {
  let testDir: string;

  function setupConfig(useMemoryV2: boolean): void {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-cp-"));
    const configDir = path.join(testDir, "knowledge", "project", "configs");
    const tasksDir = path.join(testDir, "knowledge", "tasks", "TASK-0001", "artifacts");
    const rulesDir = path.join(testDir, "knowledge", "project", "rules");
    const memoryDir = path.join(testDir, "knowledge", "project", "memory");
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });

    fs.writeFileSync(
      path.join(configDir, "execution-config.json"),
      JSON.stringify({ use_memory_v2: useMemoryV2 }),
    );

    fs.writeFileSync(
      path.join(testDir, "knowledge", "tasks", "TASK-0001", "task.json"),
      JSON.stringify({ task_id: "TASK-0001", title: "Test Task" }),
    );

    fs.writeFileSync(
      path.join(rulesDir, "RULE-001.json"),
      JSON.stringify({ id: "RULE-001", category: "testing", title: "Test rule", body: "Always test" }),
    );

    // Empty memory stores to avoid errors
    fs.writeFileSync(path.join(memoryDir, "semantic.json"), "[]");
    fs.writeFileSync(path.join(memoryDir, "procedural.json"), "[]");
  }

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("returns disabled=true and empty contexts when use_memory_v2=false", async () => {
    setupConfig(false);
    const result = await assembleV2Context(testDir, "TASK-0001");
    expect(result.disabled).toBe(true);
    expect(result.memoryContext).toBe("");
    expect(result.retrievalContext).toBe("");
    expect(result.combined).toBe("");
  });

  it("returns disabled=false but empty context when v2 enabled and no memories", async () => {
    setupConfig(true);
    const result = await assembleV2Context(testDir, "TASK-0001");
    expect(result.disabled).toBe(false);
    // memory context may be empty (no memories indexed)
    expect(typeof result.memoryContext).toBe("string");
  });

  it("does not crash with search query when v2 disabled", async () => {
    setupConfig(false);
    const result = await assembleV2Context(testDir, "TASK-0001", "test query", "project", 2);
    expect(result.disabled).toBe(true);
    expect(result.retrievalContext).toBe("");
  });

  it("handles missing config file gracefully", async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-cp-"));
    // No config at all
    const result = await assembleV2Context(testDir, "TASK-0001");
    expect(result.disabled).toBe(true);
  });
});
