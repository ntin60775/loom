/**
 * Shared Store Utilities — filter and access meta helpers for memory stores
 *
 * Extracted from episodic-store.ts, semantic-store.ts, procedural-store.ts
 * to eliminate code duplication (W3 fix).
 *
 * INV-4: Deterministic — pure functions, no hidden state.
 */

import type { MemoryEntry, MemoryQuery } from "./types";

/**
 * Apply standard MemoryQuery filters to an array of entries.
 * Filters by: track_type, task_id, step_number, tags, min_relevance, date range.
 */
export function applyFilters(entries: MemoryEntry[], q: MemoryQuery, expectedTrack: MemoryEntry["track_type"]): MemoryEntry[] {
  return entries.filter((e) => {
    if (e.track_type !== expectedTrack) return false;
    if (q.task_id !== undefined && q.task_id !== null && e.task_id !== q.task_id) return false;
    if (q.step_number !== undefined && e.step_number !== q.step_number) return false;
    if (q.tags && q.tags.length > 0 && !q.tags.some((t) => e.tags?.includes(t))) return false;
    if (q.min_relevance !== undefined && e.relevance_score < q.min_relevance) return false;
    if (q.since && new Date(e.timestamp) < new Date(q.since)) return false;
    if (q.until && new Date(e.timestamp) > new Date(q.until)) return false;
    return true;
  });
}

/**
 * Bump access_count and last_accessed_at for an array of entries.
 * Mutates entries in-place.
 */
export function updateAccessMeta(entries: MemoryEntry[]): void {
  const now = new Date().toISOString();
  for (const entry of entries) {
    entry.access_count++;
    entry.last_accessed_at = now;
  }
}

/**
 * BatchWriter — defers file writes to reduce I/O pressure (W4 fix).
 *
 * Instead of writing to disk on every query (which bumps access_count),
 * we mark the file as dirty and schedule a flush. Multiple rapid queries
 * result in a single disk write.
 */
export class BatchWriter {
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushDelayMs: number;
  private readonly writeFn: (path: string, entries: MemoryEntry[]) => void;
  private readonly readFn: (path: string) => MemoryEntry[];

  constructor(
    writeFn: (path: string, entries: MemoryEntry[]) => void,
    readFn: (path: string) => MemoryEntry[],
    flushDelayMs = 5000,
  ) {
    this.writeFn = writeFn;
    this.readFn = readFn;
    this.flushDelayMs = flushDelayMs;
  }

  /** Mark a file path as dirty. Schedule flush if not already scheduled. */
  markDirty(filePath: string): void {
    this.dirty.add(filePath);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushDelayMs);
    }
  }

  /** Flush all dirty files to disk immediately. */
  flushNow(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  /** Internal: write all dirty files. Retains read-then-write semantics. */
  private flush(): void {
    this.timer = null;
    for (const filePath of this.dirty) {
      try {
        const entries = this.readFn(filePath);
        this.writeFn(filePath, entries);
      } catch {
        // If read fails, skip — data may not exist yet
      }
    }
    this.dirty.clear();
  }

  /** Number of dirty files pending flush. */
  get pendingCount(): number {
    return this.dirty.size;
  }
}
