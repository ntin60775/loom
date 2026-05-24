/**
 * Memory Manager — orchestrator for 4 memory tracks
 *
 * Responsibilities:
 *   - Retention policy enforcement (max_entries, max_age, min_relevance)
 *   - Relevance scoring (freshness + frequency + explicit rating)
 *   - Summarization / compaction triggers
 *   - Unified API for all tracks
 *
 * INV-1: Memory layer actively manages context.
 * INV-6: Token budget respected (enforced at ContextAssembler level).
 */

import type { MemoryEntry, MemoryQuery, TrackType } from "./types";
import { SessionTrack } from "./session-track";
import { EpisodicStore } from "./episodic-store";
import { SemanticStore } from "./semantic-store";
import { ProceduralStore } from "./procedural-store";

export interface RelevanceWeights {
  freshness: number;
  frequency: number;
  explicitRating: number;
}

export interface RetentionPolicy {
  max_entries_session?: number;
  max_entries_episodic?: number;
  max_entries_semantic?: number;
  max_entries_procedural?: number;
  max_age_days?: number;
  min_relevance?: number;
}

export interface MemoryManagerOptions {
  cwd: string;
  relevanceWeights?: RelevanceWeights;
  retentionPolicy?: RetentionPolicy;
}

export interface MemoryManagerStats {
  session: { total_entries: number; total_relevance: number };
  episodic: { total_entries: number; total_relevance: number };
  semantic: { total_entries: number; total_relevance: number };
  procedural: { total_entries: number; total_relevance: number };
}

export class MemoryManager {
  readonly session: SessionTrack;
  readonly episodic: EpisodicStore;
  readonly semantic: SemanticStore;
  readonly procedural: ProceduralStore;

  private readonly cwd: string;
  private readonly weights: RelevanceWeights;
  private readonly policy: RetentionPolicy;

  constructor(options: MemoryManagerOptions) {
    this.cwd = options.cwd;
    this.weights = options.relevanceWeights ?? {
      freshness: 0.4,
      frequency: 0.3,
      explicitRating: 0.3,
    };
    this.policy = options.retentionPolicy ?? {
      max_entries_session: 1000,
      max_entries_episodic: 500,
      max_entries_semantic: 2000,
      max_entries_procedural: 500,
      max_age_days: 90,
      min_relevance: 0.1,
    };

    this.session = new SessionTrack({
      maxEntries: this.policy.max_entries_session,
    });
    this.episodic = new EpisodicStore({
      maxEntriesPerTask: this.policy.max_entries_episodic,
      minRelevance: this.policy.min_relevance,
    });
    this.semantic = new SemanticStore({
      maxEntries: this.policy.max_entries_semantic,
      minRelevance: this.policy.min_relevance,
    });
    this.procedural = new ProceduralStore({
      maxEntries: this.policy.max_entries_procedural,
      minRelevance: this.policy.min_relevance,
    });
  }

  /**
   * Append an entry to the appropriate track.
   */
  append(entry: MemoryEntry): void {
    switch (entry.track_type) {
      case "session":
        this.session.append(entry);
        break;
      case "episodic":
        this.episodic.record(this.cwd, entry);
        break;
      case "semantic":
        this.semantic.update(this.cwd, entry);
        break;
      case "procedural":
        this.procedural.learn(this.cwd, entry);
        break;
      default:
        throw new Error(`Unknown track_type: ${(entry as any).track_type}`);
    }
  }

  /**
   * Query a specific track.
   */
  query(track: TrackType, q: MemoryQuery): MemoryEntry[] {
    switch (track) {
      case "session":
        return this.session.query(q);
      case "episodic":
        return this.episodic.query(this.cwd, q);
      case "semantic":
        return this.semantic.query(this.cwd, q);
      case "procedural":
        return this.procedural.query(this.cwd, q);
      default:
        throw new Error(`Unknown track_type: ${track}`);
    }
  }

  /**
   * Recompute relevance scores for all entries in a track.
   * This mutates entries in-place (for file-backed stores, persists).
   */
  recomputeRelevance(track: TrackType): void {
    const now = Date.now();
    const maxAgeMs = (this.policy.max_age_days ?? 90) * 24 * 60 * 60 * 1000;

    const compute = (entry: MemoryEntry): number => {
      const lastAccessed = entry.last_accessed_at ? new Date(entry.last_accessed_at).getTime() : new Date(entry.created_at).getTime();
      const age = now - lastAccessed;
      const freshness = Math.exp(-(age / maxAgeMs));
      const freq = Math.min(entry.access_count / 10, 1); // normalize at 10 accesses
      const explicit = entry.relevance_score; // current score treated as operator rating baseline
      return (
        this.weights.freshness * freshness +
        this.weights.frequency * freq +
        this.weights.explicitRating * explicit
      );
    };

    switch (track) {
      case "session": {
        for (const entry of this.session.getContext()) {
          entry.relevance_score = compute(entry);
        }
        break;
      }
      case "episodic": {
        // Episodic entries are per-task; we iterate all task files
        // This is a simplified approach: recompute on next query/compact cycle
        break;
      }
      case "semantic": {
        // Semantic entries updated on next index/compact cycle
        break;
      }
      case "procedural": {
        // Procedural entries updated on next query/compact cycle
        break;
      }
    }
  }

  /**
   * Run retention policy across all tracks.
   * - Evict expired / over-limit session entries
   * - Compact episodic, semantic, procedural stores
   */
  enforceRetention(): void {
    this.session.evict();
    // For file-backed stores, compaction is lazy or triggered here
    // We trigger compact for all known tasks in episodic
    // (Simplified: we only compact when we know task IDs)
    // Semantic and procedural compacted unconditionally
    this.semantic.compact(this.cwd);
    this.procedural.compact(this.cwd);
  }

  /**
   * Trigger compaction for a specific task's episodic store.
   */
  compactEpisodic(taskId: string): void {
    this.episodic.compactTask(this.cwd, taskId);
  }

  /**
   * Summarize a task's episodic store.
   */
  summarizeEpisodic(taskId: string, topN?: number): MemoryEntry {
    return this.episodic.summarize(this.cwd, taskId, topN);
  }

  /**
   * Index semantic store from authoritative sources.
   */
  indexSemantic(): { added: number; updated: number; removed: number } {
    return this.semantic.index(this.cwd);
  }

  /**
   * Seed procedural store from completed tasks.
   */
  seedProcedural(): { seeded: number } {
    return this.procedural.seedFromTasks(this.cwd);
  }

  /**
   * Statistics across all tracks.
   */
  stats(): MemoryManagerStats {
    const sessionStats = this.session.stats();
    // Episodic stats are per-task; we return a global aggregate
    const tasksDir = require("node:path").join(this.cwd, "knowledge", "tasks");
    let episodicTotal = 0;
    let episodicRelevance = 0;
    try {
      const taskIds = require("node:fs")
        .readdirSync(tasksDir)
        .filter((d: string) => d.startsWith("TASK-"))
        .filter((d: string) => require("node:fs").statSync(require("node:path").join(tasksDir, d)).isDirectory());
      for (const taskId of taskIds) {
        const s = this.episodic.stats(this.cwd, taskId);
        episodicTotal += s.total_entries;
        episodicRelevance += s.total_relevance;
      }
    } catch {
      // ignore
    }

    const semanticStats = this.semantic.stats(this.cwd);
    const proceduralStats = this.procedural.stats(this.cwd);

    return {
      session: {
        total_entries: sessionStats.total_entries,
        total_relevance: sessionStats.total_relevance,
      },
      episodic: {
        total_entries: episodicTotal,
        total_relevance: episodicRelevance,
      },
      semantic: {
        total_entries: semanticStats.total_entries,
        total_relevance: semanticStats.total_relevance,
      },
      procedural: {
        total_entries: proceduralStats.total_entries,
        total_relevance: proceduralStats.total_relevance,
      },
    };
  }

  /**
   * Clear session track (e.g., on mode switch or session end).
   */
  clearSession(): void {
    this.session.clear();
  }
}
