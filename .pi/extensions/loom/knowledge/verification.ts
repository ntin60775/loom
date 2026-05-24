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
  status: "verified" | "defined" | "failed" | "unknown" | "needs_audit";
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
    needs_audit: number;
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
      // Heuristic:
      // - verified  → stays verified
      // - failed    → stays failed
      // - defined   → stays defined if task in progress;
      //               becomes needs_audit if task completed (audit required, not a failure)
      let status: VerificationEntry["status"] = "unknown";
      if (inv.status === "verified") {
        status = "verified";
      } else if (inv.status === "failed") {
        status = "failed";
      } else if (inv.status === "defined") {
        status = task.status === "completed" && allStepsDone ? "needs_audit" : "defined";
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
    needs_audit: entries.filter((e) => e.status === "needs_audit").length,
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
