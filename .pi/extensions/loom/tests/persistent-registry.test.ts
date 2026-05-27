/**
 * Tests for subagent/persistent-registry.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readPersistentRegistry,
  writePersistentRegistry,
  registerPersistentSubagent,
  updatePersistentSubagent,
  getSubagentsByTask,
  getRecentSubagents,
} from "../subagent/persistent-registry";

describe("Persistent Subagent Registry", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-registry-test-"));
    // Create directory structure
    fs.mkdirSync(path.join(testDir, "knowledge", "project", "subagents"), { recursive: true });
    // Write initial empty registry
    writePersistentRegistry(testDir, {
      schema_version: "1.0.0",
      subagents: [],
      stats: { total_spawned: 0, total_completed: 0, total_failed: 0, total_aborted: 0 },
    });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("initializes empty registry", () => {
    const reg = readPersistentRegistry(testDir);
    expect(reg.subagents).toHaveLength(0);
    expect(reg.stats.total_spawned).toBe(0);
  });

  it("registers a subagent and increments stats", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1",
      type: "worker",
      task_id: "TASK-01",
      step_number: 1,
      model: "test-model",
      status: "running",
    });

    const reg = readPersistentRegistry(testDir);
    expect(reg.subagents).toHaveLength(1);
    expect(reg.stats.total_spawned).toBe(1);
    expect(reg.subagents[0].status).toBe("running");
  });

  it("deduplicates subagents by ID", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1",
      type: "worker",
      task_id: "TASK-01",
      status: "running",
    });
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1-updated",
      type: "worker",
      task_id: "TASK-01",
      status: "running",
    });

    const reg = readPersistentRegistry(testDir);
    expect(reg.subagents).toHaveLength(1);
    expect(reg.stats.total_spawned).toBe(2); // counter still increments
  });

  it("updates subagent status and stats", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1",
      type: "worker",
      task_id: "TASK-01",
      status: "running",
    });

    updatePersistentSubagent(testDir, "TASK-01-worker-step1", {
      status: "completed",
      exit_code: 0,
    });

    const reg = readPersistentRegistry(testDir);
    expect(reg.subagents[0].status).toBe("completed");
    expect(reg.subagents[0].exit_code).toBe(0);
    expect(reg.subagents[0].completed_at).toBeTruthy();
    expect(reg.stats.total_completed).toBe(1);
  });

  it("tracks errors in stats", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1",
      type: "worker",
      task_id: "TASK-01",
      status: "running",
    });

    updatePersistentSubagent(testDir, "TASK-01-worker-step1", {
      status: "error",
      exit_code: 1,
    });

    const reg = readPersistentRegistry(testDir);
    expect(reg.stats.total_failed).toBe(1);
  });

  it("tracks aborted in stats", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-step1",
      name: "worker-1",
      type: "worker",
      task_id: "TASK-01",
      status: "running",
    });

    updatePersistentSubagent(testDir, "TASK-01-worker-step1", {
      status: "aborted",
    });

    const reg = readPersistentRegistry(testDir);
    expect(reg.stats.total_aborted).toBe(1);
  });

  it("filters subagents by task", () => {
    registerPersistentSubagent(testDir, {
      id: "TASK-01-worker-1", name: "w1", type: "worker", task_id: "TASK-01", status: "running",
    });
    registerPersistentSubagent(testDir, {
      id: "TASK-02-worker-1", name: "w2", type: "worker", task_id: "TASK-02", status: "running",
    });
    registerPersistentSubagent(testDir, {
      id: "TASK-01-reviewer-1", name: "r1", type: "reviewer", task_id: "TASK-01", status: "running",
    });

    const task1 = getSubagentsByTask(testDir, "TASK-01");
    expect(task1).toHaveLength(2);
    expect(task1.map(s => s.id)).toEqual(["TASK-01-worker-1", "TASK-01-reviewer-1"]);
  });


  it("returns correct number of recent subagents", () => {
    registerPersistentSubagent(testDir, {
      id: "a", name: "a", type: "worker", task_id: "TASK-01", status: "running",
    });
    registerPersistentSubagent(testDir, {
      id: "b", name: "b", type: "worker", task_id: "TASK-01", status: "running",
    });
    registerPersistentSubagent(testDir, {
      id: "c", name: "c", type: "worker", task_id: "TASK-01", status: "running",
    });

    const recent = getRecentSubagents(testDir, 2);
    expect(recent).toHaveLength(2);
  });

  it("returns all subagents when limit > total", () => {
    registerPersistentSubagent(testDir, {
      id: "only", name: "only", type: "worker", task_id: "TASK-01", status: "running",
    });
    const recent = getRecentSubagents(testDir, 10);
    expect(recent).toHaveLength(1);
  });
});
