/**
 * Tests: memory/store-utils.ts — applyFilters, updateAccessMeta, BatchWriter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyFilters, updateAccessMeta, BatchWriter } from "../memory/store-utils";
import { makeMemoryEntry, makeMemoryQuery } from "./fixtures";
import type { MemoryEntry, MemoryQuery } from "../memory/types";

// ── applyFilters ───────────────────────────────────────────────────────────

describe("applyFilters", () => {
  const entry: MemoryEntry = {
    ...makeMemoryEntry({ track_type: "episodic", task_id: "T-001", step_number: 1 }),
    tags: ["important", "frontend"],
    relevance_score: 0.8,
    timestamp: "2026-05-01T10:00:00.000Z",
  };

  it("passes matching entries", () => {
    const result = applyFilters([entry], makeMemoryQuery({ task_id: "T-001" }), "episodic");
    expect(result).toHaveLength(1);
  });

  it("filters out wrong track_type", () => {
    const result = applyFilters([entry], makeMemoryQuery(), "semantic");
    expect(result).toHaveLength(0);
  });

  it("filters by task_id", () => {
    const result = applyFilters([entry], makeMemoryQuery({ task_id: "T-002" }), "episodic");
    expect(result).toHaveLength(0);
  });

  it("task_id=null in query passes everything", () => {
    const result = applyFilters([entry], makeMemoryQuery({ task_id: null }), "episodic");
    expect(result).toHaveLength(1);
  });

  it("task_id=undefined in query passes everything", () => {
    const q: MemoryQuery = { task_id: undefined, min_relevance: 0 };
    const result = applyFilters([entry], q, "episodic");
    expect(result).toHaveLength(1);
  });

  it("filters by step_number", () => {
    const result = applyFilters([entry], makeMemoryQuery({ step_number: 2 }), "episodic");
    expect(result).toHaveLength(0);
  });

  it("filters by tags", () => {
    const r1 = applyFilters([entry], makeMemoryQuery({ tags: ["important"] }), "episodic");
    expect(r1).toHaveLength(1);
    const r2 = applyFilters([entry], makeMemoryQuery({ tags: ["nonexistent"] }), "episodic");
    expect(r2).toHaveLength(0);
  });

  it("filters by min_relevance", () => {
    const r1 = applyFilters([entry], makeMemoryQuery({ min_relevance: 0.5 }), "episodic");
    expect(r1).toHaveLength(1);
    const r2 = applyFilters([entry], makeMemoryQuery({ min_relevance: 0.9 }), "episodic");
    expect(r2).toHaveLength(0);
  });

  it("filters by date range", () => {
    const r1 = applyFilters([entry], makeMemoryQuery({ since: "2026-04-01" }), "episodic");
    expect(r1).toHaveLength(1);
    const r2 = applyFilters([entry], makeMemoryQuery({ since: "2026-06-01" }), "episodic");
    expect(r2).toHaveLength(0);
    const r3 = applyFilters([entry], makeMemoryQuery({ until: "2026-04-01" }), "episodic");
    expect(r3).toHaveLength(0);
  });
});

// ── updateAccessMeta ───────────────────────────────────────────────────────

describe("updateAccessMeta", () => {
  it("increments access_count and updates last_accessed_at", async () => {
    const entry = makeMemoryEntry({ access_count: 3 });
    const oldAccessed = entry.last_accessed_at!;

    // Small delay to guarantee timestamp difference
    await new Promise((r) => setTimeout(r, 5));
    updateAccessMeta([entry]);

    expect(entry.access_count).toBe(4);
    expect(entry.last_accessed_at).not.toBe(oldAccessed);
  });

  it("handles empty array", () => {
    expect(() => updateAccessMeta([])).not.toThrow();
  });

  it("updates multiple entries", () => {
    const entries = [makeMemoryEntry(), makeMemoryEntry(), makeMemoryEntry()];
    updateAccessMeta(entries);
    expect(entries.every((e) => e.access_count === 1)).toBe(true);
  });
});

// ── BatchWriter ────────────────────────────────────────────────────────────

describe("BatchWriter", () => {
  let writeCalls: Array<{ path: string; entries: MemoryEntry[] }> = [];
  let readCalls: string[] = [];
  let stored: Map<string, MemoryEntry[]> = new Map();

  beforeEach(() => {
    writeCalls = [];
    readCalls = [];
    stored = new Map();
  });

  function makeWriter(flushDelay = 100) {
    return new BatchWriter(
      (path, entries) => {
        writeCalls.push({ path, entries });
        stored.set(path, entries);
      },
      (path) => {
        readCalls.push(path);
        return stored.get(path) ?? [];
      },
      flushDelay,
    );
  }

  it("defers writes until flush", async () => {
    const writer = makeWriter(100);
    stored.set("/test.json", [makeMemoryEntry()]);

    writer.markDirty("/test.json");
    expect(writeCalls).toHaveLength(0); // not flushed yet
    expect(writer.pendingCount).toBe(1);
  });

  it("flushNow writes immediately", () => {
    const writer = makeWriter(100);
    stored.set("/test.json", [makeMemoryEntry()]);

    writer.markDirty("/test.json");
    writer.flushNow();

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].path).toBe("/test.json");
    expect(writer.pendingCount).toBe(0);
  });

  it("batches multiple dirty files into one flush", () => {
    const writer = makeWriter(100);
    stored.set("/a.json", [makeMemoryEntry()]);
    stored.set("/b.json", [makeMemoryEntry()]);

    writer.markDirty("/a.json");
    writer.markDirty("/b.json");
    writer.flushNow();

    expect(writeCalls).toHaveLength(2);
  });

  it("calling markDirty twice before flush writes once", () => {
    const writer = makeWriter(100);
    stored.set("/test.json", [makeMemoryEntry()]);

    writer.markDirty("/test.json");
    writer.markDirty("/test.json");
    writer.flushNow();

    // Should be 1 write (deduplication by path), but current impl writes both
    // because Set deduplicates paths — so it's 1
    expect(writeCalls.filter((c) => c.path === "/test.json")).toHaveLength(1);
  });
});
