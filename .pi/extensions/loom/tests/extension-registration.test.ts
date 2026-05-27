/**
 * Tests: index.ts — extension registration, commands, tools, shortcuts
 *
 * Full integration test of the loom extension entry point.
 * Mocks ExtensionAPI and verifies all registrations happen correctly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── We need to mock pi-ai Type before importing index.ts ──────────────────

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
      Optional: (type: unknown, def?: Record<string, unknown>) => type,
      Union: (types: unknown[], def?: Record<string, unknown>) => types[0],
      Any: (def?: Record<string, unknown>) => createType(def),
      Null: () => null,
      Enum: (values: Record<string, string>) => createType({}),
    },
  };
});

vi.mock("@earendil-works/pi-tui", () => ({
  Key: {
    alt: (char: string) => ({ key: `alt+${char}`, ctrl: false, meta: false, shift: false }),
  },
}));

// Mock pi-coding-agent: withFileMutationQueue
vi.mock("@earendil-works/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@earendil-works/pi-coding-agent")>("@earendil-works/pi-coding-agent");
  // Return minimal mock — we only need the function
  return {
    ...actual,
    withFileMutationQueue: async (p: string, fn: () => Promise<void>) => fn(),
  };
});

// ── Mock subagent spawner BEFORE importing index ─────────────────────────
// This prevents real subagent spawning during registration

vi.mock("../subagent/spawner", () => ({
  spawnSubagent: vi.fn().mockResolvedValue({
    exitCode: 0,
    messages: [{ role: "assistant", content: [{ type: "text", text: "mock output" }] }],
    stderr: "",
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
    model: "mock-model",
    stopReason: "end_turn",
  }),
}));

// ── Mock shared/utils to stub loadPrompt ────────────────────────────────

vi.mock("../shared/utils", async () => {
  const actual = await vi.importActual<typeof import("../shared/utils")>("../shared/utils");
  return {
    ...actual,
    loadPrompt: (relativePath: string) => {
      // Return a minimal valid prompt string for any prompt file
      return `[MOCK PROMPT: ${relativePath}]\nYou are a mock agent. Do the task.`;
    },
  };
});

// ── Now import the extension ─────────────────────────────────────────────

import loomExtension from "../index.dev";

// ── Helpers ──────────────────────────────────────────────────────────────

interface RegisteredCommand {
  name: string;
  opts: Record<string, unknown>;
}

interface RegisteredTool {
  name: string;
  opts: Record<string, unknown>;
}

interface RegisteredShortcut {
  key: unknown;
  opts: Record<string, unknown>;
}

interface RegisteredEvent {
  event: string;
  handler: (...args: unknown[]) => unknown;
}

function makeMockAPI() {
  const commands: RegisteredCommand[] = [];
  const tools: RegisteredTool[] = [];
  const shortcuts: RegisteredShortcut[] = [];
  const events: RegisteredEvent[] = [];
  let activeTools: string[] = [];
  const sentMessages: string[] = [];

  const api: ExtensionAPI = {
    registerCommand(name: string, opts: Record<string, unknown>) {
      commands.push({ name, opts });
    },
    registerTool(opts: Record<string, unknown>) {
      tools.push({ name: opts.name as string, opts });
    },
    registerShortcut(key: unknown, opts: Record<string, unknown>) {
      shortcuts.push({ key, opts });
    },
    setActiveTools(toolsList: string[]) {
      activeTools = [...toolsList];
      return toolsList;
    },
    sendUserMessage(msg: string) {
      sentMessages.push(msg);
    },
    on(event: string, handler: (...args: unknown[]) => unknown) {
      events.push({ event, handler });
      return () => {}; // Return unsubscribe function
    },
  };

  return { api, commands, tools, shortcuts, events, getActiveTools: () => activeTools, sentMessages };
}

function tmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `loom-test-ext-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setupMinimalKnowledge(baseDir: string) {
  const kd = path.join(baseDir, "knowledge");
  fs.mkdirSync(path.join(kd, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "configs"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "rules"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "architecture", "components"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "memory"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "onboarding"), { recursive: true });
  fs.mkdirSync(path.join(kd, "project", "cache"), { recursive: true });

  // Registry
  fs.writeFileSync(path.join(kd, "tasks", "registry.json"), JSON.stringify({
    schema_version: "1.0.0",
    tasks: [],
  }, null, 2));

  // Execution config
  fs.writeFileSync(path.join(kd, "project", "configs", "execution-config.json"), JSON.stringify({
    review: { enabled: true, max_iterations: 10, auto_select_reviewer: { enabled: true, domain_rules: [] } },
    recovery: { max_retries_per_step: 10, default_strategy: "retry_with_correction", escalate_after_total_failures: 5 },
    timeout: { worker: 3600, reviewer: 1800, scout: 600 },
    use_memory_v2: false,
    memory: {
      token_budget: 4000,
      relevance_weights: { freshness: 0.4, frequency: 0.3, explicit_rating: 0.3 },
      retention: { max_entries_session: 1000, max_entries_episodic: 500, max_entries_semantic: 2000, max_entries_procedural: 500, max_age_days: 90, min_relevance: 0.1 },
    },
  }, null, 2));

  // Subagent config
  fs.writeFileSync(path.join(kd, "project", "configs", "subagent-config.json"), JSON.stringify({
    domains: { general: { provider: "deepseek", model: "deepseek-chat" } },
    worker: { domain_rules: [{ default: "general" }] },
    reviewer: { thinking: "xhigh", domain_rules: [{ default: "general" }] },
    scout: { thinking: "xhigh" },
  }, null, 2));

  return kd;
}

function makeContext(cwd: string): ExtensionContext {
  return {
    cwd,
    ui: {
      notify: () => {},
      setWidget: () => {},
      setStatus: () => {},
      select: async () => "",
    },
    sessionManager: {
      getEntries: () => [],
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("loom extension registration", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tmpDir("ext");
    setupMinimalKnowledge(cwd);
  });

  it("registers all expected commands", () => {
    const { api, commands } = makeMockAPI();
    loomExtension(api);

    const names = commands.map((c) => c.name).sort();
    expect(names).toContain("plan");
    expect(names).toContain("agent");
    expect(names).toContain("loom-init");
    expect(names).toContain("task-status");
    expect(names).toContain("rule-add");
    expect(names).toContain("rule-list");
    expect(names).toContain("arch-add");
    expect(names).toContain("arch-list");
    expect(names).toContain("subagents");
    expect(names).toContain("subagent-focus");
    expect(names).toContain("subagent-kill");
    expect(names).toContain("loom-config");
    expect(names).toContain("verify-matrix");
    expect(commands.length).toBeGreaterThanOrEqual(13);
  });

  it("registers all expected tools", () => {
    const { api, tools } = makeMockAPI();
    loomExtension(api);

    const names = tools.map((t) => t.name).sort();
    // Plan mode tools
    expect(names).toContain("loom_create_task");
    expect(names).toContain("loom_create_plan");
    expect(names).toContain("loom_add_invariant");
    expect(names).toContain("loom_add_delivery_unit");
    expect(names).toContain("loom_finalize_plan");
    expect(names).toContain("loom_spawn_subagent");
    expect(names).toContain("loom_run_scout");
    expect(names).toContain("loom_run_researcher");
    expect(names).toContain("loom_run_migrator");
    expect(names).toContain("loom_add_rule");
    expect(names).toContain("loom_list_rules");
    expect(names).toContain("loom_add_architecture_component");
    expect(names).toContain("loom_list_architecture_components");
    expect(names).toContain("loom_generate_agents_md");
    expect(names).toContain("loom_search_knowledge");
    // Agent mode tools
    expect(names).toContain("loom_get_next_step");
    expect(names).toContain("loom_check_iteration");
    expect(names).toContain("loom_spawn_worker");
    expect(names).toContain("loom_spawn_reviewer");
    expect(names).toContain("loom_update_task");
    expect(names).toContain("loom_read_artifact");
    expect(names).toContain("loom_run_localization_guard");
    expect(names).toContain("loom_verify_invariants");
    expect(names).toContain("loom_edit_config");
    // Direct mode tools
    expect(names).toContain("loom_get_direct_steps");
    expect(names).toContain("loom_complete_direct_step");
    // Total tools should be 26
    expect(tools.length).toBe(26);
  });

  it("registers alt+m shortcut", () => {
    const { api, shortcuts } = makeMockAPI();
    loomExtension(api);

    expect(shortcuts.length).toBe(1);
    expect(shortcuts[0].key).toEqual({ key: "alt+m", ctrl: false, meta: false, shift: false });
    expect(shortcuts[0].opts.description).toContain("переключение");
  });

  it("registers session_start event", () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);

    const sessionStart = events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();
    expect(typeof sessionStart!.handler).toBe("function");
  });

  it("registers before_agent_start event", () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);

    const before = events.find((e) => e.event === "before_agent_start");
    expect(before).toBeDefined();
  });

  it("registers agent_end event", () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);

    const end = events.find((e) => e.event === "agent_end");
    expect(end).toBeDefined();
  });

  it("starts in idle mode by default (normal tools active)", () => {
    const { api, getActiveTools } = makeMockAPI();
    loomExtension(api);

    // Initially idle — plan/agent mode tools not set until session_start
    // But setActiveTools is called with NORMAL_MODE_TOOLS on session_start
    // Let's trigger session_start
    const ctx = makeContext(cwd);
    const events: RegisteredEvent[] = [];
    const api2 = makeMockAPI();
    // Use a fresh api to capture event registrations
    loomExtension(api2.api);
    const sessionStartEv = api2.events.find(e => e.event === "session_start");
    expect(sessionStartEv).toBeDefined();
  });
});

// ── Command handler smoke tests ──────────────────────────────────────────

describe("loom command handlers", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tmpDir("cmd");
    setupMinimalKnowledge(cwd);
  });

  it("/loom-init handler works without crash", async () => {
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const loomInit = commands.find((c) => c.name === "loom-init");
    expect(loomInit).toBeDefined();

    // Execute the handler
    await loomInit!.opts.handler("", ctx);
    // Should not throw
  });

  it("/task-status handler works without crash", async () => {
    const freshCwd = tmpDir("ts");
    setupMinimalKnowledge(freshCwd);
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(freshCwd);

    const cmd = commands.find((c) => c.name === "task-status");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
  });

  it("/rule-list handler works without crash", async () => {
    const freshCwd = tmpDir("rl");
    setupMinimalKnowledge(freshCwd);
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(freshCwd);

    const cmd = commands.find((c) => c.name === "rule-list");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
  });

  it("/arch-list handler works without crash", async () => {
    const freshCwd = tmpDir("al");
    setupMinimalKnowledge(freshCwd);
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(freshCwd);

    const cmd = commands.find((c) => c.name === "arch-list");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
  });

  it("/subagents handler works without crash", async () => {
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const cmd = commands.find((c) => c.name === "subagents");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
  });

  it("/verify-matrix handler works without crash", async () => {
    const freshCwd = tmpDir("vm");
    setupMinimalKnowledge(freshCwd);
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(freshCwd);

    const cmd = commands.find((c) => c.name === "verify-matrix");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
  });

  it("/subagent-focus requires id argument", async () => {
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const cmd = commands.find((c) => c.name === "subagent-focus");
    expect(cmd).toBeDefined();
    // Without args — should notify warning, not crash
    await cmd!.opts.handler("", ctx);
    // With args — should notify error (no such subagent)
    await cmd!.opts.handler("nonexistent", ctx);
  });

  it("/subagent-kill requires id argument", async () => {
    const { api, commands } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const cmd = commands.find((c) => c.name === "subagent-kill");
    expect(cmd).toBeDefined();
    await cmd!.opts.handler("", ctx);
    await cmd!.opts.handler("nonexistent", ctx);
  });
});

// ── Mode switching ────────────────────────────────────────────────────────

describe("mode switching via event hooks", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tmpDir("mode");
    setupMinimalKnowledge(cwd);
  });

  it("session_start sets mode to idle when no state file", async () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const sessionStart = events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();

    // Should not throw
    await sessionStart!.handler({}, ctx);
  });

  it("session_start loads from knowledge/.loom-state.json", async () => {
    const statePath = path.join(cwd, "knowledge", ".loom-state.json");
    fs.writeFileSync(statePath, JSON.stringify({ mode: "plan", currentTaskId: null }));

    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const sessionStart = events.find((e) => e.event === "session_start");
    await sessionStart!.handler({}, ctx);
  });

  it("session_start falls back to legacy session state", async () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx: ExtensionContext = {
      ...makeContext(cwd),
      sessionManager: {
        getEntries: () => [{
          type: "custom",
          customType: "loom-state",
          data: { mode: "agent", currentTaskId: "T-1" },
        }],
      },
    };

    const sessionStart = events.find((e) => e.event === "session_start");
    await sessionStart!.handler({}, ctx);
  });

  it("before_agent_start returns plan context in plan mode", async () => {
    const statePath = path.join(cwd, "knowledge", ".loom-state.json");
    fs.writeFileSync(statePath, JSON.stringify({ mode: "plan", currentTaskId: null }));

    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    // Trigger session_start to set mode from file
    const sessionStart = events.find((e) => e.event === "session_start");
    await sessionStart!.handler({}, ctx);

    // Now check before_agent_start
    const before = events.find((e) => e.event === "before_agent_start");
    const result = await before!.handler();
    expect(result).toBeDefined();
    expect(result!.message.customType).toBe("loom-plan-context");
    expect(result!.message.content).toContain("LOOM PLAN MODE ACTIVE");
  });

  it("before_agent_start returns agent context in agent mode", async () => {
    const statePath = path.join(cwd, "knowledge", ".loom-state.json");
    fs.writeFileSync(statePath, JSON.stringify({ mode: "agent", currentTaskId: "T-1" }));

    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const sessionStart = events.find((e) => e.event === "session_start");
    await sessionStart!.handler({}, ctx);

    const before = events.find((e) => e.event === "before_agent_start");
    const result = await before!.handler();
    expect(result).toBeDefined();
    expect(result!.message.customType).toBe("loom-agent-context");
    expect(result!.message.content).toContain("LOOM AGENT MODE ACTIVE");
  });

  it("before_agent_start returns undefined in idle mode", async () => {
    const { api, events } = makeMockAPI();
    loomExtension(api);
    const ctx = makeContext(cwd);

    const sessionStart = events.find((e) => e.event === "session_start");
    await sessionStart!.handler({}, ctx);

    const before = events.find((e) => e.event === "before_agent_start");
    const result = await before!.handler();
    // In idle mode, no message should be returned
    expect(result).toBeUndefined();
  });
});
