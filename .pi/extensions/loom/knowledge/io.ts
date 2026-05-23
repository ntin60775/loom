import * as fs from "node:fs";
import * as path from "node:path";
import {
  validateTaskShape,
  validatePlanShape,
  validateRegistryShape,
  validateReviewShape,
} from "./schemas";
import type {
  TaskData,
  PlanData,
  RegistryData,
  ReviewData,
  ExecutionConfigData,
  SubagentConfigData,
} from "./types";

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

// ── Typed wrappers (with runtime validation) ─────────────────────────────

export function readTask(taskDir: string): TaskData | null {
  return readJson<TaskData>(path.join(taskDir, "task.json"), validateTaskShape);
}

export function readPlan(taskDir: string): PlanData | null {
  return readJson<PlanData>(path.join(taskDir, "plan.json"), validatePlanShape);
}

export function readRegistryFile(knowledgeRoot: string): RegistryData | null {
  return readJson<RegistryData>(path.join(knowledgeRoot, "tasks", "registry.json"), validateRegistryShape);
}

export function readReview(reviewPath: string): ReviewData | null {
  return readJson<ReviewData>(reviewPath, validateReviewShape);
}

export function readSubagentConfig(configPath: string): SubagentConfigData | null {
  return readJson<SubagentConfigData>(configPath);
}

export function readExecutionConfig(configPath: string): ExecutionConfigData | null {
  return readJson<ExecutionConfigData>(configPath);
}
