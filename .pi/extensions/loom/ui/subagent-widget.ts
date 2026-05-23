/**
 * Subagent Widget (Phase 2) — list running subagents, status, models
 *
 * Invariant: INV-5 (read-only TUI)
 * TODO: Integrate into index.ts to display active subagents during executor loop.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface SubagentInfo {
  name: string;
  status: "running" | "completed" | "error" | "aborted";
  model?: string;
  step?: number;
  taskId?: string;
}

export function updateSubagentWidget(ctx: ExtensionContext, subagents: SubagentInfo[]): void {
  if (subagents.length === 0) {
    ctx.ui.setWidget("loom-subagents", undefined);
    return;
  }

  const lines = ["🤖 Субагенты:"];
  for (const s of subagents) {
    const icon = s.status === "running" ? "⏳" : s.status === "completed" ? "✓" : "✗";
    lines.push(`  ${icon} ${s.name}${s.model ? ` [${s.model}]` : ""}`);
  }

  ctx.ui.setWidget("loom-subagents", lines);
}
