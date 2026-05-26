/**
 * Tests: plan-mode/tools.ts — task/plan creation, invariants, delivery units, onboarding tools
 *
 * Tests tool execution logic directly (not through pi tool registration).
 * Mocks subagent spawner and tests artifact creation.
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

// ── Now import ───────────────────────────────────────────────────────────

import { registerPlanTools, runOnboardingSubagent } from "../plan-mode/tools";
import { readTask, readPlan, readRegistryFile, readJson } from "../knowledge/io";
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
  const dir = path.join(os.tmpdir(), `loom-test-plan-${label}-${Date.now()}`);
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
  fs.mkdirSync(path.join(kd, "project", "onboarding"), { recursive: true });
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

// ── Tool execution helper ────────────────────────────────────────────────

async function executeTool(tools: RegisteredTool[], name: string, params: Record<string, unknown>, ctx: ExtensionContext) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.opts.execute(`call-${name}`, params, undefined, undefined, ctx);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("loom_create_task", () => {
  it("creates task.json and subdirectories", async () => {
    const cwd = tmpDir("ct");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_create_task", {
      task_id: "TASK-2026-0200-test",
      slug: "test-task",
      title: "Тестовая задача",
      description: "Описание",
      priority: "high",
    }, ctx);

    expect(result.isError).toBeFalsy();
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0200-test");
    expect(fs.existsSync(taskDir)).toBe(true);
    expect(fs.existsSync(path.join(taskDir, "task.json"))).toBe(true);
    expect(fs.existsSync(path.join(taskDir, "artifacts"))).toBe(true);
    expect(fs.existsSync(path.join(taskDir, "reviews"))).toBe(true);

    const task = readTask(taskDir);
    expect(task).toBeTruthy();
    expect(task!.task_id).toBe("TASK-2026-0200-test");
    expect(task!.slug).toBe("test-task");
    expect(task!.title).toBe("Тестовая задача");
    expect(task!.status).toBe("draft");
    expect(task!.priority).toBe("high");
    expect(task!.invariants).toEqual([]);
    expect(task!.delivery_units).toEqual([]);
  });

  it("accepts parent_task_id and parent_delivery_unit", async () => {
    const cwd = tmpDir("ctp");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_create_task", {
      task_id: "TASK-2026-0201-child",
      slug: "child",
      title: "Child",
      description: "Desc",
      parent_task_id: "TASK-2026-0001",
      parent_delivery_unit: "DU-1",
    }, ctx);

    const task = readTask(path.join(cwd, "knowledge", "tasks", "TASK-2026-0201-child"));
    expect(task!.parent_task_id).toBe("TASK-2026-0001");
    expect(task!.parent_delivery_unit).toBe("DU-1");
  });
});

// ── loom_create_plan ─────────────────────────────────────────────────────

describe("loom_create_plan", () => {
  it("creates plan.json with steps", async () => {
    const cwd = tmpDir("cp");
    setupKnowledge(cwd);

    // Create task first
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0300-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0300-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_create_plan", {
      task_id: "TASK-2026-0300-test",
      steps: [
        { step_number: 1, title: "Init", description: "Initialize", expected_output: "out.json", estimated_effort: "small" },
        { step_number: 2, title: "Build", description: "Build it", expected_output: "build.json", depends_on: [1], estimated_effort: "medium" },
      ],
    }, ctx);

    expect(result.isError).toBeFalsy();

    const plan = readPlan(taskDir);
    expect(plan).toBeTruthy();
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.steps[0].title).toBe("Init");
    expect(plan!.steps[0].status).toBe("pending");
    expect(plan!.steps[1].depends_on).toEqual([1]);
  });

  it("creates plan with risks and checkpoints", async () => {
    const cwd = tmpDir("cpr");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0301-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0301-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_create_plan", {
      task_id: "TASK-2026-0301-test",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1" }],
      risks: [{ id: "R1", description: "Risk desc", severity: "high", mitigation: "Mitigate" }],
      checkpoints: [{ id: "C1", description: "Check", after_step: 1, verification: "Check file" }],
    }, ctx);

    const plan = readPlan(taskDir);
    expect(plan!.risks).toHaveLength(1);
    expect(plan!.risks![0].severity).toBe("high");
    expect(plan!.checkpoints).toHaveLength(1);
  });
});

// ── loom_add_invariant ───────────────────────────────────────────────────

describe("loom_add_invariant", () => {
  it("adds invariant to task.json", async () => {
    const cwd = tmpDir("ai");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0400-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0400-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_add_invariant", {
      task_id: "TASK-2026-0400-test",
      invariant_id: "INV-1",
      text: "JSON primary",
      marker: "INVARIANT:",
      verification_method: "Code review",
    }, ctx);

    const task = readTask(taskDir);
    expect(task!.invariants).toHaveLength(1);
    expect(task!.invariants[0].id).toBe("INV-1");
    expect(task!.invariants[0].status).toBe("defined");
  });

  it("returns error for missing task", async () => {
    const cwd = tmpDir("aie");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_add_invariant", {
      task_id: "TASK-NONEXISTENT",
      invariant_id: "INV-1", text: "T", marker: "M", verification_method: "V",
    }, ctx);

    expect(result.isError).toBe(true);
  });
});

// ── loom_add_delivery_unit ───────────────────────────────────────────────

describe("loom_add_delivery_unit", () => {
  it("adds delivery unit to task.json", async () => {
    const cwd = tmpDir("adu");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0500-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0500-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_add_delivery_unit", {
      task_id: "TASK-2026-0500-test",
      du_id: "DU-1",
      purpose: "Core design",
      base_branch: "main",
    }, ctx);

    const task = readTask(taskDir);
    expect(task!.delivery_units).toHaveLength(1);
    expect(task!.delivery_units[0].id).toBe("DU-1");
    expect(task!.delivery_units[0].status).toBe("draft");
  });
});

// ── loom_finalize_plan ───────────────────────────────────────────────────

describe("loom_finalize_plan", () => {
  it("finalizes plan: updates registry, generates markdown", async () => {
    const cwd = tmpDir("fp");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0600-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0600-test", slug: "test", title: "Finalize Test", description: "Testing finalize",
      status: "draft", priority: "high", branch: "task/TASK-2026-0600-test",
      invariants: [{ id: "INV-1", text: "T", marker: "M", status: "defined", verification_method: "V" }],
      delivery_units: [{ id: "DU-1", status: "draft", purpose: "P", base_branch: "main" }],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });
    writeJson(path.join(taskDir, "plan.json"), {
      task_id: "TASK-2026-0600-test",
      steps: [{ step_number: 1, title: "S1", description: "D1", expected_output: "o1", constraints: [], depends_on: [], estimated_effort: "small", status: "pending" }],
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_finalize_plan", {
      task_id: "TASK-2026-0600-test",
    }, ctx);

    expect(result.isError).toBeFalsy();

    // Check registry updated
    const registry = readRegistryFile(path.join(cwd, "knowledge"));
    expect(registry).toBeTruthy();
    const entry = registry!.tasks.find((t) => t.task_id === "TASK-2026-0600-test");
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe("draft");

    // Check markdown derivatives generated
    expect(fs.existsSync(path.join(taskDir, "task.md"))).toBe(true);
    expect(fs.existsSync(path.join(taskDir, "plan.md"))).toBe(true);

    const taskMd = fs.readFileSync(path.join(taskDir, "task.md"), "utf-8");
    expect(taskMd).toContain("Finalize Test");
    expect(taskMd).toContain("INV-1");

    const planMd = fs.readFileSync(path.join(taskDir, "plan.md"), "utf-8");
    expect(planMd).toContain("S1");
  });

  it("returns error for missing task", async () => {
    const cwd = tmpDir("fpe");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_finalize_plan", {
      task_id: "TASK-NONEXISTENT",
    }, ctx);

    expect(result.isError).toBe(true);
  });

  it("returns error for missing plan", async () => {
    const cwd = tmpDir("fpe2");
    setupKnowledge(cwd);
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-2026-0601-test");
    fs.mkdirSync(taskDir, { recursive: true });
    writeJson(path.join(taskDir, "task.json"), {
      task_id: "TASK-2026-0601-test", slug: "t", title: "T", description: "D",
      status: "draft", priority: "medium", branch: "task/t",
      invariants: [], delivery_units: [],
      created_at: "2026-01-01", updated_at: "2026-01-01", schema_version: "1.0.0",
    });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_finalize_plan", {
      task_id: "TASK-2026-0601-test",
    }, ctx);

    expect(result.isError).toBe(true);
  });
});

// ── loom_add_rule ────────────────────────────────────────────────────────

describe("loom_add_rule", () => {
  it("adds rule to catalog", async () => {
    const cwd = tmpDir("ar");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_add_rule", {
      id: "RULE-TEST",
      category: "style",
      title: "Test Rule",
      body: "Always use logger",
      source_type: "operator",
      source_ref: "manual",
      status: "active",
    }, ctx);

    const rulePath = path.join(cwd, "knowledge", "project", "rules", "RULE-TEST.json");
    expect(fs.existsSync(rulePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(rulePath, "utf-8"));
    expect(data.title).toBe("Test Rule");
    expect(data.category).toBe("style");
    expect(data.status).toBe("active");
    expect(data.version).toBe(1);
  });
});

// ── loom_list_rules ──────────────────────────────────────────────────────

describe("loom_list_rules", () => {
  it("lists rules from catalog", async () => {
    const cwd = tmpDir("lr");
    setupKnowledge(cwd);

    // Pre-create some rules
    const rulesDir = path.join(cwd, "knowledge", "project", "rules");
    writeJson(path.join(rulesDir, "R1.json"), { id: "R1", title: "Rule 1", category: "style", body: "B", status: "active", version: 1, scope: ["*"], source: { type: "operator", ref: "m" }, evidence: [], created_at: "2026-01-01", updated_at: "2026-01-01" });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_list_rules", {}, ctx);
    expect(result.content[0].text).toContain("R1");
    expect(result.content[0].text).toContain("style");
  });

  it("shows empty message when no rules", async () => {
    const cwd = tmpDir("lre");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_list_rules", {}, ctx);
    expect(result.content[0].text).toContain("Нет зарегистрированных правил");
  });
});

// ── loom_add_architecture_component ──────────────────────────────────────

describe("loom_add_architecture_component", () => {
  it("adds component to catalog", async () => {
    const cwd = tmpDir("aac");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    await executeTool(tools, "loom_add_architecture_component", {
      id: "COMP-TEST",
      name: "Test Component",
      layer: "domain",
      responsibilities: ["Does X", "Does Y"],
      files: ["a.ts", "b.ts"],
      status: "discovered",
      source_type: "operator-defined",
      source_ref: "manual",
    }, ctx);

    const compPath = path.join(cwd, "knowledge", "project", "architecture", "components", "COMP-TEST.json");
    expect(fs.existsSync(compPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(compPath, "utf-8"));
    expect(data.name).toBe("Test Component");
    expect(data.layer).toBe("domain");
    expect(data.responsibilities).toEqual(["Does X", "Does Y"]);
  });
});

// ── loom_list_architecture_components ────────────────────────────────────

describe("loom_list_architecture_components", () => {
  it("lists components from catalog", async () => {
    const cwd = tmpDir("lac");
    setupKnowledge(cwd);
    const compsDir = path.join(cwd, "knowledge", "project", "architecture", "components");
    writeJson(path.join(compsDir, "C1.json"), { id: "C1", name: "Comp 1", layer: "domain", responsibilities: ["X"], files: ["a.ts"], interfaces: [], dependencies: [], status: "verified", source: { type: "operator-defined", ref: "m" } });

    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_list_architecture_components", {}, ctx);
    expect(result.content[0].text).toContain("C1");
  });
});

// ── loom_generate_agents_md ──────────────────────────────────────────────

describe("loom_generate_agents_md", () => {
  it("generates AGENTS.md.generated", async () => {
    const cwd = tmpDir("gamd");
    setupKnowledge(cwd);
    const { api, tools } = makeMockAPI();
    registerPlanTools(api);
    const ctx = makeContext(cwd);

    const result = await executeTool(tools, "loom_generate_agents_md", {
      project_name: "MyProject",
    }, ctx);

    expect(result.isError).toBeFalsy();
    const mdPath = path.join(cwd, "AGENTS.md.generated");
    expect(fs.existsSync(mdPath)).toBe(true);
    const md = fs.readFileSync(mdPath, "utf-8");
    expect(md).toContain("# AGENTS.md — MyProject");
  });
});


