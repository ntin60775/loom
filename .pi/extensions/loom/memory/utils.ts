/**
 * Memory Layer IO Utilities — thin JSON helpers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../shared/logger";

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch (err) {
    logger.debug("memory-utils", `Failed to read ${filePath}`, err);
    return null;
  }
}

export function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
