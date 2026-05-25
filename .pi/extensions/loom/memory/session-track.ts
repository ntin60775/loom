/**
 * Session Track — ephemeral in-memory context for the current agent session
 *
 * INV-4: Deterministic — no hidden state outside this store.
 * INV-5: Task-scoped — entries carry task_id; session itself is ephemeral.
 */

import type { MemoryEntry, MemoryQuery, TrackStats } from "./types";

export interface SessionTrackOptions {
  maxEntries?: number;
  defaultTTLMs?: number;
}

export class SessionTrack {
  private entries = new Map<string, MemoryEntry>();
  private readonly maxEntries: number;
  private readonly defaultTTLMs: number;

  constructor(options: SessionTrackOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.defaultTTLMs = options.defaultTTLMs ?? 60 * 60 * 1000; // 1 hour
  }

  /**
   * Append a new entry to the session track.
   * If entry lacks expires_at, sets TTL based on defaultTTLMs.
   * Evicts oldest expired/over-limit entries after insertion.
   */
  append(entry: MemoryEntry): void {
    if (entry.track_type !== "session") {
      throw new Error(`SessionTrack only accepts track_type="session", got "${entry.track_type}"`);
    }

    const now = new Date().toISOString();
    const enriched: MemoryEntry = {
      ...entry,
      expires_at: entry.expires_at ?? new Date(Date.now() + this.defaultTTLMs).toISOString(),
      created_at: entry.created_at || now,
      updated_at: now,
      access_count: entry.access_count ?? 0,
      last_accessed_at: entry.last_accessed_at ?? now,
    };

    this.entries.set(enriched.entry_id, enriched);
    this.evict();
  }

  /**
   * Retrieve session entries ordered by freshness (newest first).
   * Optionally limited by `budget` (max number of entries).
   * Filters out expired entries.
   */
  getContext(budget?: number): MemoryEntry[] {
    const now = Date.now();
    const live = Array.from(this.entries.values())
      .filter((e) => !e.expires_at || new Date(e.expires_at).getTime() > now)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const result = budget !== undefined ? live.slice(0, budget) : live;

    // Update access metadata
    const nowIso = new Date().toISOString();
    for (const entry of result) {
      entry.access_count++;
      entry.last_accessed_at = nowIso;
    }

    return result;
  }

  /**
   * Query session entries with filters.
   * Supports filtering by task_id, tags, and relevance threshold.
   */
  query(q: MemoryQuery): MemoryEntry[] {
    const now = Date.now();
    let results = Array.from(this.entries.values()).filter((e) => {
      if (e.track_type !== "session") return false;
      if (e.expires_at && new Date(e.expires_at).getTime() <= now) return false;
      if (q.task_id !== undefined && e.task_id !== q.task_id) return false;
      if (q.tags && q.tags.length > 0 && !q.tags.some((t) => e.tags?.includes(t))) return false;
      if (q.min_relevance !== undefined && e.relevance_score < q.min_relevance) return false;
      return true;
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    const nowIso = new Date().toISOString();
    for (const entry of results) {
      entry.access_count++;
      entry.last_accessed_at = nowIso;
    }

    return results;
  }

  /**
   * Remove all entries. Irreversible.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Remove expired entries and enforce maxEntries limit.
   * Oldest entries are removed first when over limit.
   */
  evict(): void {
    const now = Date.now();
    // Remove expired
    for (const [id, entry] of this.entries) {
      if (entry.expires_at && new Date(entry.expires_at).getTime() <= now) {
        this.entries.delete(id);
      }
    }

    // Enforce maxEntries: remove oldest
    if (this.entries.size > this.maxEntries) {
      const sorted = Array.from(this.entries.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const toRemove = sorted.slice(0, this.entries.size - this.maxEntries);
      for (const entry of toRemove) {
        this.entries.delete(entry.entry_id);
      }
    }
  }

  /**
   * Statistics for the session track.
   */
  stats(): TrackStats {
    const values = Array.from(this.entries.values());
    const now = Date.now();
    const live = values.filter((e) => !e.expires_at || new Date(e.expires_at).getTime() > now);
    return {
      track_type: "session",
      total_entries: live.length,
      total_relevance: live.reduce((sum, e) => sum + e.relevance_score, 0),
      oldest_entry: live.length > 0
        ? live.reduce((min, e) => (new Date(e.timestamp) < new Date(min) ? e.timestamp : min), live[0].timestamp)
        : null,
      newest_entry: live.length > 0
        ? live.reduce((max, e) => (new Date(e.timestamp) > new Date(max) ? e.timestamp : max), live[0].timestamp)
        : null,
    };
  }

  /**
   * Total number of live entries.
   */
  size(): number {
    const now = Date.now();
    return Array.from(this.entries.values()).filter(
      (e) => !e.expires_at || new Date(e.expires_at).getTime() > now,
    ).length;
  }
}
