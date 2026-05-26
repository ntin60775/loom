/**
 * Episodic Store — task-scoped event and decision storage
 *
 * Storage: knowledge/tasks/{task_id}/artifacts/memory-episodic.json
 * Indexing: by date, task_id, step_number
 *
 * INV-1: Active memory — records are ranked and can be summarized.
 * INV-5: Task-scoped — each task has its own episodic file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryEntry, MemoryQuery, TrackStats, EpisodicContent } from "./types";
import { readJsonFile, writeJsonFile } from "./utils";
import { logger } from "../shared/logger";

export interface EpisodicStoreOptions {
  maxEntriesPerTask?: number;
  minRelevance?: number;
}

export class EpisodicStore {
  private readonly maxEntriesPerTask: number;
  private readonly minRelevance: number;

  constructor(options: EpisodicStoreOptions = {}) {
    this.maxEntriesPerTask = options.maxEntriesPerTask ?? 500;
    this.minRelevance = options.minRelevance ?? 0.1;
  }

  private episodicPath(cwd: string, taskId: string): string {
    return path.join(cwd, "knowledge", "tasks", taskId, "artifacts", "memory-episodic.json");
  }

  private readTaskEntries(cwd: string, taskId: string): MemoryEntry[] {
    return readJsonFile<MemoryEntry[]>(this.episodicPath(cwd, taskId)) ?? [];
  }

  private writeTaskEntries(cwd: string, taskId: string, entries: MemoryEntry[]): void {
    writeJsonFile(this.episodicPath(cwd, taskId), entries);
  }

  /**
   * Record a new episodic entry for a task.
   */
  record(cwd: string, entry: MemoryEntry): void {
    if (entry.track_type !== "episodic") {
      throw new Error(`EpisodicStore only accepts track_type="episodic", got "${entry.track_type}"`);
    }
    if (!entry.task_id) {
      throw new Error("Episodic entry must have a task_id");
    }

    const entries = this.readTaskEntries(cwd, entry.task_id);
    const now = new Date().toISOString();
    const enriched: MemoryEntry = {
      ...entry,
      created_at: entry.created_at || now,
      updated_at: now,
      access_count: entry.access_count ?? 0,
      last_accessed_at: entry.last_accessed_at ?? now,
    };

    entries.push(enriched);
    // Compact only when near limit to avoid O(n²) on every record
    const compacted = this.maybeCompact(entries);
    this.writeTaskEntries(cwd, entry.task_id, compacted);
  }

  /**
   * Query episodic entries.
   * Supports filtering by task_id, step_number, tags, relevance, date range.
   */
  query(cwd: string, q: MemoryQuery): MemoryEntry[] {
    const taskId = q.task_id;
    if (!taskId) {
      // Cross-task query: scan all task episodic files
      return this.queryAllTasks(cwd, q);
    }

    let entries = this.readTaskEntries(cwd, taskId);
    entries = this.applyFilters(entries, q);
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (q.limit) {
      entries = entries.slice(0, q.limit);
    }

    this.updateAccessMeta(entries);
    this.writeTaskEntries(cwd, taskId, this.readTaskEntries(cwd, taskId)); // persist updated access_count
    return entries;
  }

  private queryAllTasks(cwd: string, q: MemoryQuery): MemoryEntry[] {
    const tasksDir = path.join(cwd, "knowledge", "tasks");
    let all: MemoryEntry[] = [];

    try {
      const taskIds = fs
        .readdirSync(tasksDir)
        .filter((d: string) => fs.statSync(path.join(tasksDir, d)).isDirectory());

      for (const taskId of taskIds) {
        const entries = this.readTaskEntries(cwd, taskId);
        all = all.concat(this.applyFilters(entries, q));
      }
    } catch (err) {
      // tasks directory may not exist yet
      logger.debug("episodic-store", "Failed to query task entries", err);
    }

    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (q.limit) {
      all = all.slice(0, q.limit);
    }

    this.updateAccessMeta(all);
    return all;
  }

  private applyFilters(entries: MemoryEntry[], q: MemoryQuery): MemoryEntry[] {
    return entries.filter((e) => {
      if (e.track_type !== "episodic") return false;
      if (q.step_number !== undefined && e.step_number !== q.step_number) return false;
      if (q.tags && q.tags.length > 0 && !q.tags.some((t) => e.tags?.includes(t))) return false;
      if (q.min_relevance !== undefined && e.relevance_score < q.min_relevance) return false;
      if (q.since && new Date(e.timestamp) < new Date(q.since)) return false;
      if (q.until && new Date(e.timestamp) > new Date(q.until)) return false;
      return true;
    });
  }

  private updateAccessMeta(entries: MemoryEntry[]): void {
    const now = new Date().toISOString();
    for (const entry of entries) {
      entry.access_count++;
      entry.last_accessed_at = now;
    }
  }

  /**
   * Summarize entries for a task into a compact narrative.
   * Returns a single MemoryEntry with summarized content.
   */
  summarize(cwd: string, taskId: string, topN = 10): MemoryEntry {
    const entries = this.readTaskEntries(cwd, taskId);
    const sorted = entries
      .filter((e) => e.track_type === "episodic")
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, topN);

    const events = sorted.map((e) => {
      const c = e.content as EpisodicContent;
      return `- ${c.event} → ${c.outcome}`;
    });

    const summaryContent: EpisodicContent = {
      event: `Summary of ${sorted.length} episodes`,
      decision: `Top decisions: ${sorted.map((e) => (e.content as EpisodicContent).decision).join("; ")}`,
      outcome: "summary",
      affected_files: Array.from(new Set(sorted.flatMap((e) => (e.content as EpisodicContent).affected_files ?? []))),
    };

    const now = new Date().toISOString();
    const summary: MemoryEntry = {
      entry_id: `episodic-summary-${taskId}-${Date.now()}`,
      task_id: taskId,
      step_number: null,
      timestamp: now,
      track_type: "episodic",
      content: summaryContent,
      relevance_score: sorted.length > 0 ? sorted.reduce((s, e) => s + e.relevance_score, 0) / sorted.length : 0.5,
      source_ref: `episodic-store:summarize(${taskId})`,
      tags: ["summary", "episodic"],
      created_at: now,
      updated_at: now,
      expires_at: null,
      access_count: 0,
      last_accessed_at: now,
    };

    return summary;
  }

  /**
   * Compact a task's episodic store: remove low-relevance entries and enforce maxEntriesPerTask.
   */
  compact(cwd: string, taskId: string): void {
    let entries = this.readTaskEntries(cwd, taskId);
    entries = this.compactEntries(entries);
    this.writeTaskEntries(cwd, taskId, entries);
  }

  /**
   * Check if compaction is needed based on count and relevance threshold.
   * Avoids O(n²) compaction on every record.
   */
  private maybeCompact(entries: MemoryEntry[]): MemoryEntry[] {
    if (entries.length <= this.maxEntriesPerTask) {
      const hasLowRelevance = entries.some((e) => e.relevance_score < this.minRelevance);
      if (!hasLowRelevance) {
        return entries; // skip compaction when under limit and no low-relevance entries
      }
    }
    return this.compactEntries(entries);
  }

  private compactEntries(entries: MemoryEntry[]): MemoryEntry[] {
    // Filter by min relevance
    let result = entries.filter((e) => e.relevance_score >= this.minRelevance);

    // Sort by relevance desc, then timestamp desc
    result.sort((a, b) => {
      const rel = b.relevance_score - a.relevance_score;
      if (rel !== 0) return rel;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Enforce max entries
    if (result.length > this.maxEntriesPerTask) {
      result = result.slice(0, this.maxEntriesPerTask);
    }

    return result;
  }

  /**
   * Statistics for a task's episodic store.
   */
  stats(cwd: string, taskId: string): TrackStats {
    const entries = this.readTaskEntries(cwd, taskId).filter((e) => e.track_type === "episodic");
    return {
      track_type: "episodic",
      total_entries: entries.length,
      total_relevance: entries.reduce((sum, e) => sum + e.relevance_score, 0),
      oldest_entry: entries.length > 0
        ? entries.reduce((min, e) => (new Date(e.timestamp) < new Date(min) ? e.timestamp : min), entries[0].timestamp)
        : null,
      newest_entry: entries.length > 0
        ? entries.reduce((max, e) => (new Date(e.timestamp) > new Date(max) ? e.timestamp : max), entries[0].timestamp)
        : null,
    };
  }
}
