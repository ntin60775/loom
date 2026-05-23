import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function updateModeWidget(ctx: ExtensionContext, mode: "plan" | "agent" | "idle"): void {
  const label = mode === "plan" ? "[PLAN]" : mode === "agent" ? "[AGENT]" : "[IDLE]";
  ctx.ui.setStatus("loom-mode", label);
}
