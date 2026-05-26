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
import { assembleV2Context } from "../shared/context-provider";
import { logger } from "../shared/logger";

/**
 * Enrich plan context with retrieval results if v2 is enabled.
 * Called before entering plan mode with a description.
 * Returns retrieval context string or empty string if v2 is disabled.
 */
export async function enrichPlanContext(cwd: string, description: string): Promise<string> {
  try {
    const result = await assembleV2Context(cwd, "plan", description, "project", 5);
    if (result.disabled || result.retrievalContext.length === 0) {
      return "";
    }

    const lines: string[] = ["--- Relevant Knowledge from Previous Tasks ---"];
    lines.push(result.retrievalContext);
    lines.push("--- End Relevant Knowledge ---");
    return lines.join("\n");
  } catch (err) {
    logger.debug("orchestrator", `Retrieval enrichment failed for query "${description}"`, err);
    return "";
  }
}

export function registerPlanMode(pi: ExtensionAPI): void {
  registerPlanTools(pi);
}
