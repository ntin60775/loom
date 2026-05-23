import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentTools } from "./tools";

export function registerAgentMode(pi: ExtensionAPI): void {
  registerAgentTools(pi);
}
