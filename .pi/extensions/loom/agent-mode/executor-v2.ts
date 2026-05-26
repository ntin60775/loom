/**
 * Executor v2 — Integration Layer for Memory + Scout Retrieval
 *
 * Opt-in via use_memory_v2: true in execution-config.json
 * Backward compatible: v1 flow is default (use_memory_v2: false)
 *
 * Invariants:
 *   INV-3: v1 compatibility guaranteed
 *   INV-4: deterministic context assembly
 *   INV-7: cache scout results to avoid redundant spawns
 */

import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildMemoryContext } from "../memory";
import { ScoutRetrieval } from "../retrieval/scout-retrieval";
import type { Scope } from "../retrieval/scope-filter";
import type { SearchKnowledgeResponse } from "../retrieval/cache";
import { readJsonFile } from "../memory/utils";

export interface ExecutorV2Options {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
}

export class ExecutorV2 {
  private scoutRetrieval: ScoutRetrieval | null = null;
  private cwd: string;

  constructor(options: ExecutorV2Options) {
    this.cwd = options.ctx.cwd;
    this.scoutRetrieval = new ScoutRetrieval({
      cwd: this.cwd,
      cacheTtlMs: 3600000, // 1 hour
      scoutTimeoutMs: 60000, // 60 seconds
      defaultLimit: 10,
    });
  }

  /**
   * Assemble full context for a worker/reviewer spawn.
   * Combines memory context (from MemoryManager) + scout retrieval results.
   * Returns context string or null if v2 is disabled.
   */
  async assembleContext(taskId: string, stepDescription?: string): Promise<string | null> {
    // 1. Memory context from MemoryManager (session/episodic/semantic/procedural)
    const memoryContext = buildMemoryContext(this.cwd, taskId);

    // 2. Scout retrieval: search relevant knowledge from closed tasks
    let retrievalContext = "";
    if (this.scoutRetrieval && stepDescription) {
      try {
        const result = await this.scoutRetrieval.searchKnowledge(
          stepDescription,
          "project",
          5,
        );
        if (result.results.length > 0) {
          retrievalContext = this.formatRetrievalResults(result);
        }
      } catch (err) {
        // Non-fatal: if retrieval fails, continue with memory context only
        console.warn("[ExecutorV2] Scout retrieval failed:", err);
      }
    }

    // 3. Combine contexts
    const parts: string[] = [];
    if (memoryContext) {
      parts.push("--- Memory Context ---\n" + memoryContext);
    }
    if (retrievalContext) {
      parts.push("--- Relevant Knowledge ---\n" + retrievalContext);
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  }

  /**
   * Search knowledge on-demand with explicit query.
   */
  async searchKnowledge(query: string, scope: Scope = "project", limit?: number): Promise<SearchKnowledgeResponse> {
    if (!this.scoutRetrieval) {
      throw new Error("ExecutorV2 not initialized with scout retrieval");
    }
    return this.scoutRetrieval.searchKnowledge(query, scope, limit);
  }

  private formatRetrievalResults(result: SearchKnowledgeResponse): string {
    const lines: string[] = [
      `Query: "${result.query}" | Scope: ${result.scope} | Cached: ${result.cached}`,
      "",
    ];
    for (const r of result.results) {
      lines.push(`[${r.rank}] ${r.source_path} (score: ${r.relevance_score.toFixed(2)})`);
      lines.push(`    Excerpt: ${r.excerpt}`);
      lines.push(`    Reason: ${r.reasoning}`);
      lines.push("");
    }
    return lines.join("\n");
  }
}

/**
 * Check if v2 is enabled in execution config.
 */
export function isV2Enabled(cwd: string): boolean {
  try {
    const configPath = path.join(cwd, "knowledge", "project", "configs", "execution-config.json");
    const config = readJsonFile<Record<string, unknown>>(configPath);
    return config?.use_memory_v2 === true;
  } catch {
    return false;
  }
}
