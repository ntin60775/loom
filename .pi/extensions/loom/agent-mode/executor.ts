import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentTools } from "./tools";
import { registerExecutorLoopTools, resolveExecutionMode } from "./executor-loop";

export { resolveExecutionMode };
export type { ExecutionMode } from "./executor-loop";

export function registerAgentMode(pi: ExtensionAPI): void {
  registerAgentTools(pi);
  registerExecutorLoopTools(pi);
}
