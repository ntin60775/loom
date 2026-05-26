/**
 * Context Provider — unified v2 context assembly for Plan and Agent Mode
 *
 * Single entry point for all v2 features:
 *   1. Memory context from 4 tracks (MemoryManager)
 *   2. Scout retrieval from project knowledge (ScoutRetrieval)
 *
 * Replaces duplicated v2 logic in tools.ts, orchestrator.ts, executor-v2.ts.
 *
 * Invariants:
 *   INV-3: v1 compat — returns empty when use_memory_v2: false
 *   INV-4: deterministic context — file-based, no hidden state
 */

import * as path from "node:path";
import { readJson } from "../knowledge/io";
import { buildMemoryContext } from "../memory";
import { ScoutRetrieval } from "../retrieval/scout-retrieval";
import type { Scope } from "../retrieval/scope-filter";
import { logger } from "./logger";

export interface V2ContextResult {
  memoryContext: string;
  retrievalContext: string;
  combined: string;
  /** true если v2 отключён в конфиге */
  disabled: boolean;
}

/**
 * Assemble full v2 context for a worker/reviewer spawn.
 * Returns empty result if use_memory_v2 is false or missing.
 *
 * @param cwd          — project root directory
 * @param taskId       — task identifier for memory scoping
 * @param searchQuery  — optional query for scout retrieval (e.g., step description)
 * @param searchScope  — search scope (default: "project")
 * @param searchLimit  — max results (default: 5)
 */
export async function assembleV2Context(
  cwd: string,
  taskId: string,
  searchQuery?: string,
  searchScope: Scope = "project",
  searchLimit = 5,
): Promise<V2ContextResult> {
  const result: V2ContextResult = {
    memoryContext: "",
    retrievalContext: "",
    combined: "",
    disabled: true,
  };

  // Check if v2 is enabled
  const execConfigPath = path.join(cwd, "knowledge", "project", "configs", "execution-config.json");
  const execConfig = readJson<Record<string, unknown>>(execConfigPath);
  if (!execConfig || execConfig.use_memory_v2 !== true) {
    return result;
  }

  result.disabled = false;

  // 1. Memory context
  try {
    const assembled = buildMemoryContext(cwd, taskId);
    if (assembled) {
      result.memoryContext = assembled;
    }
  } catch (err) {
    logger.debug("context-provider", "Memory context assembly failed", err);
  }

  // 2. Scout retrieval
  if (searchQuery && searchQuery.trim()) {
    try {
      const retrieval = new ScoutRetrieval({ cwd });
      const searchResult = await retrieval.searchKnowledge(searchQuery, searchScope, searchLimit);
      if (searchResult.results.length > 0) {
        const lines: string[] = [];
        for (const r of searchResult.results) {
          lines.push(`[${r.rank}] ${r.source_path} (score: ${r.relevance_score.toFixed(2)})`);
          lines.push(`    ${r.excerpt}`);
        }
        result.retrievalContext = lines.join("\n");
      }
    } catch (err) {
      logger.warn("context-provider", "Scout retrieval failed", err);
    }
  }

  // 3. Combine
  const parts: string[] = [];
  if (result.memoryContext) {
    parts.push(`--- Memory Context ---\n${result.memoryContext}\n--- End Memory Context ---`);
  }
  if (result.retrievalContext) {
    parts.push(`--- Relevant Knowledge ---\n${result.retrievalContext}\n--- End Relevant Knowledge ---`);
  }
  result.combined = parts.join("\n\n");

  return result;
}
