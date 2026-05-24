/**
 * Subagent Widget (Phase 2) — list running subagents, status, models
 *
 * Invariant: INV-5 (read-only TUI)
 * Deliberate: widget обновляется по командам /subagents и при session_start.
 * Автоматическое обновление в executor loop отложено до v2 (требует event system).
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SubagentRecord } from "../shared/subagent-state";

export function updateSubagentWidget(ctx: ExtensionContext, subagents: SubagentRecord[]): void {
  if (subagents.length === 0) {
    ctx.ui.setWidget("loom-subagents", undefined);
    return;
  }

  const lines = ["🤖 Субагенты:"];
  for (const s of subagents) {
    const icon = s.status === "running" ? "⏳" : s.status === "completed" ? "✓" : "✗";
    const meta: string[] = [];
    if (s.type) meta.push(s.type);
    if (s.model) meta.push(s.model);
    if (s.step) meta.push(`step-${s.step}`);
    lines.push(`  ${icon} ${s.name}${meta.length > 0 ? ` [${meta.join(", ")}]` : ""}`);
  }

  ctx.ui.setWidget("loom-subagents", lines);
}
