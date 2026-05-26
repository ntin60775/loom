/**
 * Tests: memory/manager.ts — MemoryManager orchestrator for 4 tracks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MemoryManager } from "../memory/manager";
import { makeMemoryEntry, makeMemoryQuery } from "./fixtures";
import { setupTestKnowledge } from "./setup";
import type { MemoryEntry, SessionContent, EpisodicContent, SemanticContent, ProceduralContent } from "../memory/types";

function makeSessionEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: SessionContent = { role: "user", message: "test message" };
  return { ...makeMemoryEntry({ track_type: "session", content }), ...overrides, track_type: "session" } as MemoryEntry;
}

function makeEpisodicEntry(taskId: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: EpisodicContent = { event: "test-event", decision: "test-decision", outcome: "success" };
  return { ...makeMemoryEntry({ track_type: "episodic", task_id: taskId, content }), ...overrides, track_type: "episodic", task_id: taskId } as MemoryEntry;
}

function makeSemanticEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: SemanticContent = { fact: "Test fact", category: "convention", confidence: 0.9 };
  return { ...makeMemoryEntry({ track_type: "semantic", content }), ...overrides, track_type: "semantic" } as MemoryEntry;
}

function makeProceduralEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: ProceduralContent = { pattern: "When X, do Y", context: "test", validation_status: "draft", usage_count: 0 };
  return { ...makeMemoryEntry({ track_type: "procedural", content }), ...overrides, track_type: "procedural" } as MemoryEntry;
}

describe("MemoryManager", () => {
  let cwd: string;
  let manager: MemoryManager;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-manager-test-"));
    setupTestKnowledge(cwd);
    manager = new MemoryManager({ cwd });
  });

  afterEach(() => {
    try { manager.session.clear(); } catch { /* ignore */ }
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── constructor ─────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates all four tracks with defaults", () => {
      expect(manager.session).toBeDefined();
      expect(manager.episodic).toBeDefined();
      expect(manager.semantic).toBeDefined();
      expect(manager.procedural).toBeDefined();
    });

    it("accepts custom relevance weights", () => {
      const m = new MemoryManager({
        cwd,
        relevanceWeights: { freshness: 0.5, frequency: 0.2, explicitRating: 0.3 },
      });
      expect(m).toBeDefined();
    });

    it("accepts custom retention policy", () => {
      const m = new MemoryManager({
        cwd,
        retentionPolicy: {
          max_entries_session: 10,
          max_entries_episodic: 5,
          max_entries_semantic: 20,
          max_entries_procedural: 5,
          max_age_days: 30,
          min_relevance: 0.2,
        },
      });
      expect(m).toBeDefined();
    });
  });

  // ── append ──────────────────────────────────────────────────────────────

  describe("append", () => {
    it("routes session entry to session track", () => {
      const entry = makeSessionEntry();
      manager.append(entry);
      expect(manager.session.size()).toBe(1);
    });

    it("routes episodic entry to episodic store", () => {
      const entry = makeEpisodicEntry("TASK-0001");
      manager.append(entry);
      const results = manager.episodic.query(cwd, { task_id: "TASK-0001" });
      expect(results).toHaveLength(1);
    });

    it("routes semantic entry to semantic store", () => {
      const entry = makeSemanticEntry({ source_ref: "rule:TEST" });
      manager.append(entry);
      const results = manager.semantic.query(cwd, {});
      expect(results).toHaveLength(1);
      expect(results[0].source_ref).toBe("rule:TEST");
    });

    it("routes procedural entry to procedural store", () => {
      const entry = makeProceduralEntry();
      manager.append(entry);
      const results = manager.procedural.query(cwd, {});
      expect(results).toHaveLength(1);
    });
  });

  // ── query ───────────────────────────────────────────────────────────────

  describe("query", () => {
    it("queries session track", () => {
      manager.append(makeSessionEntry({ entry_id: "s1" }));
      manager.append(makeSessionEntry({ entry_id: "s2" }));

      const results = manager.query("session", { limit: 1 });
      expect(results).toHaveLength(1);
    });

    it("queries episodic track", () => {
      manager.append(makeEpisodicEntry("TASK-0001", { entry_id: "e1" }));
      manager.append(makeEpisodicEntry("TASK-0002", { entry_id: "e2" }));

      const results = manager.query("episodic", { task_id: "TASK-0001" });
      expect(results).toHaveLength(1);
      expect(results[0].entry_id).toBe("e1");
    });

    it("queries semantic track", () => {
      manager.append(makeSemanticEntry({ source_ref: "rule:A" }));

      const results = manager.query("semantic", {});
      expect(results).toHaveLength(1);
    });

    it("queries procedural track", () => {
      manager.append(makeProceduralEntry());

      const results = manager.query("procedural", {});
      expect(results).toHaveLength(1);
    });
  });

  // ── recomputeRelevance (session — in-memory) ────────────────────────────

  describe("recomputeRelevance", () => {
    it("recomputes relevance for session entries", () => {
      manager.append(makeSessionEntry({ relevance_score: 0.5, access_count: 100 }));
      manager.append(makeSessionEntry({ relevance_score: 0.1, access_count: 0 }));

      manager.recomputeRelevance("session");

      const results = manager.query("session", {});
      // Both entries should have updated relevance
      expect(results).toHaveLength(2);
      // High-access entry should have higher relevance
      expect(results[0].relevance_score).not.toBe(0.5);
    });

    it("recomputes relevance for semantic entries (file-backed)", () => {
      manager.append(makeSemanticEntry({ source_ref: "rule:X", relevance_score: 0.5 }));

      manager.recomputeRelevance("semantic");

      const results = manager.query("semantic", {});
      expect(results).toHaveLength(1);
    });

    it("recomputes relevance for procedural entries (file-backed)", () => {
      manager.append(makeProceduralEntry({ relevance_score: 0.5 }));

      manager.recomputeRelevance("procedural");

      const results = manager.query("procedural", {});
      expect(results).toHaveLength(1);
    });

    it("recomputes relevance for episodic entries (file-backed)", () => {
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.5 }));

      manager.recomputeRelevance("episodic");

      const results = manager.query("episodic", { task_id: "TASK-0001" });
      expect(results).toHaveLength(1);
    });
  });

  // ── enforceRetention ────────────────────────────────────────────────────

  describe("enforceRetention", () => {
    it("evicts expired session entries", () => {
      const expired = makeSessionEntry({
        expires_at: new Date(Date.now() - 10000).toISOString(),
        entry_id: "expired",
      });
      manager.append(expired);

      manager.enforceRetention();

      expect(manager.session.size()).toBe(0);
    });

    it("compacts semantic and procedural stores", () => {
      // Should not throw — semantic/procedural compact is called
      expect(() => manager.enforceRetention()).not.toThrow();
    });
  });

  // ── compactEpisodic ─────────────────────────────────────────────────────

  describe("compactEpisodic", () => {
    it("compacts episodic store for a task", () => {
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.9 }));
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.05 }));

      manager.compactEpisodic("TASK-0001");

      const results = manager.query("episodic", { task_id: "TASK-0001" });
      expect(results).toHaveLength(1);
      expect(results[0].relevance_score).toBe(0.9);
    });
  });

  // ── summarizeEpisodic ───────────────────────────────────────────────────

  describe("summarizeEpisodic", () => {
    it("returns a summary entry", () => {
      manager.append(makeEpisodicEntry("TASK-0001", {
        content: { event: "Built X", decision: "Use Y", outcome: "success" } satisfies EpisodicContent,
      }));

      const summary = manager.summarizeEpisodic("TASK-0001");
      expect(summary.track_type).toBe("episodic");
      expect(summary.content.event).toContain("Summary");
    });

    it("returns default summary for empty task", () => {
      const summary = manager.summarizeEpisodic("TASK-NOEXIST");
      expect(summary.relevance_score).toBe(0.5);
    });
  });

  // ── indexSemantic ───────────────────────────────────────────────────────

  describe("indexSemantic", () => {
    it("indexes rules from project knowledge", () => {
      const rulesDir = path.join(cwd, "knowledge", "project", "rules");
      fs.writeFileSync(
        path.join(rulesDir, "RULE-001.json"),
        JSON.stringify({ id: "RULE-001", title: "Test Rule", body: "Always test", category: "testing", status: "active" }),
      );

      const result = manager.indexSemantic();
      expect(result.added).toBeGreaterThanOrEqual(1);
    });

    it("returns zero for empty rules dir", () => {
      const result = manager.indexSemantic();
      expect(result).toEqual({ added: 0, updated: 0, removed: 0 });
    });
  });

  // ── seedProcedural ──────────────────────────────────────────────────────

  describe("seedProcedural", () => {
    it("seeds patterns from completed tasks", () => {
      const taskDir = path.join(cwd, "knowledge", "tasks", "TASK-0001");
      fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });
      fs.writeFileSync(
        path.join(taskDir, "task.json"),
        JSON.stringify({ task_id: "TASK-0001", title: "Completed Task", status: "completed" }),
      );
      fs.writeFileSync(
        path.join(taskDir, "plan.json"),
        JSON.stringify({
          steps: [{ step_number: 1, title: "Build X", description: "Construct X", expected_output: "X.js", status: "done" }],
        }),
      );

      const result = manager.seedProcedural();
      expect(result.seeded).toBeGreaterThanOrEqual(1);
    });
  });

  // ── clearSession ────────────────────────────────────────────────────────

  describe("clearSession", () => {
    it("clears all session entries", () => {
      manager.append(makeSessionEntry());
      manager.append(makeSessionEntry());
      expect(manager.session.size()).toBe(2);

      manager.clearSession();

      expect(manager.session.size()).toBe(0);
    });

    it("does not affect other tracks", () => {
      manager.append(makeSessionEntry());
      manager.append(makeSemanticEntry({ source_ref: "rule:Z" }));

      manager.clearSession();

      expect(manager.session.size()).toBe(0);
      const semResults = manager.query("semantic", {});
      expect(semResults).toHaveLength(1);
    });
  });

  // ── stats ───────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns zeros for empty tracks", () => {
      const s = manager.stats();
      expect(s.session.total_entries).toBe(0);
      expect(s.episodic.total_entries).toBe(0);
      expect(s.semantic.total_entries).toBe(0);
      expect(s.procedural.total_entries).toBe(0);
    });

    it("returns correct counts for session entries", () => {
      manager.append(makeSessionEntry({ relevance_score: 0.5 }));
      manager.append(makeSessionEntry({ relevance_score: 0.3 }));

      const s = manager.stats();
      expect(s.session.total_entries).toBe(2);
      expect(s.session.total_relevance).toBeCloseTo(0.8);
    });

    it("returns correct counts for episodic entries", () => {
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.5 }));
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.7 }));

      const s = manager.stats();
      expect(s.episodic.total_entries).toBe(2);
      expect(s.episodic.total_relevance).toBeCloseTo(1.2);
    });

    it("returns correct counts for semantic entries", () => {
      manager.append(makeSemanticEntry({ relevance_score: 0.8 }));

      const s = manager.stats();
      expect(s.semantic.total_entries).toBe(1);
      expect(s.semantic.total_relevance).toBeCloseTo(0.8);
    });

    it("returns correct counts for procedural entries", () => {
      manager.append(makeProceduralEntry({ relevance_score: 0.6 }));

      const s = manager.stats();
      expect(s.procedural.total_entries).toBe(1);
      expect(s.procedural.total_relevance).toBeCloseTo(0.6);
    });

    it("aggregates all tracks", () => {
      manager.append(makeSessionEntry({ relevance_score: 0.3 }));
      manager.append(makeEpisodicEntry("TASK-0001", { relevance_score: 0.7 }));
      manager.append(makeSemanticEntry({ relevance_score: 0.8 }));
      manager.append(makeProceduralEntry({ relevance_score: 0.6 }));

      const s = manager.stats();
      expect(s.session.total_entries).toBe(1);
      expect(s.episodic.total_entries).toBe(1);
      expect(s.semantic.total_entries).toBe(1);
      expect(s.procedural.total_entries).toBe(1);
    });
  });

  // ── edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("throws on unknown track_type in append", () => {
      const entry = makeMemoryEntry({ track_type: "episodic" } as any);
      (entry as any).track_type = "unknown_type";
      expect(() => manager.append(entry)).toThrow("Unknown track_type");
    });

    it("throws on unknown track_type in query", () => {
      expect(() => manager.query("unknown" as any, {})).toThrow("Unknown track_type");
    });

    it("does not crash when recomputing relevance for empty track", () => {
      expect(() => manager.recomputeRelevance("session")).not.toThrow();
      expect(() => manager.recomputeRelevance("semantic")).not.toThrow();
      expect(() => manager.recomputeRelevance("procedural")).not.toThrow();
      expect(() => manager.recomputeRelevance("episodic")).not.toThrow();
    });

    it("does not crash when recomputing episodic with no task dirs", () => {
      // Remove task dirs
      fs.rmSync(path.join(cwd, "knowledge", "tasks"), { recursive: true, force: true });
      fs.mkdirSync(path.join(cwd, "knowledge", "tasks"), { recursive: true });

      expect(() => manager.recomputeRelevance("episodic")).not.toThrow();
    });
  });
});
