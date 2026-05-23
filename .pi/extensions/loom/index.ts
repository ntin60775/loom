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
import { registerPlanMode } from "./plan-mode/orchestrator";
import { registerAgentMode } from "./agent-mode/executor";
import { findKnowledgeRoot, readJson } from "./knowledge/io";
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

  pi.registerCommand("plan", {
    description: "Войти в Plan Mode — брейншторм, артефакты, декомпозиция",
    handler: async (args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom: knowledge/ не найден. Запустите /loom-init сначала.", "error");
        return;
      }

      state.mode = "plan";
      state.currentTaskId = null; // Plan mode does not bind to a specific task until finalized
      saveState(pi, state);
      updateModeWidget(ctx, "plan");
      ctx.ui.notify("[PLAN] Режим планирования активирован. Опишите задачу или начните декомпозицию.", "info");

      // If user provided args, treat as initial prompt
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
      updateModeWidget(ctx, "agent");
      ctx.ui.notify(`[AGENT] Режим исполнения активирован. Задача: ${activeTask.title}`, "info");
    },
  });

  pi.registerCommand("loom-init", {
    description: "Инициализировать loom в текущем проекте",
    handler: async (_args, ctx) => {
      const knowledgeRoot = path.join(ctx.cwd, "knowledge");
      const tasksDir = path.join(knowledgeRoot, "tasks");
      const projectDir = path.join(knowledgeRoot, "project");
      const schemasDir = path.join(projectDir, "schemas");
      const configsDir = path.join(projectDir, "configs");
      const rulesDir = path.join(projectDir, "rules");
      const archDir = path.join(projectDir, "architecture");

      // Create directory structure
      const dirs = [tasksDir, projectDir, schemasDir, configsDir, rulesDir, archDir];
      for (const dir of dirs) {
        try {
          const fs = await import("node:fs");
          fs.mkdirSync(dir, { recursive: true });
        } catch {
          /* ignore */
        }
      }

      // Create registry.json if missing
      const registryPath = path.join(tasksDir, "registry.json");
      const fs = await import("node:fs");
      if (!fs.existsSync(registryPath)) {
        const registry = {
          schema_version: "1.0.0",
          tasks: [],
        };
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
      }

      ctx.ui.notify("loom инициализирован. Структура knowledge/ создана.", "success");
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

    const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
    if (knowledgeRoot) {
      ctx.ui.notify("loom загружен. Команды: /plan, /agent, /loom-init, /task-status", "info");
    }
  });

  pi.on("before_agent_start", async () => {
    if (state.mode === "plan") {
      return {
        message: {
          customType: "loom-plan-context",
          content: `[LOOM PLAN MODE ACTIVE]
You are the Plan Mode orchestrator for loom — an AI-Native Development Environment.

Your job:
1. Understand the user's goal.
2. Decompose it into delivery units and steps.
3. Produce structured artifacts: task.json, plan.json, sdd.json (if needed).
4. All artifacts go into knowledge/tasks/<TASK-ID>-<slug>/.
5. Update knowledge/tasks/registry.json.
6. When done, call finalize_plan to transition to Agent Mode.

Rules:
- JSON is primary; markdown is derivative.
- Invariants are machine-readable markers (INVARIANT: ...).
- Every task must have a task.json.
- Use spawn_subagent for research or complex analysis if needed.
`,
          display: false,
        },
      };
    }

    if (state.mode === "agent") {
      return {
        message: {
          customType: "loom-agent-context",
          content: `[LOOM AGENT MODE ACTIVE]
You are the Agent Mode executor for loom.

Your job:
1. Read the current task's plan.json and task.json.
2. Execute the next pending step.
3. Spawn a worker subagent for implementation.
4. After worker completes, spawn a reviewer subagent.
5. Based on review, approve (next step) or reject (correction loop, max 10 iterations).
6. Use git diff for review; do not analyze live session.

Rules:
- Executor does NOT write code. Only orchestrates worker + reviewer.
- Worker commits only files listed in files-to-commit.json.
- One active worker at a time.
- All models are configured in subagent-config.json; no hardcoded models.
`,
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
        updateModeWidget(ctx, "agent");
        ctx.ui.notify("Переход в Agent Mode...", "info");
        pi.sendUserMessage("Начни исполнение текущего плана.");
      } else if (choice === "Завершить сессию планирования") {
        state.mode = "idle";
        state.currentTaskId = null;
        saveState(pi, state);
        updateModeWidget(ctx, "idle");
      }
    }
  });

  // ── Register sub-modules (stubs for now) ───────────────────────────────

  registerPlanMode(pi);
  registerAgentMode(pi);
}
