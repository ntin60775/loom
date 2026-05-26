/**
 * Tests: memory/episodic-store.ts — file-backed episodic store
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { EpisodicStore } from "../memory/episodic-store";
import { makeMemoryEntry } from "./fixtures";
import { setupTestKnowledge } from "./setup";
import type { MemoryEntry, EpisodicContent } from "../memory/types";

function makeEpisodicEntry(taskId: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: EpisodicContent = { event: "test-event", decision: "test-decision", outcome: "success" };
  return {
    ...makeMemoryEntry({ track_type: "episodic", task_id: taskId, content }),
    ...overrides,
    track_type: "episodic",
    task_id: taskId,
  } as MemoryEntry;
}

describe("EpisodicStore", () => {
  let cwd: string;
  let store: EpisodicStore;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-episodic-test-"));
    setupTestKnowledge(cwd);
    store = new EpisodicStore({ maxEntriesPerTask: 100, minRelevance: 0.1 });
  });

  afterEach(() => {
    store.batchWriter?.flushNow?.();
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── record ─────────────────────────────────────────────────────────────

  describe("record", () => {
    it("stores an entry for a task", () => {
      const entry = makeEpisodicEntry("T-001");
      store.record(cwd, entry);

      const results = store.query(cwd, { task_id: "T-001" });
      expect(results).toHaveLength(1);
      expect(results[0].entry_id).toBe(entry.entry_id);
    });

    it("throws for non-episodic track_type", () => {
      const entry = makeMemoryEntry({ track_type: "session", task_id: "T-001" });
      expect(() => store.record(cwd, entry)).toThrow("only accepts track_type=\"episodic\"");
    });

    it("throws for missing task_id", () => {
      const entry = makeMemoryEntry({ track_type: "episodic", task_id: null });
      expect(() => store.record(cwd, entry)).toThrow("must have a task_id");
    });

    it("writes to file-backed storage", () => {
      const entry = makeEpisodicEntry("T-001");
      store.record(cwd, entry);

      const epPath = path.join(cwd, "knowledge", "tasks", "T-001", "artifacts", "memory-episodic.json");
      expect(fs.existsSync(epPath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(epPath, "utf-8"));
      expect(raw).toHaveLength(1);
    });
  });

  // ── query ──────────────────────────────────────────────────────────────

  describe("query", () => {
    it("filters by task_id", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "a" }));
      store.record(cwd, makeEpisodicEntry("T-002", { entry_id: "b" }));

      const results = store.query(cwd, { task_id: "T-001" });
      expect(results).toHaveLength(1);
      expect(results[0].entry_id).toBe("a");
    });

    it("cross-task query returns all entries", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "a" }));
      store.record(cwd, makeEpisodicEntry("T-002", { entry_id: "b" }));

      const results = store.query(cwd, {});
      expect(results).toHaveLength(2);
    });

    it("filters by step_number", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "a", step_number: 1 }));
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "b", step_number: 2 }));

      const results = store.query(cwd, { task_id: "T-001", step_number: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].entry_id).toBe("a");
    });

    it("sorts by timestamp (newest first)", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "old", timestamp: "2026-01-01T00:00:00.000Z" }));
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "new", timestamp: "2026-06-01T00:00:00.000Z" }));

      const results = store.query(cwd, { task_id: "T-001" });
      expect(results[0].entry_id).toBe("new");
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        store.record(cwd, makeEpisodicEntry("T-001", { entry_id: `e${i}` }));
      }
      const results = store.query(cwd, { task_id: "T-001", limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  // ── summarize ──────────────────────────────────────────────────────────

  describe("summarize", () => {
    it("returns a summary entry for a task", () => {
      store.record(cwd, makeEpisodicEntry("T-001", {
        content: { event: "Built feature X", decision: "Use pattern A", outcome: "success" } satisfies EpisodicContent,
      }));
      store.record(cwd, makeEpisodicEntry("T-001", {
        content: { event: "Fixed bug Y", decision: "Refactor module Z", outcome: "success" } satisfies EpisodicContent,
      }));

      const summary = store.summarize(cwd, "T-001");
      expect(summary.track_type).toBe("episodic");
      expect(summary.content.event).toContain("Summary");
      const content = summary.content as EpisodicContent;
      expect(content.affected_files).toBeDefined();
    });

    it("handles empty task", () => {
      const summary = store.summarize(cwd, "T-NONEXISTENT");
      expect(summary.relevance_score).toBe(0.5);
    });
  });

  // ── compact ────────────────────────────────────────────────────────────

  describe("compact", () => {
    it("removes low-relevance entries", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "keep", relevance_score: 0.9 }));
      store.record(cwd, makeEpisodicEntry("T-001", { entry_id: "drop", relevance_score: 0.05 }));

      store.compact(cwd, "T-001");
      const results = store.query(cwd, { task_id: "T-001" });
      expect(results).toHaveLength(1);
      expect(results[0].entry_id).toBe("keep");
    });

    it("enforces maxEntriesPerTask", () => {
      const small = new EpisodicStore({ maxEntriesPerTask: 2, minRelevance: 0 });
      for (let i = 0; i < 5; i++) {
        small.record(cwd, makeEpisodicEntry("T-001", { entry_id: `e${i}`, relevance_score: 0.5 }));
      }
      small.compact(cwd, "T-001");
      const results = small.query(cwd, { task_id: "T-001" });
      expect(results).toHaveLength(2);
    });
  });

  // ── stats ──────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns empty stats for no entries", () => {
      const s = store.stats(cwd, "T-NONEXISTENT");
      expect(s.total_entries).toBe(0);
    });

    it("returns correct counts", () => {
      store.record(cwd, makeEpisodicEntry("T-001", { relevance_score: 0.5 }));
      store.record(cwd, makeEpisodicEntry("T-001", { relevance_score: 0.7 }));
      const s = store.stats(cwd, "T-001");
      expect(s.total_entries).toBe(2);
      expect(s.total_relevance).toBeCloseTo(1.2);
    });
  });
});
