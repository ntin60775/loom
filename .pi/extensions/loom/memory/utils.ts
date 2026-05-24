/**
 * Memory Layer IO Utilities — thin JSON helpers
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ReadJsonError {
  exists: boolean;
  parseError: boolean;
  message?: string;
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Read JSON with diagnostic info.
 * Returns [data, error] tuple where error is null on success.
 * Distinguishes: file not found (expected first-use), parse error (data corruption).
 */
export function readJsonFileDiagnostic<T>(filePath: string): [T | null, ReadJsonError | null] {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    try {
      return [JSON.parse(data) as T, null];
    } catch (parseErr: unknown) {
      return [null, { exists: true, parseError: true, message: (parseErr as Error).message }];
    }
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return [null, { exists: false, parseError: false }];
    }
    return [null, { exists: true, parseError: false, message: nodeErr.message }];
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
