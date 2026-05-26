/**
 * Tests: memory/semantic-store.ts + memory/procedural-store.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SemanticStore } from "../memory/semantic-store";
import { ProceduralStore } from "../memory/procedural-store";
import { makeMemoryEntry, makeMemoryQuery } from "./fixtures";
import { setupTestKnowledge } from "./setup";
import type { MemoryEntry, SemanticContent, ProceduralContent, EpisodicContent } from "../memory/types";

// ── SemanticStore ──────────────────────────────────────────────────────────

describe("SemanticStore", () => {
  let cwd: string;
  let store: SemanticStore;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-sem-test-"));
    setupTestKnowledge(cwd);
    store = new SemanticStore({ maxEntries: 500, minRelevance: 0.1 });
  });

  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("stores and queries a semantic entry", () => {
    const now = new Date().toISOString();
    const content: SemanticContent = { fact: "Test fact", category: "convention", confidence: 0.9 };
    const entry: MemoryEntry = {
      entry_id: "test-se-1",
      task_id: null,
      step_number: null,
      timestamp: now,
      track_type: "semantic",
      content,
      relevance_score: 0.8,
      source_ref: "rule:TEST-001",
      tags: [],
      created_at: now,
      updated_at: now,
      expires_at: null,
      access_count: 0,
      last_accessed_at: now,
    };

    store.update(cwd, entry);
    const results = store.query(cwd, makeMemoryQuery());
    expect(results).toHaveLength(1);
    expect(results[0].source_ref).toBe("rule:TEST-001");
  });

  it("updates existing entry by source_ref", () => {
    const content1: SemanticContent = { fact: "Fact 1", category: "convention" };
    const content2: SemanticContent = { fact: "Fact 2", category: "convention" };

    store.update(cwd, {
      ...makeMemoryEntry({ track_type: "semantic", content: content1 }),
      source_ref: "rule:TEST-001",
      track_type: "semantic",
    } as MemoryEntry);

    store.update(cwd, {
      ...makeMemoryEntry({ track_type: "semantic", content: content2, relevance_score: 1.0 }),
      source_ref: "rule:TEST-001",
      track_type: "semantic",
    } as MemoryEntry);

    const results = store.query(cwd, makeMemoryQuery());
    expect(results).toHaveLength(1);
    expect(results[0].relevance_score).toBe(1.0);
  });

  it("indexes rules from knowledge/project/rules", () => {
    const rulesDir = path.join(cwd, "knowledge", "project", "rules");
    fs.writeFileSync(
      path.join(rulesDir, "RULE-001.json"),
      JSON.stringify({ id: "RULE-001", title: "Test Rule", body: "Always test", category: "testing", status: "active" }),
    );

    const result = store.index(cwd);
    expect(result.added).toBeGreaterThanOrEqual(1);

    const entries = store.query(cwd, makeMemoryQuery({ tags: ["rule"] }));
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("throws for wrong track_type on update", () => {
    const entry = makeMemoryEntry({ track_type: "episodic" }) as MemoryEntry;
    expect(() => store.update(cwd, entry)).toThrow("only accepts track_type=\"semantic\"");
  });
});

// ── ProceduralStore ────────────────────────────────────────────────────────

describe("ProceduralStore", () => {
  let cwd: string;
  let store: ProceduralStore;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-proc-test-"));
    setupTestKnowledge(cwd);
    store = new ProceduralStore({ maxEntries: 500, minRelevance: 0.1 });
  });

  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("learns and queries a pattern", () => {
    const content: ProceduralContent = { pattern: "When doing X, use Y", context: "Task T-001", validation_status: "draft" };
    const entry = {
      ...makeMemoryEntry({ track_type: "procedural", content }),
      track_type: "procedural" as const,
    } as MemoryEntry;

    store.learn(cwd, entry);
    const results = store.query(cwd, makeMemoryQuery());
    expect(results).toHaveLength(1);
  });

  it("merges usage_count on repeated learning", () => {
    const content: ProceduralContent = { pattern: "Common pattern", context: "T-001", validation_status: "draft", usage_count: 1 };
    store.learn(cwd, {
      ...makeMemoryEntry({ track_type: "procedural", content }),
      track_type: "procedural",
    } as MemoryEntry);

    store.learn(cwd, {
      ...makeMemoryEntry({ track_type: "procedural", content: { ...content, usage_count: 3 } }),
      track_type: "procedural",
    } as MemoryEntry);

    const results = store.query(cwd, makeMemoryQuery());
    expect(results).toHaveLength(1);
    const procContent = results[0].content as ProceduralContent;
    expect(procContent.usage_count).toBe(4); // 1 + 3 merged
  });

  it("validates a pattern status", () => {
    const content: ProceduralContent = { pattern: "Test pattern", context: "T", validation_status: "draft", usage_count: 0 };
    store.learn(cwd, {
      ...makeMemoryEntry({ track_type: "procedural", content }),
      track_type: "procedural",
      source_ref: "procedural:test pattern",
    } as MemoryEntry);

    const ok = store.validate(cwd, "procedural:test pattern", "validated");
    expect(ok).toBe(true);

    const results = store.query(cwd, makeMemoryQuery());
    const procContent = results[0].content as ProceduralContent;
    expect(procContent.validation_status).toBe("validated");
  });

  it("returns false for validate on unknown pattern", () => {
    expect(store.validate(cwd, "nonexistent", "validated")).toBe(false);
  });

  it("seeds from completed tasks", () => {
    const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-0001");
    fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "task.json"),
      JSON.stringify({ task_id: "TASK-0001", title: "Completed Task", status: "completed" }),
    );
    fs.writeFileSync(
      path.join(taskDir, "plan.json"),
      JSON.stringify({
        steps: [
          { step_number: 1, title: "Build X", description: "Construct module X", expected_output: "X.js", status: "done" },
        ],
      }),
    );

    const result = store.seedFromTasks(cwd);
    expect(result.seeded).toBeGreaterThanOrEqual(1);

    const entries = store.query(cwd, makeMemoryQuery({ tags: ["auto-seeded"] }));
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("throws for wrong track_type on learn", () => {
    const entry = makeMemoryEntry({ track_type: "episodic" }) as MemoryEntry;
    expect(() => store.learn(cwd, entry)).toThrow("only accepts track_type=\"procedural\"");
  });
});
