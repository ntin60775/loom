/**
 * Task Widget — show current task, step progress, status
 *
 * Invariant: INV-5 (read-only TUI)
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readJson } from "../knowledge/io";
import * as path from "node:path";

export interface TaskWidgetData {
  task_id: string;
  title: string;
  status: string;
  step_progress: string; // e.g. "3/7 done"
  current_step?: string;
}

export function updateTaskWidget(ctx: ExtensionContext, taskId: string | null, cwd: string): void {
  if (!taskId) {
    ctx.ui.setWidget("loom-task", undefined);
    return;
  }

  const dir = path.join(cwd, "knowledge", "tasks", taskId);
  const task = readJson<any>(path.join(dir, "task.json"));
  const plan = readJson<any>(path.join(dir, "plan.json"));

  if (!task) {
    ctx.ui.setWidget("loom-task", undefined);
    return;
  }

  const totalSteps = plan?.steps?.length ?? 0;
  const doneSteps = plan?.steps?.filter((s: any) => s.status === "done").length ?? 0;
  const currentStep = plan?.steps?.find((s: any) => s.status === "in_progress");

  const lines = [
    `📌 ${task.title} [${task.status}]`,
    `    ${task.task_id} | ${doneSteps}/${totalSteps} шагов`,
  ];

  if (currentStep) {
    lines.push(`    ▶ ${currentStep.step_number}. ${currentStep.title}`);
  }

  ctx.ui.setWidget("loom-task", lines);
}
