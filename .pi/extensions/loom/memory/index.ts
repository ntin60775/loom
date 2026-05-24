/**
 * Memory Layer — unified exports for loom v2
 *
 * Provides: MemoryManager, ContextAssembler, all stores, types.
 */

import * as path from "node:path";
import { readJsonFile } from "./utils";
import { MemoryManager } from "./manager";
import { ContextAssembler } from "./context-assembler";

export * from "./types";
export * from "./session-track";
export * from "./episodic-store";
export * from "./semantic-store";
export * from "./procedural-store";
export * from "./manager";
export * from "./context-assembler";

const managerCache = new Map<string, MemoryManager>();

function getExecutionConfig(cwd: string): Record<string, unknown> | null {
  return readJsonFile<Record<string, unknown>>(path.join(cwd, "knowledge", "project", "configs", "execution-config.json"));
}

/**
 * Build memory context for a task if use_memory_v2 is enabled.
 * Returns null if v2 is disabled or config is missing.
 */
export function buildMemoryContext(cwd: string, taskId: string): string | null {
  const config = getExecutionConfig(cwd);
  if (!config || config.use_memory_v2 !== true) {
    return null;
  }

  let manager = managerCache.get(cwd);
  if (!manager) {
    const memConfig = (config.memory as Record<string, unknown>) ?? {};
    const weights = (memConfig.relevance_weights as Record<string, number>) ?? {};
    const retention = (memConfig.retention as Record<string, unknown>) ?? {};

    manager = new MemoryManager({
      cwd,
      relevanceWeights: {
        freshness: weights.freshness ?? 0.4,
        frequency: weights.frequency ?? 0.3,
        explicitRating: weights.explicit_rating ?? 0.3,
      },
      retentionPolicy: {
        max_entries_session: (retention.max_entries_session as number) ?? 1000,
        max_entries_episodic: (retention.max_entries_episodic as number) ?? 500,
        max_entries_semantic: (retention.max_entries_semantic as number) ?? 2000,
        max_entries_procedural: (retention.max_entries_procedural as number) ?? 500,
        max_age_days: (retention.max_age_days as number) ?? 90,
        min_relevance: (retention.min_relevance as number) ?? 0.1,
      },
    });

    // Index semantic store on first use
    manager.indexSemantic();
    managerCache.set(cwd, manager);
  }

  const tokenBudget = (config.memory as Record<string, unknown>)?.token_budget as number ?? 4000;
  const assembler = new ContextAssembler({ tokenBudget });
  const assembled = assembler.assemble(manager, taskId);

  return assembled.text || null;
}

/**
 * Clear cached MemoryManager for a cwd (e.g., on session end).
 */
export function clearMemoryCache(cwd: string): void {
  const manager = managerCache.get(cwd);
  if (manager) {
    manager.clearSession();
    managerCache.delete(cwd);
  }
}
