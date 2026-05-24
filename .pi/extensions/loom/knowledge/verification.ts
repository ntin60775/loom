/**
 * Verification Matrix — track invariant status across all delivery units
 *
 * Invariants: INV-1, INV-12
 */

import * as path from "node:path";
import { readJson, writeJson } from "./io";

export interface VerificationEntry {
  invariant_id: string;
  text: string;
  task_id: string;
  delivery_unit: string;
  status: "verified" | "defined" | "failed" | "unknown";
  evidence?: string;
  checked_at: string;
}

export interface VerificationMatrix {
  schema_version: string;
  generated_at: string;
  entries: VerificationEntry[];
  summary: {
    total: number;
    verified: number;
    defined: number;
    failed: number;
    unknown: number;
  };
}

function taskDir(cwd: string, taskId: string): string {
  return path.join(cwd, "knowledge", "tasks", taskId);
}

function readTaskJson(cwd: string, taskId: string): Record<string, unknown> | null {
  return readJson<Record<string, unknown>>(path.join(taskDir(cwd, taskId), "task.json"));
}

function readPlanJson(cwd: string, taskId: string): { steps?: { status: string }[] } | null {
  return readJson<{ steps?: { status: string }[] }>(path.join(taskDir(cwd, taskId), "plan.json"));
}

/**
 * Generate verification matrix from all tasks in registry.
 * Reads every task.json, collects invariants, and cross-checks with plan completion.
 */
export function generateVerificationMatrix(cwd: string): VerificationMatrix {
  const registry = readJson<{ tasks?: Array<{ task_id: string; status: string; parent_delivery_unit?: string }> }>(
    path.join(cwd, "knowledge", "tasks", "registry.json")
  );

  const entries: VerificationEntry[] = [];
  const now = new Date().toISOString().split("T")[0];

  for (const task of registry?.tasks ?? []) {
    const taskJson = readTaskJson(cwd, task.task_id);
    if (!taskJson) continue;

    const invariants = (taskJson.invariants as Array<{ id: string; text: string; status: string; verification_method?: string }>) ?? [];
    const plan = readPlanJson(cwd, task.task_id);
    const allStepsDone = plan?.steps?.every((s) => s.status === "done") ?? true;

    for (const inv of invariants) {
      // Heuristic: if task is completed and all steps done, mark as verified if task says so
      // otherwise preserve the task.json status
      let status: VerificationEntry["status"] = "unknown";
      if (inv.status === "verified") {
        status = "verified";
      } else if (inv.status === "defined") {
        status = task.status === "completed" && allStepsDone ? "failed" : "defined";
      } else if (inv.status === "failed") {
        status = "failed";
      }

      entries.push({
        invariant_id: inv.id,
        text: inv.text,
        task_id: task.task_id,
        delivery_unit: task.parent_delivery_unit ?? "unknown",
        status,
        evidence: inv.verification_method,
        checked_at: now,
      });
    }
  }

  const summary = {
    total: entries.length,
    verified: entries.filter((e) => e.status === "verified").length,
    defined: entries.filter((e) => e.status === "defined").length,
    failed: entries.filter((e) => e.status === "failed").length,
    unknown: entries.filter((e) => e.status === "unknown").length,
  };

  const matrix: VerificationMatrix = {
    schema_version: "1.0.0",
    generated_at: now,
    entries,
    summary,
  };

  const matrixPath = path.join(cwd, "knowledge", "project", "artifacts", "verification-matrix.json");
  writeJson(matrixPath, matrix);

  return matrix;
}
