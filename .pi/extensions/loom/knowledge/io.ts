import * as fs from "node:fs";
import * as path from "node:path";

export function readJson<T>(filePath: string): T | null {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
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
