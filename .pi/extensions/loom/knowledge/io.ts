import * as fs from "node:fs";
import * as path from "node:path";

export function readJson<T>(filePath: string, validator?: (data: unknown) => string | null): T | null {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data) as T;
    if (validator) {
      const error = validator(parsed);
      if (error) {
        console.error(`[loom] Validation error in ${filePath}: ${error}`);
        return null;
      }
    }
    return parsed;
  } catch (err) {
    console.error(`[loom] Failed to read ${filePath}:`, err);
    return null;
  }
}

export function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function findKnowledgeRoot(cwd: string): string | null {
  const knowledgePath = path.join(cwd, "knowledge");
  if (fs.existsSync(knowledgePath)) return knowledgePath;
  return null;
}
