/**
 * Memory Layer IO Utilities — delegates to knowledge/io.ts
 *
 * Provides backward-compatible aliases for memory modules.
 * Re-exports from knowledge/io.ts to eliminate code duplication (M1 fix).
 *
 * INV-12: code comments in English
 */

import { readJson, writeJson } from "../knowledge/io";
import * as fs from "node:fs";

/**
 * Read JSON file without schema validation.
 * Delegates to knowledge/io.ts readJson.
 */
export function readJsonFile<T>(filePath: string): T | null {
  return readJson<T>(filePath);
}

/**
 * Write JSON file with directory auto-creation.
 * Delegates to knowledge/io.ts writeJson.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  writeJson(filePath, data);
}

/**
 * Ensure a directory exists (create if missing).
 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
