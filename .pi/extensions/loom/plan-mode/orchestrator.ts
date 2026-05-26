/**
 * Plan Mode Orchestrator — task planning with optional retrieval enrichment
 *
 * When use_memory_v2 is enabled, the orchestrator searches relevant
 * knowledge from closed tasks before planning to enrich context.
 *
 * Invariants:
 *   INV-3: v1 compatibility — orchestrator works without retrieval
 *   INV-4: deterministic context
 */

import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readJson } from "../knowledge/io";
import { registerPlanTools } from "./tools";

/**
 * Enrich plan context with retrieval results if v2 is enabled.
 * Called before entering plan mode with a description.
 * Returns retrieval context string or empty string if v2 is disabled.
 */
export async function enrichPlanContext(cwd: string, description: string): Promise<string> {
  try {
    const execConfig = readJson<Record<string, unknown>>(
      path.join(cwd, "knowledge", "project", "configs", "execution-config.json")
    );
    if (!execConfig || execConfig.use_memory_v2 !== true) {
      return ""; // v1: no retrieval enrichment
    }

    const { ScoutRetrieval } = await import("../retrieval/scout-retrieval");
    const retrieval = new ScoutRetrieval({ cwd });
    const result = await retrieval.searchKnowledge(description, "project", 5);

    if (result.results.length === 0) {
      return "";
    }

    const lines: string[] = ["--- Relevant Knowledge from Previous Tasks ---"];
    for (const r of result.results) {
      lines.push(`[${r.rank}] ${r.source_path} (score: ${r.relevance_score.toFixed(2)})`);
      lines.push(`    Excerpt: ${r.excerpt}`);
      lines.push(`    Reason: ${r.reasoning}`);
    }
    lines.push("--- End Relevant Knowledge ---");
    return lines.join("\n");
  } catch {
    // Non-fatal: if retrieval fails, continue without enrichment
    return "";
  }
}

export function registerPlanMode(pi: ExtensionAPI): void {
  registerPlanTools(pi);
}
