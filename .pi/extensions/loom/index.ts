/**
 * Loom Extension — AI-Native Development Environment for pi
 *
 * Commands:
 *   /plan [desc]  — Enter Plan Mode (brainstorm, artifacts)
 *   /agent        — Enter Agent Mode (execute plan)
 *   /loom-init    — Initialize loom in project
 *   /task-status  — Show current task status
 *
 * Invariants: see knowledge/tasks/TASK-2026-0001-bootstrap/sdd.json
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { updateModeWidget } from "./ui/mode-widget";
import { updateTaskWidget } from "./ui/task-widget";
import { registerPlanMode } from "./plan-mode/orchestrator";
import { registerAgentMode } from "./agent-mode/executor";
import { findKnowledgeRoot, readJson } from "./knowledge/io";
import { onboardProject } from "./knowledge/onboarding";
import * as fs from "node:fs";
import * as path from "node:path";

interface LoomState {
  mode: "idle" | "plan" | "agent";
  currentTaskId: string | null;
}

function loadState(ctx: ExtensionContext): LoomState {
  const entries = ctx.sessionManager.getEntries();
  const loomEntry = entries
    .filter((e: any) => e.type === "custom" && e.customType === "loom-state")
    .pop() as { data?: LoomState } | undefined;

  if (loomEntry?.data) {
    return {
      mode: loomEntry.data.mode ?? "idle",
      currentTaskId: loomEntry.data.currentTaskId ?? null,
    };
  }

  return { mode: "idle", currentTaskId: null };
}

function saveState(pi: ExtensionAPI, state: LoomState): void {
  pi.appendEntry("loom-state", state);
}

export default function loomExtension(pi: ExtensionAPI): void {
  let state: LoomState = { mode: "idle", currentTaskId: null };

  // ── Commands ───────────────────────────────────────────────────────────

  const PLAN_MODE_TOOLS = [
    "read", "bash", "grep", "find", "ls",
    "loom_create_task", "loom_create_plan", "loom_add_invariant",
    "loom_add_delivery_unit", "loom_finalize_plan",
    "loom_spawn_subagent",
  ];
  const AGENT_MODE_TOOLS = [
    "read", "bash", "grep", "find", "ls",
    "loom_get_next_step", "loom_check_iteration",
    "loom_spawn_worker", "loom_spawn_reviewer",
    "loom_update_task", "loom_read_artifact",
  ];
  const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

  pi.registerCommand("plan", {
    description: "Войти в Plan Mode — брейншторм, артефакты, декомпозиция",
    handler: async (args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom: knowledge/ не найден. Запустите /loom-init сначала.", "error");
        return;
      }

      state.mode = "plan";
      state.currentTaskId = null;
      saveState(pi, state);
      pi.setActiveTools(PLAN_MODE_TOOLS);
      updateModeWidget(ctx, "plan");
      ctx.ui.notify("[PLAN] Режим планирования активирован. Опишите задачу или начните декомпозицию.", "info");

      if (args && args.trim()) {
        pi.sendUserMessage(args.trim());
      }
    },
  });

  pi.registerCommand("agent", {
    description: "Войти в Agent Mode — исполнение по плану",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom: knowledge/ не найден. Запустите /loom-init сначала.", "error");
        return;
      }

      // Check for active task
      const registry = readJson<any>(path.join(knowledgeRoot, "tasks", "registry.json"));
      const activeTask = registry?.tasks?.find((t: any) => t.status === "in_progress");

      if (!activeTask) {
        ctx.ui.notify("Нет активной задачи in_progress. Создайте задачу через /plan или обновите registry.json.", "warning");
        return;
      }

      state.mode = "agent";
      state.currentTaskId = activeTask.task_id;
      saveState(pi, state);
      pi.setActiveTools(AGENT_MODE_TOOLS);
      updateModeWidget(ctx, "agent");
      updateTaskWidget(ctx, activeTask.task_id, ctx.cwd);
      ctx.ui.notify(`[AGENT] Режим исполнения активирован. Задача: ${activeTask.title}`, "info");
    },
  });

  pi.registerCommand("loom-init", {
    description: "Инициализировать loom в текущем проекте",
    handler: async (_args, ctx) => {
      const result = onboardProject(ctx.cwd);
      const lines = [
        "loom инициализирован.",
        `Создано: ${result.created.join(", ") || "ничего нового"}`,
      ];
      if (result.existing.length > 0) {
        lines.push(`Уже существовало: ${result.existing.join(", ")}`);
      }
      ctx.ui.notify(lines.join("\n"), "success");
    },
  });

  pi.registerCommand("task-status", {
    description: "Показать статус текущей задачи и прогресс",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }

      const registry = readJson<any>(path.join(knowledgeRoot, "tasks", "registry.json"));
      if (!registry || !registry.tasks || registry.tasks.length === 0) {
        ctx.ui.notify("Задачи не найдены.", "info");
        return;
      }

      const active = registry.tasks.filter((t: any) => t.status === "in_progress");
      const drafts = registry.tasks.filter((t: any) => t.status === "draft");
      const completed = registry.tasks.filter((t: any) => t.status === "completed");

      const lines = [
        `📋 Всего задач: ${registry.tasks.length}`,
        `🟢 Активных: ${active.length}`,
        `🟡 Черновиков: ${drafts.length}`,
        `✅ Завершённых: ${completed.length}`,
      ];

      if (active.length > 0) {
        lines.push("", "Активные задачи:");
        for (const t of active) {
          lines.push(`  • ${t.task_id}: ${t.title} [${t.branch}]`);
        }
      }

      if (state.currentTaskId) {
        lines.push("", `Текущий контекст: ${state.currentTaskId}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── Event Hooks ────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    state = loadState(ctx);
    updateModeWidget(ctx, state.mode);
    updateTaskWidget(ctx, state.currentTaskId, ctx.cwd);

    // Restore tools based on persisted mode
    if (state.mode === "plan") {
      pi.setActiveTools(PLAN_MODE_TOOLS);
    } else if (state.mode === "agent") {
      pi.setActiveTools(AGENT_MODE_TOOLS);
    } else {
      pi.setActiveTools(NORMAL_MODE_TOOLS);
    }

    const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
    if (knowledgeRoot) {
      ctx.ui.notify("loom загружен. Команды: /plan, /agent, /loom-init, /task-status", "info");
    }
  });

  function loadPromptFile(name: string): string {
    const baseDir = typeof __dirname !== 'undefined'
      ? __dirname
      : typeof import.meta !== 'undefined' && import.meta.dirname
        ? import.meta.dirname
        : process.cwd();
    const promptPath = path.join(baseDir, "prompts", `${name}.md`);
    try {
      return fs.readFileSync(promptPath, "utf-8");
    } catch {
      return `[LOAD ERROR: Prompt ${name} not found at ${promptPath}]`;
    }
  }

  pi.on("before_agent_start", async () => {
    if (state.mode === "plan") {
      const prompt = loadPromptFile("plan-orchestrator");
      return {
        message: {
          customType: "loom-plan-context",
          content: `[LOOM PLAN MODE ACTIVE]\n\n${prompt}`,
          display: false,
        },
      };
    }

    if (state.mode === "agent") {
      const prompt = loadPromptFile("agent-executor");
      return {
        message: {
          customType: "loom-agent-context",
          content: `[LOOM AGENT MODE ACTIVE]\n\n${prompt}`,
          display: false,
        },
      };
    }

    return undefined;
  });

  pi.on("agent_end", async (_event, ctx) => {
    // In plan mode, after agent finishes, show options
    if (state.mode === "plan") {
      const choice = await ctx.ui.select("Plan Mode — что дальше?", [
        "Перейти в Agent Mode и начать исполнение",
        "Остаться в Plan Mode",
        "Завершить сессию планирования",
      ]);

      if (choice === "Перейти в Agent Mode и начать исполнение") {
        state.mode = "agent";
        saveState(pi, state);
        pi.setActiveTools(AGENT_MODE_TOOLS);
        updateModeWidget(ctx, "agent");
        updateTaskWidget(ctx, state.currentTaskId, ctx.cwd);
        ctx.ui.notify("Переход в Agent Mode...", "info");
        pi.sendUserMessage("Начни исполнение текущего плана.");
      } else if (choice === "Завершить сессию планирования") {
        state.mode = "idle";
        state.currentTaskId = null;
        saveState(pi, state);
        pi.setActiveTools(NORMAL_MODE_TOOLS);
        updateModeWidget(ctx, "idle");
      }
    }
  });

  // ── Register sub-modules (stubs for now) ───────────────────────────────

  registerPlanMode(pi);
  registerAgentMode(pi);
}
