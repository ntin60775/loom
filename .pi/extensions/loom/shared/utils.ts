/**
 * Shared Utilities — prompt loading, output extraction, path resolution
 *
 * Used by: index.ts, agent-mode/tools.ts, subagent/spawner.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Resolve the extension root directory (where index.ts lives).
 * Handles CJS (__dirname), ESM (import.meta.dirname), and jiti transforms.
 */
export function resolveExtensionRoot(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  if (typeof import.meta !== "undefined" && import.meta.dirname) return import.meta.dirname;
  return process.cwd();
}

/**
 * Load a prompt file relative to the extension root.
 * @param relativePath — path relative to extension root, e.g. "prompts/plan-orchestrator" or "subagent/prompts/worker"
 */
export function loadPrompt(relativePath: string): string {
  const baseDir = resolveExtensionRoot();
  const fullPath = path.join(baseDir, `${relativePath}.md`);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return `[LOAD ERROR: Prompt ${relativePath} not found at ${fullPath}]`;
  }
}

/**
 * Extract final assistant text from a subagent result's messages array.
 */
export function getFinalOutput(messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text" && part.text) return part.text;
      }
    }
  }
  return "";
}
