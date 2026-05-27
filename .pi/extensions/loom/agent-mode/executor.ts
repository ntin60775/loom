import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentTools } from "./tools";
import { registerExecutorLoopTools, resolveExecutionMode, getDirectSteps, markStepDone } from "./executor-loop";

export { resolveExecutionMode, getDirectSteps, markStepDone };
export type { ExecutionMode, DirectStepInfo, DirectExecutionPlan } from "./executor-loop";

export function registerAgentMode(pi: ExtensionAPI): void {
  registerAgentTools(pi);
  registerExecutorLoopTools(pi);
}
