/**
 * Tests: agent-mode/tools.ts — update task, read artifact, config edit, knowledge search
 * Tests: agent-mode/executor-loop.ts — getNextPendingStep, isPlanComplete, iteration
 *
 * Does NOT test spawn_worker / spawn_reviewer (requires real pi subagent spawn).
 * Those are covered by spawner.test.ts + extension-registration.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@earendil-works/pi-ai", () => {
  const createType = (def?: Record<string, unknown>) => def ?? {};
  return {
    Type: {
      String: (def?: Record<string, unknown>) => createType(def),
      Number: (def?: Record<string, unknown>) => createType(def),
      Boolean: (def?: Record<string, unknown>) => createType(def),
      Integer: (def?: Record<string, unknown>) => createType(def),
      Object: (props?: Record<string, unknown>) => createType(props),
      Array: (items: unknown, def?: Record<string, unknown>) => createType(def),
      Record: (_k: unknown, _v: unknown, def?: Record<string, unknown>) => createType(def),
      Optional: (type: unknown) => type,
      Union: (types: unknown[]) => types[0],
      Any: (def?: Record<string, unknown>) => createType(def),
      Null: () => null,
      Enum: (values: Record<string, string>) => createType({}),
    },
  };
});

vi.mock("@earendil-works/pi-tui", () => ({
  Key: { alt: (c: string) => ({ key: `alt+${c}` }) },
}));

vi.mock("@earendil-works/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@earendil-works/pi-coding-agent")>("@earendil-works/pi-coding-agent");
  return { ...actual, withFileMutationQueue: async (_p: string, fn: () => Promise<void>) => fn() };
});

vi.mock("../subagent/spawner", () => ({
  spawnSubagent: vi.fn().mockResolvedValue({
    exitCode: 0,
    messages: [{ role: "assistant", content: [{ type: "text", text: "mock output" }] }],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
    model: "mock",
    stopReason: "end_turn",
  }),
}));

vi.mock("../shared/utils", async () => {
  const actual = await vi.importActual<typeof import("../shared/utils")>("../shared/utils");
  return {
    ...actual,
    loadPrompt: (relativePath: string) => `[MOCK PROMPT: ${relativePath}]`,
  };
});

// ── Imports ──────────────────────────────────────────────────────────────

import { registerAgentTools } from "../agent-mode/tools";
import { registerExecutorLoopTools, getNextPendingStep, isPlanComplete, incrementIteration, resetIteration, markStepInProgress } from "../agent-mode/executor-loop";
import { readTask, readPlan, readJson, readExecutionConfig } from "../knowledge/io";
import { writeJson } from "../knowledge/io";

// ── Helpers ──────────────────────────────────────────────────────────────

interface RegisteredTool {
  name: string;
  opts: Record<string, unknown>;
}

function makeMockAPI() {
  const tools: RegisteredTool[] = [];
  const api: ExtensionAPI = {
    registerCommand: () => {},
    registerTool(opts: Record<string, unknown>) { tools.push({ name: opts.name as string, opts }); },
    registerShortcut: () => {},
    setActiveTools: () => [],
    sendUserMessage: () => {},
    on: () => () => {},
  };
  return { api, tools };
}

function tmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `loom-test-agent-${label}-${Date.now()}`);
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
  fs.mkdirSync(path.join(kd, "project", "memory"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "cache"), { recursive: true });

  writeJson(path.join(kd, "tasks", "registry.json"), { schema_version: "1.0.0", tasks: [] });
  writeJson(path.join(kd, "project", "configs", "execution-config.json"), {
    review: { enabled: true, max_iterations: 10, auto_select_reviewer: { enabled: true, domain_rules: [] } },
    recovery: { max_retries_per_step: 10, default_strategy: "retry_with_correction", escalate_after_total_failures: 5 },
    timeout: { worker: 3600, reviewer: 1800, scout: 600 },
    use_memory_v2: false,
    memory: { token_budget: 4000, relevance_weights: { freshness: 0.4, frequency: 0.3, explicit_rating: 0.3 }, retention: {} },
  });
  writeJson(path.join(kd, "project", "configs", "subagent-config.json"), {
    domains: { general: { provider: "deepseek", model: "deepseek-chat" } },
    worker: { domain_rules: [{ default: "general" }] },
    reviewer: { thinking: "xhigh", domain_rules: [{ default: "general" }] },
    scout: { thinking: "xhigh" },
  });

  return kd;
}

function makeContext(cwd: string): ExtensionContext {
  return {
    cwd,
    ui: { notify: () => {}, setWidget: () => {}, setStatus: () => {}, select: async () => "" },
    sessionManager: { getEntries: () => [] },
  };
}

async function executeTool(tools: RegisteredTool[], name: string, params: Record<string, unknown>, ctx: ExtensionContext) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.opts.execute(`call-${name}`, params, undefined, undefined, ctx);
}

// ── loom_update_task ─────────────────────────────────────────────────────

describe("loom_update_task", () => {
  it("updates task status", async () => {
    const cwd = tmpDir("ut");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-1000-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-1000-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    // Register in registry
    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "TASK-2026-1000-test", slug: "t", title: "T", status: "draft", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_update_task", {
      task_id: "TASK-2026-1000-test",
      task_status: "active",
    }, ctx);

    expect(result.isError).toBeFalsy();

    // Verify task.json updated
    const task = readTask(taskDir);
    expect(task!.status).toBe("active");

    // Verify registry updated
    const registry = readJson<{ tasks: Array<{ task_id: string; status: string }> }>(path.join(cwd, "knowledge", "tasks", "registry.json"));
    const entry = registry!.tasks.find((t) => t.task_id === "TASK-2026-1000-test");
    expect(entry!.status).toBe("active");
  });

  it("updates step status in plan", async () => {
    const cwd = tmpDir("us");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-1001-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-1001-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-1001-test",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "pending" }],
    });

    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_update_task", {
      task_id: "TASK-2026-1001-test",
      step_number: 1,
      step_status: "done",
    }, ctx);

    const plan = readPlan(taskDir);
    expect(plan!.steps[0].status).toBe("done");
  });

  it("auto-generates verification matrix on completion", async () => {
    const cwd = tmpDir("uc");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-1002-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-1002-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "TASK-2026-1002-test", slug: "t", title: "T", status: "active", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_update_task", {
      task_id: "TASK-2026-1002-test",
      task_status: "completed",
    }, ctx);

    // Check matrix was generated
    const matrixPath = path.join(cwd, "knowledge", "project", "artifacts", "verification-matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
  });
});

// ── loom_read_artifact ───────────────────────────────────────────────────

describe("loom_read_artifact", () => {
  it("reads artifact from task directory", async () => {
    const cwd = tmpDir("ra");
    setupKnowledge(cwd);
    const artifactsDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-1100-test", "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });
    writeJson(path.join(artifactsDir, "summary.json"), { key: "value", count: 42 });

    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_read_artifact", {
      task_id: "TASK-2026-1100-test",
      artifact_path: "artifacts/summary.json",
    }, ctx);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.key).toBe("value");
  });

  it("returns error for missing artifact", async () => {
    const cwd = tmpDir("rae");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_read_artifact", {
      task_id: "TASK-2026-1100-test",
      artifact_path: "artifacts/nonexistent.json",
    }, ctx);

    expect(result.isError).toBe(true);
  });
});

// ── loom_edit_config ─────────────────────────────────────────────────────

describe("loom_edit_config", () => {
  it("deep-merges execution config", async () => {
    const cwd = tmpDir("ec");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_edit_config", {
      config_type: "execution",
      updates: {
        review: { max_iterations: 5 },
        use_memory_v2: true,
      },
    }, ctx);

    expect(result.isError).toBeFalsy();

    const config = readExecutionConfig(path.join(cwd, "knowledge", "project", "configs", "execution-config.json"));
    expect(config).toBeTruthy();
    expect(config!.review!.max_iterations).toBe(5);
    expect(config!.use_memory_v2).toBe(true);
  });

  it("validates and rejects invalid config", async () => {
    const cwd = tmpDir("ecr");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_edit_config", {
      config_type: "execution",
      updates: {
        use_memory_v2: "yes", // should be boolean
      },
    }, ctx);

    // Schema validation should catch this
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Schema validation FAILED");
  });

  it("merges subagent config", async () => {
    const cwd = tmpDir("esc");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_edit_config", {
      config_type: "subagent",
      updates: {
        scout: { thinking: "maximum" },
      },
    }, ctx);

    expect(result.isError).toBeFalsy();

    const config = readJson<Record<string, unknown>>(path.join(cwd, "knowledge", "project", "configs", "subagent-config.json"));
    expect((config!.scout as Record<string, unknown>).thinking).toBe("maximum");
  });
});

// ── executor-loop: getNextPendingStep ────────────────────────────────────

describe("getNextPendingStep", () => {
  it("returns first pending step", () => {
    const cwd = tmpDir("gns");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-2000-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-2000-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-2000-test",
      steps: [
        { step_number: 1, title: "Init", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "pending" },
        { step_number: 2, title: "Build", description: "D2", expected_output: "o2", constraints: [], depends_on: [], estimated_effort: "medium", status: "pending" },
      ],
    });

    const step = getNextPendingStep("TASK-2026-2000-test", cwd);
    expect(step).toBeTruthy();
    expect(step!.step_number).toBe(1);
    expect(step!.title).toBe("Init");
    expect(step!.total_steps).toBe(2);
    expect(step!.done_steps).toBe(0);
  });

  it("skips done steps and respects dependencies", () => {
    const cwd = tmpDir("gnsd");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-2001-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-2001-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-2001-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" },
        { step_number: 2, title: "S2", description: "D2", expected_output: "o2", constraints: [], depends_on: [1], estimated_effort: "medium", status: "pending" },
      ],
    });

    const step = getNextPendingStep("TASK-2026-2001-test", cwd);
    expect(step).toBeTruthy();
    expect(step!.step_number).toBe(2);
    expect(step!.done_steps).toBe(1);
  });

  it("returns null when all steps done", () => {
    const cwd = tmpDir("gnsc");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-2002-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-2002-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-2002-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" },
      ],
    });

    const step = getNextPendingStep("TASK-2026-2002-test", cwd);
    expect(step).toBeNull();
  });

  it("returns null when blocked by dependency", () => {
    const cwd = tmpDir("gnsb");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-2003-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-2003-test", slug: "t", title: "T", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-2003-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "pending" },
        { step_number: 2, title: "S2", description: "D2", expected_output: "o2", constraints: [], depends_on: [1], estimated_effort: "medium", status: "pending" },
      ],
    });

    // Only step 1 should be available (step 2 depends on 1)
    const step = getNextPendingStep("TASK-2026-2003-test", cwd);
    expect(step!.step_number).toBe(1);
  });
});

// ── executor-loop: isPlanComplete ────────────────────────────────────────

describe("isPlanComplete", () => {
  it("returns true when all steps done", () => {
    const cwd = tmpDir("ipc");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-3000-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-3000-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" },
        { step_number: 2, title: "S2", description: "D2", expected_output: "o2", constraints: [], depends_on: [], estimated_effort: "medium", status: "done" },
      ],
    });

    expect(isPlanComplete("TASK-2026-3000-test", cwd)).toBe(true);
  });

  it("returns false when some steps pending", () => {
    const cwd = tmpDir("ipcp");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-3001-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-3001-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" },
        { step_number: 2, title: "S2", description: "D2", expected_output: "o2", constraints: [], depends_on: [], estimated_effort: "medium", status: "pending" },
      ],
    });

    expect(isPlanComplete("TASK-2026-3001-test", cwd)).toBe(false);
  });

  it("returns true for empty plan", () => {
    const cwd = tmpDir("ipce");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-3002-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-3002-test",
      steps: [],
    });

    expect(isPlanComplete("TASK-2026-3002-test", cwd)).toBe(true);
  });
});

// ── executor-loop: iteration ─────────────────────────────────────────────

describe("iteration tracking", () => {
  it("incrementIteration counts up", () => {
    const result = incrementIteration("test-task-iter", 10);
    expect(result.iteration).toBe(1);
    expect(result.escalated).toBe(false);
  });

  it("escalates after max iterations", () => {
    // Use a unique task_id to avoid state bleed
    const taskId = "test-task-max-" + Date.now();
    let escalated = false;
    for (let i = 0; i < 11; i++) {
      const result = incrementIteration(taskId, 10);
      escalated = result.escalated;
    }
    expect(escalated).toBe(true);
  });

  it("resetIteration resets to 0", () => {
    const taskId = "test-reset-" + Date.now();
    incrementIteration(taskId, 10);
    incrementIteration(taskId, 10);
    resetIteration(taskId);
    const result = incrementIteration(taskId, 10);
    expect(result.iteration).toBe(1); // back to 1 after reset
  });
});

// ── executor-loop: markStepInProgress ────────────────────────────────────

describe("markStepInProgress", () => {
  it("marks step as in_progress in plan.json", () => {
    const cwd = tmpDir("msip");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-4000-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-4000-test",
      steps: [
        { step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "pending" },
      ],
    });

    const ok = markStepInProgress("TASK-2026-4000-test", 1, cwd);
    expect(ok).toBe(true);

    const plan = readPlan(taskDir);
    expect(plan!.steps[0].status).toBe("in_progress");
  });

  it("returns false for missing task", () => {
    const cwd = tmpDir("msipe");
    const ok = markStepInProgress("TASK-NONEXISTENT", 1, cwd);
    expect(ok).toBe(false);
  });
});

// ── loom_get_next_step tool ──────────────────────────────────────────────

describe("loom_get_next_step (tool)", () => {
  it("returns next step info and marks in_progress", async () => {
    const cwd = tmpDir("gnst");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-5000-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-5000-test", slug: "t", title: "Executor Test", description: "D",
      status: "active", priority: "high", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-5000-test",
      steps: [
        { step_number: 1, title: "Step One", description: "First", expected_output: "out.json", constraints: ["INV-1"], depends_on: [], estimated_effort: "large", status: "pending" },
      ],
    });

    const { api, tools } = makeMockAPI();
    registerExecutorLoopTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_get_next_step", {
      task_id: "TASK-2026-5000-test",
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Step One");
    expect(result.content[0].text).toContain("1/1");
    expect(result.content[0].text).toContain("First");
    expect(result.details.stepInfo).toBeTruthy();

    // Verify step marked in_progress
    const plan = readPlan(taskDir);
    expect(plan!.steps[0].status).toBe("in_progress");
  });

  it("returns 'complete' when all steps done", async () => {
    const cwd = tmpDir("gnstc");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-5001-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-5001-test", slug: "t", title: "Complete Test", description: "D",
      status: "active", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-5001-test",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "done" }],
    });

    const { api, tools } = makeMockAPI();
    registerExecutorLoopTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_get_next_step", {
      task_id: "TASK-2026-5001-test",
    }, ctx);

    expect(result.content[0].text).toContain("complete");
    expect(result.details.complete).toBe(true);
  });
});

// ── loom_verify_invariants ───────────────────────────────────────────────

describe("loom_verify_invariants (agent tool)", () => {
  it("generates verification matrix from registry", async () => {
    const cwd = tmpDir("lviag");
    setupKnowledge(cwd);

    // Create a task with invariants
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0700-test");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });
    fs.mkdirSync(path.join(taskDir, "reviews"), { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0700-test", slug: "t", title: "T", description: "D",
      status: "completed", priority: "medium", branch: "task/t",
      invariants: [{ id: "INV-X", text: "Test invariant", marker: "INV:", status: "verified", verification_method: "test" }],
      delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    writeJson(path.join(cwd, "knowledge", "tasks", "registry.json"), {
      schema_version: "1.0.0",
      tasks: [{ task_id: "TASK-2026-0700-test", slug: "t", title: "T", status: "completed", priority: "medium", branch: "task/t", created_at: "2026-01-01", updated_at: "2026-01-01" }],
    });

    const { api, tools } = makeMockAPI();
    registerAgentTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_verify_invariants", {}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Verification matrix generated");

    const matrixPath = path.join(cwd, "knowledge", "project", "artifacts", "verification-matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
  });
});

// ── loom_check_iteration tool ────────────────────────────────────────────

describe("loom_check_iteration (tool)", () => {
  it("reports iteration count on reject", async () => {
    const cwd = tmpDir("lci");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerExecutorLoopTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_check_iteration", {
      task_id: "test-iter-check-" + Date.now(),
      action: "reject",
    }, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Iteration 1/10");
  });

  it("check action does not increment", async () => {
    const cwd = tmpDir("lcic");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerExecutorLoopTools(api);
    const ctx = makeContext(cwd);
    const taskId = "test-iter-check-only-" + Date.now();

    await executeTool(tools, "loom_check_iteration", { task_id: taskId, action: "check" }, ctx);
    const result = await executeTool(tools, "loom_check_iteration", { task_id: taskId, action: "check" }, ctx);
    // Should still be at 0
    expect(result.content[0].text).toContain("Iteration 0/10");
  });

  it("escalates after exceeding max_iterations", async () => {
    const cwd = tmpDir("lcie");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerExecutorLoopTools(api);
    const ctx = makeContext(cwd);
    const taskId = "test-escalate-" + Date.now();

    // Hit max iterations (10) + 1 to escalate
    for (let i = 0; i < 11; i++) {
      await executeTool(tools, "loom_check_iteration", { task_id: taskId, action: "reject" }, ctx);
    }

    const result = await executeTool(tools, "loom_check_iteration", { task_id: taskId, action: "check" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ESCALATED");
  });
});
