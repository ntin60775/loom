import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentTools } from "./tools";
import { registerExecutorLoopTools } from "./executor-loop";

export function registerAgentMode(pi: ExtensionAPI): void {
  registerAgentTools(pi);
  registerExecutorLoopTools(pi);
}
