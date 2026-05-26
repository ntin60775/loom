/**
 * Subagent Progress — polling progress.json for long-running subagents
 *
 * Stub: JSON mode streaming via stdout covers most cases.
 * progress.json polling reserved for tmux-based detached sessions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../shared/logger";

export interface ProgressSnapshot {
  status: "running" | "completed" | "error" | "aborted";
  step?: string;
  percent?: number;
  outputArtifact?: string;
  summary?: string;
  timestamp: string;
}

export function readProgress(progressPath: string): ProgressSnapshot | null {
  try {
    const data = fs.readFileSync(progressPath, "utf-8");
    return JSON.parse(data) as ProgressSnapshot;
  } catch (err) {
    logger.debug("progress", `Failed to read progress ${progressPath}`, err);
    return null;
  }
}

export function writeProgress(progressPath: string, snapshot: ProgressSnapshot): void {
  const dir = path.dirname(progressPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(snapshot, null, 2), "utf-8");
}
