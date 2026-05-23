import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPlanTools } from "./tools";

export function registerPlanMode(pi: ExtensionAPI): void {
  registerPlanTools(pi);
}
