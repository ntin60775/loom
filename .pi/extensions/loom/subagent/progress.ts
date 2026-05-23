/**
 * Subagent Progress — polling progress.json for long-running subagents
 *
 * Stub: JSON mode streaming via stdout covers most cases.
 * progress.json polling reserved for tmux-based detached sessions.
 */

export interface ProgressSnapshot {
  status: "running" | "completed" | "error" | "aborted";
  step?: string;
  percent?: number;
  outputArtifact?: string;
  summary?: string;
  timestamp: string;
}

export async function readProgress(progressPath: string): Promise<ProgressSnapshot | null> {
  try {
    const fs = await import("node:fs");
    const data = fs.readFileSync(progressPath, "utf-8");
    return JSON.parse(data) as ProgressSnapshot;
  } catch {
    return null;
  }
}

export async function writeProgress(progressPath: string, snapshot: ProgressSnapshot): Promise<void> {
  const fs = await import("node:fs");
  const dir = (await import("node:path")).dirname(progressPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(snapshot, null, 2), "utf-8");
}
