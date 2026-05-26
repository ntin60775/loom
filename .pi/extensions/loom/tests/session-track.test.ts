/**
 * Tests: memory/session-track.ts — in-memory session store
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SessionTrack } from "../memory/session-track";
import { makeMemoryEntry } from "./fixtures";
import type { MemoryEntry, SessionContent } from "../memory/types";

function makeSessionEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const content: SessionContent = { role: "user", message: "test message" };
  return {
    ...makeMemoryEntry({ track_type: "session", content }),
    ...overrides,
    track_type: "session",
  };
}

describe("SessionTrack", () => {
  let track: SessionTrack;

  beforeEach(() => {
    track = new SessionTrack({ maxEntries: 100 });
  });

  // ── append ─────────────────────────────────────────────────────────────

  describe("append", () => {
    it("stores an entry", () => {
      const entry = makeSessionEntry();
      track.append(entry);
      expect(track.size()).toBe(1);
    });

    it("throws for non-session track_type", () => {
      const entry = makeMemoryEntry({ track_type: "episodic" });
      expect(() => track.append(entry)).toThrow("only accepts track_type=\"session\"");
    });

    it("auto-sets expires_at if missing", () => {
      const entry = makeSessionEntry({ expires_at: null });
      track.append(entry);
      const ctx = track.getContext();
      expect(ctx[0].expires_at).not.toBeNull();
    });

    it("auto-sets created_at if missing", () => {
      const entry = makeSessionEntry({ created_at: "" });
      track.append(entry);
      const ctx = track.getContext();
      expect(ctx[0].created_at).toBeTruthy();
    });
  });

  // ── getContext ─────────────────────────────────────────────────────────

  describe("getContext", () => {
    it("returns entries sorted by timestamp (newest first)", () => {
      const old = makeSessionEntry({ entry_id: "old", timestamp: "2026-01-01T00:00:00.000Z" });
      const newer = makeSessionEntry({ entry_id: "newer", timestamp: "2026-05-01T00:00:00.000Z" });
      const newest = makeSessionEntry({ entry_id: "newest", timestamp: "2026-06-01T00:00:00.000Z" });

      track.append(old);
      track.append(newest);
      track.append(newer);

      const ctx = track.getContext();
      expect(ctx[0].entry_id).toBe("newest");
      expect(ctx[2].entry_id).toBe("old");
    });

    it("respects budget parameter", () => {
      for (let i = 0; i < 5; i++) {
        track.append(makeSessionEntry({ entry_id: `e${i}` }));
      }
      expect(track.getContext(2)).toHaveLength(2);
      expect(track.getContext()).toHaveLength(5);
    });

    it("bumps access_count on read", () => {
      const entry = makeSessionEntry();
      track.append(entry);
      track.getContext();
      const ctx = track.getContext();
      expect(ctx[0].access_count).toBeGreaterThanOrEqual(1);
    });

    it("filters out expired entries", async () => {
      const expired = makeSessionEntry({
        entry_id: "expired",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const live = makeSessionEntry({
        entry_id: "live",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });

      track.append(expired);
      track.append(live);

      const ctx = track.getContext();
      expect(ctx).toHaveLength(1);
      expect(ctx[0].entry_id).toBe("live");
    });
  });

  // ── query ──────────────────────────────────────────────────────────────

  describe("query", () => {
    it("filters by task_id", () => {
      track.append(makeSessionEntry({ entry_id: "a", task_id: "T-1" }));
      track.append(makeSessionEntry({ entry_id: "b", task_id: "T-2" }));

      const result = track.query({ task_id: "T-1" });
      expect(result).toHaveLength(1);
      expect(result[0].entry_id).toBe("a");
    });

    it("filters by tags", () => {
      track.append(makeSessionEntry({ entry_id: "a", tags: ["important"] }));
      track.append(makeSessionEntry({ entry_id: "b", tags: ["low"] }));

      const result = track.query({ tags: ["important"] });
      expect(result).toHaveLength(1);
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) track.append(makeSessionEntry());
      expect(track.query({ limit: 2 })).toHaveLength(2);
    });
  });

  // ── evict ──────────────────────────────────────────────────────────────

  describe("evict", () => {
    it("removes expired entries", () => {
      const expired = makeSessionEntry({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      track.append(expired);
      track.evict();
      expect(track.size()).toBe(0);
    });

    it("enforces maxEntries by removing oldest", () => {
      const small = new SessionTrack({ maxEntries: 2 });
      small.append(makeSessionEntry({ entry_id: "a", timestamp: "2026-01-01T00:00:00.000Z" }));
      small.append(makeSessionEntry({ entry_id: "b", timestamp: "2026-02-01T00:00:00.000Z" }));
      small.append(makeSessionEntry({ entry_id: "c", timestamp: "2026-03-01T00:00:00.000Z" }));

      // evict is called automatically in append — oldest "a" should be gone
      expect(small.size()).toBe(2);
    });
  });

  // ── clear ──────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("removes all entries", () => {
      track.append(makeSessionEntry());
      track.append(makeSessionEntry());
      track.clear();
      expect(track.size()).toBe(0);
    });
  });

  // ── stats ──────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns zero for empty track", () => {
      const s = track.stats();
      expect(s.total_entries).toBe(0);
    });

    it("returns correct counts", () => {
      track.append(makeSessionEntry({ relevance_score: 0.5 }));
      track.append(makeSessionEntry({ relevance_score: 0.3 }));
      const s = track.stats();
      expect(s.total_entries).toBe(2);
      expect(s.total_relevance).toBeCloseTo(0.8);
      expect(s.oldest_entry).toBeTruthy();
      expect(s.newest_entry).toBeTruthy();
    });
  });
});
