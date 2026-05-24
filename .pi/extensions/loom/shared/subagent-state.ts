/**
 * Shared subagent state — INV-11: track active workers/reviewers for TUI
 *
 * Invariant: read-only for UI; mutations only from spawner lifecycle
 */

export interface SubagentRecord {
  id: string;
  name: string;
  type: "worker" | "reviewer";
  status: "running" | "completed" | "error" | "aborted";
  model?: string;
  step?: number;
  taskId?: string;
  startTime: number;
}

const activeSubagents = new Map<string, SubagentRecord>();

export function registerSubagent(id: string, record: Omit<SubagentRecord, "startTime">): void {
  activeSubagents.set(id, { ...record, startTime: Date.now() });
}

export function updateSubagentStatus(id: string, status: SubagentRecord["status"]): void {
  const s = activeSubagents.get(id);
  if (s) s.status = status;
}

export function removeSubagent(id: string): void {
  activeSubagents.delete(id);
}

export function getActiveSubagents(): SubagentRecord[] {
  return Array.from(activeSubagents.values());
}

export function killSubagent(id: string): boolean {
  const s = activeSubagents.get(id);
  if (!s) return false;
  s.status = "aborted";
  return true;
}
