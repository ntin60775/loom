/**
 * Audit Logger — records all project-level mutations
 *
 * Logs: rule add/update, architecture component add/update,
 * execution config changes, task status transitions.
 *
 * File: knowledge/project/artifacts/audit-log.json
 * INV-12: code comments in English
 */

import * as path from "node:path";
import { readJson, writeJson } from "./io";
import { logger } from "../shared/logger";

export interface AuditEntry {
  timestamp: string;  // ISO 8601
  action: "rule_add" | "rule_update" | "arch_component_add" | "arch_component_update" | "config_update" | "task_status";
  target_id: string;
  target_type: "rule" | "architecture-component" | "config" | "task";
  detail?: string;
  operator: string;   // "agent" or "operator"
}

function auditFilePath(cwd: string): string {
  return path.join(cwd, "knowledge", "project", "artifacts", "audit-log.json");
}

export function appendAuditEntry(cwd: string, entry: Omit<AuditEntry, "timestamp">): void {
  try {
    const filePath = auditFilePath(cwd);
    const entries = readJson<AuditEntry[]>(filePath) ?? [];
    entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    writeJson(filePath, entries);
  } catch (err) {
    logger.warn("audit", `Failed to write audit entry for ${entry.action}:${entry.target_id}`, err);
  }
}

export function readAuditLog(cwd: string): AuditEntry[] {
  const filePath = auditFilePath(cwd);
  return readJson<AuditEntry[]>(filePath) ?? [];
}

export function getRecentAuditEntries(cwd: string, limit = 20): AuditEntry[] {
  const entries = readAuditLog(cwd);
  return entries.slice(-limit).reverse();
}
