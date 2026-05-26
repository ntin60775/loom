/**
 * Semantic Store — facts, rules, architecture, invariants
 *
 * Storage: knowledge/project/memory/semantic.json
 * Sources: rules/, architecture/components/, task invariants
 *
 * INV-1: Active memory — indexed from authoritative sources.
 * INV-5: Project-scoped — global knowledge, not bound to a single task.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryEntry, MemoryQuery, TrackStats, SemanticContent } from "./types";
import { readJsonFile, writeJsonFile } from "./utils";
import { applyFilters, updateAccessMeta, BatchWriter } from "./store-utils";

export interface SemanticStoreOptions {
  maxEntries?: number;
  minRelevance?: number;
}

interface RuleJson {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  scope?: string[];
}

interface ArchitectureJson {
  id: string;
  name: string;
  layer: string;
  responsibilities: string[];
  files: string[];
  status: string;
}

interface InvariantJson {
  id: string;
  text: string;
  marker: string;
  status: string;
}

export class SemanticStore {
  private readonly maxEntries: number;
  private readonly minRelevance: number;
  private readonly batchWriter: BatchWriter;

  constructor(options: SemanticStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 2000;
    this.minRelevance = options.minRelevance ?? 0.1;
    this.batchWriter = new BatchWriter(
      (filePath, entries) => writeJsonFile(filePath, entries),
      (filePath) => readJsonFile<MemoryEntry[]>(filePath) ?? [],
    );
  }

  private storePath(cwd: string): string {
    return path.join(cwd, "knowledge", "project", "memory", "semantic.json");
  }

  private readStore(cwd: string): MemoryEntry[] {
    return readJsonFile<MemoryEntry[]>(this.storePath(cwd)) ?? [];
  }

  private writeStore(cwd: string, entries: MemoryEntry[]): void {
    writeJsonFile(this.storePath(cwd), entries);
  }

  /**
   * Index authoritative sources into the semantic store.
   * Merges with existing entries (updates by source_ref).
   */
  index(cwd: string): { added: number; updated: number; removed: number } {
    const existing = this.readStore(cwd);
    const bySource = new Map<string, MemoryEntry>();
    for (const e of existing) {
      bySource.set(e.source_ref, e);
    }

    let added = 0;
    let updated = 0;
    const now = new Date().toISOString();

    // Index rules
    const rulesDir = path.join(cwd, "knowledge", "project", "rules");
    if (fs.existsSync(rulesDir)) {
      const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const rule = readJsonFile<RuleJson>(path.join(rulesDir, file));
        if (!rule) continue;
        const sourceRef = `rule:${rule.id}`;
        const content: SemanticContent = {
          fact: `${rule.title}\n${rule.body}`,
          category: "rule",
          confidence: rule.status === "active" ? 1.0 : 0.6,
          domain: rule.category,
        };
        const entry = this.buildEntry(sourceRef, content, now, ["rule", rule.category]);
        if (bySource.has(sourceRef)) {
          updated++;
        } else {
          added++;
        }
        bySource.set(sourceRef, entry);
      }
    }

    // Index architecture components
    const archDir = path.join(cwd, "knowledge", "project", "architecture", "components");
    if (fs.existsSync(archDir)) {
      const files = fs.readdirSync(archDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const comp = readJsonFile<ArchitectureJson>(path.join(archDir, file));
        if (!comp) continue;
        const sourceRef = `architecture:${comp.id}`;
        const content: SemanticContent = {
          fact: `${comp.name} [${comp.layer}]\nResponsibilities:\n${comp.responsibilities.map((r) => `- ${r}`).join("\n")}`,
          category: "architecture",
          confidence: comp.status === "verified" ? 1.0 : 0.7,
          domain: comp.layer,
        };
        const entry = this.buildEntry(sourceRef, content, now, ["architecture", comp.layer]);
        if (bySource.has(sourceRef)) {
          updated++;
        } else {
          added++;
        }
        bySource.set(sourceRef, entry);
      }
    }

    // Index task invariants
    const tasksDir = path.join(cwd, "knowledge", "tasks");
    if (fs.existsSync(tasksDir)) {
      const taskDirs = fs
        .readdirSync(tasksDir)
        .filter((d) => d.startsWith("TASK-"))
        .filter((d) => fs.statSync(path.join(tasksDir, d)).isDirectory());

      for (const taskId of taskDirs) {
        const taskJson = readJsonFile<{ invariants?: InvariantJson[] }>(path.join(tasksDir, taskId, "task.json"));
        if (!taskJson?.invariants) continue;
        for (const inv of taskJson.invariants) {
          const sourceRef = `invariant:${taskId}:${inv.id}`;
          const content: SemanticContent = {
            fact: `${inv.id}: ${inv.text}\nMarker: ${inv.marker}`,
            category: "invariant",
            confidence: inv.status === "verified" ? 1.0 : 0.7,
            domain: taskId,
          };
          const entry = this.buildEntry(sourceRef, content, now, ["invariant", taskId]);
          if (bySource.has(sourceRef)) {
            updated++;
          } else {
            added++;
          }
          bySource.set(sourceRef, entry);
        }
      }
    }

    // Remove entries whose source no longer exists
    const currentSources = new Set(bySource.keys());
    const removed = existing.filter((e) => !currentSources.has(e.source_ref)).length;

    let entries = Array.from(bySource.values());
    entries = this.compact(entries);
    this.writeStore(cwd, entries);

    return { added, updated, removed };
  }

  private buildEntry(sourceRef: string, content: SemanticContent, now: string, tags: string[]): MemoryEntry {
    return {
      entry_id: `semantic-${sourceRef.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`,
      task_id: null,
      step_number: null,
      timestamp: now,
      track_type: "semantic",
      content,
      relevance_score: content.confidence ?? 0.8,
      source_ref: sourceRef,
      tags,
      created_at: now,
      updated_at: now,
      expires_at: null,
      access_count: 0,
      last_accessed_at: now,
    };
  }

  /**
   * Query semantic entries.
   */
  query(cwd: string, q: MemoryQuery): MemoryEntry[] {
    let entries = this.readStore(cwd);
    entries = applyFilters(entries, q, "semantic");
    entries.sort((a, b) => b.relevance_score - a.relevance_score || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (q.limit) {
      entries = entries.slice(0, q.limit);
    }

    updateAccessMeta(entries);
    this.batchWriter.markDirty(this.storePath(cwd));
    return entries;
  }

  /**
   * Add or update a single semantic entry.
   */
  update(cwd: string, entry: MemoryEntry): void {
    if (entry.track_type !== "semantic") {
      throw new Error(`SemanticStore only accepts track_type="semantic", got "${entry.track_type}"`);
    }
    const entries = this.readStore(cwd);
    const idx = entries.findIndex((e) => e.source_ref === entry.source_ref);
    const now = new Date().toISOString();
    const enriched: MemoryEntry = {
      ...entry,
      created_at: entry.created_at || now,
      updated_at: now,
      access_count: entry.access_count ?? 0,
      last_accessed_at: entry.last_accessed_at ?? now,
    };
    if (idx >= 0) {
      entries[idx] = enriched;
    } else {
      entries.push(enriched);
    }
    this.writeStore(cwd, this.compact(entries));
  }

  /**
   * Compact: remove low-relevance entries and enforce maxEntries limit.
   */
  compact(cwd: string): void {
    const entries = this.readStore(cwd);
    this.writeStore(cwd, this.compactEntries(entries));
  }

  private compactEntries(entries: MemoryEntry[]): MemoryEntry[] {
    let result = entries.filter((e) => e.relevance_score >= this.minRelevance);
    result.sort((a, b) => b.relevance_score - a.relevance_score);
    if (result.length > this.maxEntries) {
      result = result.slice(0, this.maxEntries);
    }
    return result;
  }

  /**
   * Statistics.
   */
  stats(cwd: string): TrackStats {
    const entries = this.readStore(cwd).filter((e) => e.track_type === "semantic");
    return {
      track_type: "semantic",
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
