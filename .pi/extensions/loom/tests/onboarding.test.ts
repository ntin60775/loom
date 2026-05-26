/**
 * Tests: knowledge/onboarding.ts — project classification, structure, AGENTS.md generation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  preCheck,
  ensureKnowledgeStructure,
  onboardProject,
  generateAgentsMd,
  listRules,
  listArchitectureComponents,
  writeRule,
  writeArchitectureComponent,
} from "../knowledge/onboarding";
import type { AgentsMdInput } from "../knowledge/onboarding";

// ── Helpers ───────────────────────────────────────────────────────────────

function tmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `loom-test-onboarding-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

// ── preCheck ──────────────────────────────────────────────────────────────

describe("preCheck", () => {
  it("detects clean project (no .git, no AGENTS.md, no knowledge/)", () => {
    const cwd = tmpDir("clean");
    const state = preCheck(cwd);
    expect(state.git_repo).toBe(false);
    expect(state.has_agents_md).toBe(false);
    expect(state.has_knowledge).toBe(false);
  });

  it("detects git repo", () => {
    const cwd = tmpDir("git");
    fs.mkdirSync(path.join(cwd, ".git"));
    const state = preCheck(cwd);
    expect(state.git_repo).toBe(true);
    expect(state.has_agents_md).toBe(false);
  });

  it("detects AGENTS.md", () => {
    const cwd = tmpDir("agentsmd");
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Project");
    const state = preCheck(cwd);
    expect(state.has_agents_md).toBe(true);
    expect(state.has_knowledge).toBe(false);
  });

  it("detects knowledge/ directory", () => {
    const cwd = tmpDir("knowledge");
    fs.mkdirSync(path.join(cwd, "knowledge"));
    const state = preCheck(cwd);
    expect(state.has_knowledge).toBe(true);
  });

  it("detects compatible project (git + AGENTS.md + knowledge/)", () => {
    const cwd = tmpDir("compatible");
    fs.mkdirSync(path.join(cwd, ".git"));
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Project");
    fs.mkdirSync(path.join(cwd, "knowledge"));
    const state = preCheck(cwd);
    expect(state.git_repo).toBe(true);
    expect(state.has_agents_md).toBe(true);
    expect(state.has_knowledge).toBe(true);
  });
});

// ── ensureKnowledgeStructure ──────────────────────────────────────────────

describe("ensureKnowledgeStructure", () => {
  it("creates full knowledge structure in empty dir", () => {
    const cwd = tmpDir("struct");
    const { created, existing } = ensureKnowledgeStructure(cwd);
    expect(created.length).toBeGreaterThan(0);
    expect(created).toContain("tasks");
    expect(created).toContain("schemas");
    expect(created).toContain("configs");
    expect(created).toContain("rules");
    expect(created).toContain("architecture");
    expect(created).toContain("registry.json");
    expect(created).toContain("execution-config.json");
    expect(created).toContain("subagent-config.json");
  });

  it("detects existing structure", () => {
    const cwd = tmpDir("existing");
    ensureKnowledgeStructure(cwd); // first call creates
    const { existing } = ensureKnowledgeStructure(cwd); // second call detects
    expect(existing).toContain("tasks");
    expect(existing).toContain("registry.json");
  });

  it("creates valid execution-config.json", () => {
    const cwd = tmpDir("execcfg");
    ensureKnowledgeStructure(cwd);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(cwd, "knowledge", "project", "configs", "execution-config.json"), "utf-8")
    );
    expect(cfg.review.enabled).toBe(true);
    expect(cfg.review.max_iterations).toBe(10);
    expect(cfg.use_memory_v2).toBe(false);
    expect(cfg.memory.token_budget).toBe(4000);
  });

  it("creates valid subagent-config.json", () => {
    const cwd = tmpDir("subcfg");
    ensureKnowledgeStructure(cwd);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(cwd, "knowledge", "project", "configs", "subagent-config.json"), "utf-8")
    );
    expect(cfg.domains).toBeDefined();
    expect(cfg.worker.domain_rules).toBeInstanceOf(Array);
  });
});

// ── onboardProject ────────────────────────────────────────────────────────

describe("onboardProject", () => {
  it("classifies clean project (git exists, no AGENTS.md, no knowledge/)", () => {
    const cwd = tmpDir("class-clean");
    fs.mkdirSync(path.join(cwd, ".git"));
    const result = onboardProject(cwd);
    expect(result.state.classification).toBe("clean");
    expect(result.created.length).toBeGreaterThan(0);
  });

  it("classifies compatible project", () => {
    const cwd = tmpDir("class-compat");
    fs.mkdirSync(path.join(cwd, ".git"));
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# P");
    fs.mkdirSync(path.join(cwd, "knowledge"));
    const result = onboardProject(cwd);
    expect(result.state.classification).toBe("compatible");
  });

  it("classifies foreign_system (git + AGENTS.md, no knowledge/)", () => {
    const cwd = tmpDir("class-foreign");
    fs.mkdirSync(path.join(cwd, ".git"));
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# P");
    const result = onboardProject(cwd);
    expect(result.state.classification).toBe("foreign_system");
  });

  it("classifies mixed_system (git + knowledge/, no AGENTS.md)", () => {
    const cwd = tmpDir("class-mixed");
    fs.mkdirSync(path.join(cwd, ".git"));
    fs.mkdirSync(path.join(cwd, "knowledge"));
    const result = onboardProject(cwd);
    expect(result.state.classification).toBe("mixed_system");
  });

  it("classifies partial (no git)", () => {
    const cwd = tmpDir("class-partial");
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# P");
    const result = onboardProject(cwd);
    expect(result.state.classification).toBe("partial");
  });
});

// ── generateAgentsMd ──────────────────────────────────────────────────────

describe("generateAgentsMd", () => {
  it("generates markdown with project name", () => {
    const input: AgentsMdInput = {
      projectName: "TestProject",
      stack: { languages: ["TypeScript"] },
      research: null,
      rules: [],
      components: [],
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("# AGENTS.md — TestProject");
    expect(md).toContain("TypeScript");
    expect(md).toContain("/plan");
    expect(md).toContain("/agent");
    expect(md).toContain("alt+m");
  });

  it("includes tasks when provided", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: null,
      rules: [],
      components: [],
      tasks: [
        { task_id: "T-1", title: "Task One", status: "active", priority: "high", branch: "task/T-1" },
        { task_id: "T-2", title: "Task Two", status: "completed", priority: "medium", branch: "task/T-2" },
      ],
      active_task_id: "T-1",
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("Всего задач: 2");
    expect(md).toContain("Активных: 1");
    expect(md).toContain("T-1: Task One");
    expect(md).toContain("**Текущая:** T-1");
  });

  it("includes invariants when tasks have them", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: null,
      rules: [],
      components: [],
      tasks: [
        {
          task_id: "T-1", title: "T1", status: "active", priority: "high", branch: "task/T-1",
          invariants: [
            { id: "INV-1", text: "JSON primary", marker: "INVARIANT:", status: "verified" },
          ],
        },
      ],
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("## Инварианты");
    expect(md).toContain("INV-1");
    expect(md).toContain("JSON primary");
  });

  it("includes rules section", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: null,
      rules: [
        { id: "R-1", title: "No console.log", category: "style", status: "active", body: "Use logger instead", version: 1 },
      ],
      components: [],
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("## Правила");
    expect(md).toContain("R-1");
    expect(md).toContain("Use logger instead");
  });

  it("includes architecture components", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: null,
      rules: [],
      components: [
        { id: "C-1", name: "Core", layer: "domain", status: "verified", files: ["a.ts", "b.ts"], responsibilities: ["Does X"] },
      ],
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("## Архитектура");
    expect(md).toContain("Core");
    expect(md).toContain("Does X");
  });

  it("includes research context when provided", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: { readme_summary: "A test project", recommendations: ["Add tests"] },
      rules: [],
      components: [],
    };
    const md = generateAgentsMd(input);
    expect(md).toContain("A test project");
    expect(md).toContain("Add tests");
  });

  it("deduplicates invariants by ID", () => {
    const input: AgentsMdInput = {
      projectName: "P",
      stack: null,
      research: null,
      rules: [],
      components: [],
      tasks: [
        {
          task_id: "T-1", title: "T1", status: "active", priority: "high", branch: "task/T-1",
          invariants: [{ id: "INV-1", text: "First", marker: "INV:", status: "verified" }],
        },
        {
          task_id: "T-2", title: "T2", status: "completed", priority: "medium", branch: "task/T-2",
          invariants: [{ id: "INV-1", text: "First dup", marker: "INV:", status: "verified" }],
        },
      ],
    };
    const md = generateAgentsMd(input);
    // INV-1 should appear only once
    const firstIdx = md.indexOf("INV-1");
    const lastIdx = md.lastIndexOf("INV-1");
    expect(firstIdx).toBe(lastIdx);
  });
});

// ── listRules ─────────────────────────────────────────────────────────────

describe("listRules", () => {
  it("returns empty when no rules dir", () => {
    const cwd = tmpDir("norules");
    const rules = listRules(cwd);
    expect(rules).toEqual([]);
  });

  it("returns empty when dir exists but has no .json files", () => {
    const cwd = tmpDir("emptyrules");
    ensureKnowledgeStructure(cwd);
    const rules = listRules(cwd);
    expect(rules).toEqual([]);
  });

  it("lists rules from catalog", () => {
    const cwd = tmpDir("withrules");
    ensureKnowledgeStructure(cwd);
    writeRule(cwd, { id: "RULE-001", title: "Rule 1", category: "style", body: "Always X", status: "active", version: 1, scope: ["*"], source: { type: "operator", ref: "manual" }, evidence: [], created_at: "2026-01-01", updated_at: "2026-01-01" });
    writeRule(cwd, { id: "RULE-002", title: "Rule 2", category: "git", body: "Never Y", status: "proposed", version: 1, scope: ["*"], source: { type: "operator", ref: "manual" }, evidence: [], created_at: "2026-01-01", updated_at: "2026-01-01" });

    const rules = listRules(cwd);
    expect(rules.length).toBe(2);
    expect(rules.map((r) => r.id).sort()).toEqual(["RULE-001", "RULE-002"]);
    expect(rules[0]).toHaveProperty("title");
    expect(rules[0]).toHaveProperty("category");
    expect(rules[0]).toHaveProperty("status");
  });
});

// ── listArchitectureComponents ────────────────────────────────────────────

describe("listArchitectureComponents", () => {
  it("returns empty when no components dir", () => {
    const cwd = tmpDir("nocomps");
    const comps = listArchitectureComponents(cwd);
    expect(comps).toEqual([]);
  });

  it("lists components from catalog", () => {
    const cwd = tmpDir("withcomps");
    ensureKnowledgeStructure(cwd);
    writeArchitectureComponent(cwd, { id: "COMP-001", name: "Core", layer: "domain", responsibilities: ["X"], files: ["a.ts"], interfaces: [], dependencies: [], status: "verified", source: { type: "operator-defined", ref: "manual" } });
    writeArchitectureComponent(cwd, { id: "COMP-002", name: "UI", layer: "presentation", responsibilities: ["Y"], files: ["b.ts"], interfaces: [], dependencies: [], status: "discovered", source: { type: "operator-defined", ref: "manual" } });

    const comps = listArchitectureComponents(cwd);
    expect(comps.length).toBe(2);
    expect(comps.map((c) => c.id).sort()).toEqual(["COMP-001", "COMP-002"]);
    expect(comps[0]).toHaveProperty("layer");
    expect(comps[0]).toHaveProperty("status");
  });
});

// ── writeRule / writeArchitectureComponent ────────────────────────────────

describe("writeRule", () => {
  it("writes rule to catalog and returns filepath", () => {
    const cwd = tmpDir("writerule");
    ensureKnowledgeStructure(cwd);
    const fp = writeRule(cwd, { id: "R-TEST", title: "Test", category: "style", body: "Do X", status: "active", version: 1, scope: ["*"], source: { type: "operator", ref: "manual" }, evidence: [], created_at: "2026-01-01", updated_at: "2026-01-01" });
    expect(fp).toContain("R-TEST.json");
    expect(fs.existsSync(fp)).toBe(true);
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    expect(data.id).toBe("R-TEST");
    expect(data.title).toBe("Test");
  });
});

describe("writeArchitectureComponent", () => {
  it("writes component to catalog and returns filepath", () => {
    const cwd = tmpDir("writecomp");
    ensureKnowledgeStructure(cwd);
    const fp = writeArchitectureComponent(cwd, { id: "COMP-TEST", name: "TestComp", layer: "domain", responsibilities: ["Does X"], files: ["x.ts"], interfaces: [], dependencies: [], status: "discovered", source: { type: "operator-defined", ref: "manual" } });
    expect(fp).toContain("COMP-TEST.json");
    expect(fs.existsSync(fp)).toBe(true);
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    expect(data.name).toBe("TestComp");
    expect(data.layer).toBe("domain");
  });
});
