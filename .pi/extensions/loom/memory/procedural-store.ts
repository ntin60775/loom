/**
 * Procedural Store — validated practices and patterns from closed tasks
 *
 * Storage: knowledge/project/memory/procedural.json
 * Extraction: manual seed on start (auto — deferred).
 *
 * INV-1: Active memory — patterns are validated and ranked.
 * INV-5: Project-scoped — patterns extracted from task history.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryEntry, MemoryQuery, TrackStats, ProceduralContent } from "./types";
import { readJsonFile, writeJsonFile } from "./utils";
import { applyFilters, updateAccessMeta, BatchWriter } from "./store-utils";

export interface ProceduralStoreOptions {
  maxEntries?: number;
  minRelevance?: number;
}

interface PlanStepJson {
  step_number: number;
  title: string;
  description: string;
  expected_output: string;
  status: string;
}

interface PlanJson {
  steps: PlanStepJson[];
}

export class ProceduralStore {
  private readonly maxEntries: number;
  private readonly minRelevance: number;
  private readonly batchWriter: BatchWriter;

  constructor(options: ProceduralStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.minRelevance = options.minRelevance ?? 0.1;
    this.batchWriter = new BatchWriter(
      (filePath, entries) => writeJsonFile(filePath, entries),
      (filePath) => readJsonFile<MemoryEntry[]>(filePath) ?? [],
    );
  }

  private storePath(cwd: string): string {
    return path.join(cwd, "knowledge", "project", "memory", "procedural.json");
  }

  private readStore(cwd: string): MemoryEntry[] {
    return readJsonFile<MemoryEntry[]>(this.storePath(cwd)) ?? [];
  }

  private writeStore(cwd: string, entries: MemoryEntry[]): void {
    writeJsonFile(this.storePath(cwd), entries);
  }

  /**
   * Learn a new pattern. Adds or updates by pattern + context hash.
   */
  learn(cwd: string, entry: MemoryEntry): void {
    if (entry.track_type !== "procedural") {
      throw new Error(`ProceduralStore only accepts track_type="procedural", got "${entry.track_type}"`);
    }
    const entries = this.readStore(cwd);
    const content = entry.content as ProceduralContent;
    const sourceRef = content.pattern.trim().toLowerCase();

    const idx = entries.findIndex((e) => {
      const c = e.content as ProceduralContent;
      return c.pattern.trim().toLowerCase() === sourceRef;
    });

    const now = new Date().toISOString();
    const enriched: MemoryEntry = {
      ...entry,
      source_ref: `procedural:${sourceRef}`,
      created_at: entry.created_at || now,
      updated_at: now,
      access_count: entry.access_count ?? 0,
      last_accessed_at: entry.last_accessed_at ?? now,
    };

    if (idx >= 0) {
      // Merge usage_count if existing
      const existingContent = entries[idx].content as ProceduralContent;
      const newContent = enriched.content as ProceduralContent;
      newContent.usage_count = (existingContent.usage_count ?? 0) + (newContent.usage_count ?? 0);
      entries[idx] = enriched;
    } else {
      entries.push(enriched);
    }

    this.writeStore(cwd, this.compact(entries));
  }

  /**
   * Query procedural patterns.
   */
  query(cwd: string, q: MemoryQuery): MemoryEntry[] {
    let entries = this.readStore(cwd);
    entries = applyFilters(entries, q, "procedural");
    entries.sort((a, b) => {
      const aContent = a.content as ProceduralContent;
      const bContent = b.content as ProceduralContent;
      // Validated patterns rank higher
      const aScore = a.relevance_score + (aContent.validation_status === "validated" ? 0.2 : 0) + ((aContent.usage_count ?? 0) * 0.01);
      const bScore = b.relevance_score + (bContent.validation_status === "validated" ? 0.2 : 0) + ((bContent.usage_count ?? 0) * 0.01);
      return bScore - aScore;
    });

    if (q.limit) {
      entries = entries.slice(0, q.limit);
    }

    updateAccessMeta(entries);
    this.batchWriter.markDirty(this.storePath(cwd));
    return entries;
  }

  /**
   * Validate (or invalidate) a pattern by source_ref.
   */
  validate(cwd: string, sourceRef: string, status: ProceduralContent["validation_status"]): boolean {
    const entries = this.readStore(cwd);
    const idx = entries.findIndex((e) => e.source_ref === sourceRef);
    if (idx < 0) return false;
    const content = entries[idx].content as ProceduralContent;
    content.validation_status = status;
    entries[idx].updated_at = new Date().toISOString();
    this.writeStore(cwd, entries);
    return true;
  }

  /**
   * Increment usage_count for a pattern.
   */
  recordUsage(cwd: string, sourceRef: string): boolean {
    const entries = this.readStore(cwd);
    const idx = entries.findIndex((e) => e.source_ref === sourceRef);
    if (idx < 0) return false;
    const content = entries[idx].content as ProceduralContent;
    content.usage_count = (content.usage_count ?? 0) + 1;
    entries[idx].updated_at = new Date().toISOString();
    this.writeStore(cwd, entries);
    return true;
  }

  /**
   * Seed procedural store from closed tasks.
   * Scans tasks with status "completed" and extracts patterns from step titles + expected outputs.
   * This is a heuristic seed; manual curation recommended.
   */
  seedFromTasks(cwd: string): { seeded: number } {
    const tasksDir = path.join(cwd, "knowledge", "tasks");
    let seeded = 0;

    if (!fs.existsSync(tasksDir)) return { seeded };

    const taskDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.startsWith("TASK-"))
      .filter((d) => fs.statSync(path.join(tasksDir, d)).isDirectory());

    for (const taskId of taskDirs) {
      const taskJson = readJsonFile<{ status: string; title: string }>(path.join(tasksDir, taskId, "task.json"));
      if (!taskJson || taskJson.status !== "completed") continue;

      const planJson = readJsonFile<PlanJson>(path.join(tasksDir, taskId, "plan.json"));
      if (!planJson?.steps) continue;

      for (const step of planJson.steps) {
        if (step.status !== "done") continue;
        const pattern = `When working on "${taskJson.title}", for step "${step.title}": ${step.description}`;
        const content: ProceduralContent = {
          pattern,
          context: `Task ${taskId}: ${taskJson.title}. Expected output: ${step.expected_output}`,
          validation_status: "draft",
          origin_task_id: taskId,
          usage_count: 0,
        };
        const now = new Date().toISOString();
        const entry: MemoryEntry = {
          entry_id: `procedural-${taskId}-step${step.step_number}-${Date.now()}`,
          task_id: taskId,
          step_number: step.step_number,
          timestamp: now,
          track_type: "procedural",
          content,
          relevance_score: 0.6,
          source_ref: `procedural:${pattern.trim().toLowerCase()}`,
          tags: ["auto-seeded", taskId],
          created_at: now,
          updated_at: now,
          expires_at: null,
          access_count: 0,
          last_accessed_at: now,
        };
        this.learn(cwd, entry);
        seeded++;
      }
    }

    return { seeded };
  }

  /**
   * Compact: remove low-relevance and enforce maxEntries.
   */
  compact(cwd: string): void {
    const entries = this.readStore(cwd);
    this.writeStore(cwd, this.compactEntries(entries));
  }

  private compactEntries(entries: MemoryEntry[]): MemoryEntry[] {
    let result = entries.filter((e) => e.relevance_score >= this.minRelevance);
    result.sort((a, b) => {
      const aContent = a.content as ProceduralContent;
      const bContent = b.content as ProceduralContent;
      const aScore = a.relevance_score + (aContent.validation_status === "validated" ? 0.2 : 0) + ((aContent.usage_count ?? 0) * 0.01);
      const bScore = b.relevance_score + (bContent.validation_status === "validated" ? 0.2 : 0) + ((bContent.usage_count ?? 0) * 0.01);
      return bScore - aScore;
    });
    if (result.length > this.maxEntries) {
      result = result.slice(0, this.maxEntries);
    }
    return result;
  }

  /**
   * Statistics.
   */
  stats(cwd: string): TrackStats {
    const entries = this.readStore(cwd).filter((e) => e.track_type === "procedural");
    return {
      track_type: "procedural",
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
