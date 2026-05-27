/**
 * Persistent Subagent Registry — tracks subagent lifecycle across sessions
 *
 * Complements the in-memory subagent-state.ts with persistent storage
 * in knowledge/project/subagents/registry.json.
 *
 * Invariant: INV-10 (no hardcoded model strings)
 */

import * as path from "node:path";
import { readJson, writeJson } from "../knowledge/io";
import { logger } from "../shared/logger";

export interface PersistentSubagentEntry {
  id: string;
  name: string;
  type: "worker" | "reviewer" | "scout" | "researcher" | "migrator";
  task_id: string;
  step_number?: number;
  model?: string;
  status: "running" | "completed" | "error" | "aborted";
  spawned_at: string;
  completed_at?: string;
  exit_code?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  commit_hash?: string;
}

export interface PersistentSubagentRegistry {
  schema_version: string;
  subagents: PersistentSubagentEntry[];
  stats: {
    total_spawned: number;
    total_completed: number;
    total_failed: number;
    total_aborted: number;
  };
}

function getRegistryPath(cwd: string): string {
  return path.join(cwd, "knowledge", "project", "subagents", "registry.json");
}

export function readPersistentRegistry(cwd: string): PersistentSubagentRegistry {
  const registryPath = getRegistryPath(cwd);
  const data = readJson<PersistentSubagentRegistry>(registryPath);
  if (data && data.subagents && data.stats) return data;

  return {
    schema_version: "1.0.0",
    subagents: [],
    stats: { total_spawned: 0, total_completed: 0, total_failed: 0, total_aborted: 0 },
  };
}

export function writePersistentRegistry(cwd: string, registry: PersistentSubagentRegistry): void {
  const registryPath = getRegistryPath(cwd);
  writeJson(registryPath, registry);
}

export function registerPersistentSubagent(
  cwd: string,
  entry: Omit<PersistentSubagentEntry, "spawned_at">,
): void {
  const registry = readPersistentRegistry(cwd);
  const now = new Date().toISOString();

  const fullEntry: PersistentSubagentEntry = {
    ...entry,
    spawned_at: now,
  };

  // Deduplicate by ID
  const existingIdx = registry.subagents.findIndex((s) => s.id === entry.id);
  if (existingIdx >= 0) {
    registry.subagents[existingIdx] = fullEntry;
  } else {
    registry.subagents.push(fullEntry);
  }

  registry.stats.total_spawned++;
  writePersistentRegistry(cwd, registry);
  logger.info("persistent-registry", `Registered subagent: ${entry.id} (${entry.type})`);
}

export function updatePersistentSubagent(
  cwd: string,
  id: string,
  update: Partial<Pick<PersistentSubagentEntry, "status" | "exit_code" | "usage" | "commit_hash" | "completed_at">>,
): void {
  const registry = readPersistentRegistry(cwd);
  const entry = registry.subagents.find((s) => s.id === id);
  if (!entry) {
    logger.warn("persistent-registry", `Subagent not found: ${id}`);
    return;
  }

  const prevStatus = entry.status;

  if (update.status) entry.status = update.status;
  if (update.exit_code !== undefined) entry.exit_code = update.exit_code;
  if (update.usage) entry.usage = update.usage;
  if (update.commit_hash) entry.commit_hash = update.commit_hash;
  if (update.completed_at) entry.completed_at = update.completed_at;
  else if (update.status && update.status !== "running") {
    entry.completed_at = new Date().toISOString();
  }

  // Update stats
  if (prevStatus === "running" && update.status) {
    switch (update.status) {
      case "completed":
        registry.stats.total_completed++;
        break;
      case "error":
        registry.stats.total_failed++;
        break;
      case "aborted":
        registry.stats.total_aborted++;
        break;
    }
  }

  writePersistentRegistry(cwd, registry);
  logger.info("persistent-registry", `Updated subagent ${id}: ${prevStatus} → ${entry.status}`);
}

/**
 * Query subagents by task ID.
 */
export function getSubagentsByTask(cwd: string, taskId: string): PersistentSubagentEntry[] {
  const registry = readPersistentRegistry(cwd);
  return registry.subagents.filter((s) => s.task_id === taskId);
}

/**
 * Get recent subagents (last N).
 */
export function getRecentSubagents(cwd: string, limit = 10): PersistentSubagentEntry[] {
  const registry = readPersistentRegistry(cwd);
  return registry.subagents
    .slice()
    .sort((a, b) => b.spawned_at.localeCompare(a.spawned_at))
    .slice(0, limit);
}
