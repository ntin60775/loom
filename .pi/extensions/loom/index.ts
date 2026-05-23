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
import { findKnowledgeRoot, readRegistryFile } from "./knowledge/io";
import { onboardProject, listRules, listArchitectureComponents } from "./knowledge/onboarding";
import { loadPrompt } from "./shared/utils";
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

  // ── Mode Switch Helpers (DRY) ─────────────────────────────────────────

  async function enterPlanMode(ctx: ExtensionContext, args?: string): Promise<void> {
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
  }

  async function enterAgentMode(ctx: ExtensionContext): Promise<void> {
    const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
    if (!knowledgeRoot) {
      ctx.ui.notify("loom: knowledge/ не найден. Запустите /loom-init сначала.", "error");
      return;
    }

    const registry = readRegistryFile(knowledgeRoot);
    const activeTask = registry?.tasks?.find((t) => t.status === "in_progress");

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
  }

  async function enterIdleMode(ctx: ExtensionContext): Promise<void> {
    state.mode = "idle";
    state.currentTaskId = null;
    saveState(pi, state);
    pi.setActiveTools(NORMAL_MODE_TOOLS);
    updateModeWidget(ctx, "idle");
    updateTaskWidget(ctx, null, ctx.cwd);
    ctx.ui.notify("[IDLE] Режим сброшен. Используйте /plan или /agent для входа в режим.", "info");
  }

  // ── Commands ───────────────────────────────────────────────────────────

  const PLAN_MODE_TOOLS = [
    "read", "bash", "grep", "find", "ls",
    "loom_create_task", "loom_create_plan", "loom_add_invariant",
    "loom_add_delivery_unit", "loom_finalize_plan",
    "loom_spawn_subagent",
    "loom_run_scout", "loom_run_researcher", "loom_run_migrator",
    "loom_add_rule", "loom_list_rules",
    "loom_add_architecture_component", "loom_list_architecture_components",
    "loom_generate_agents_md",
  ];
  const AGENT_MODE_TOOLS = [
    "read", "bash", "grep", "find", "ls",
    "loom_get_next_step", "loom_check_iteration",
    "loom_spawn_worker", "loom_spawn_reviewer",
    "loom_update_task", "loom_read_artifact",
  ];
  const NORMAL_MODE_TOOLS = [
    "read", "bash", "edit", "write", "grep", "find", "ls",
    "loom_add_rule", "loom_list_rules",
    "loom_add_architecture_component", "loom_list_architecture_components",
    "loom_generate_agents_md",
  ];

  pi.registerCommand("plan", {
    description: "Войти в Plan Mode — брейншторм, артефакты, декомпозиция",
    handler: async (args, ctx) => enterPlanMode(ctx, args),
  });

  pi.registerCommand("agent", {
    description: "Войти в Agent Mode — исполнение по плану",
    handler: async (_args, ctx) => enterAgentMode(ctx),
  });

  pi.registerCommand("loom-init", {
    description: "Инициализировать loom в текущем проекте (с onboarding wizard)",
    handler: async (_args, ctx) => {
      const result = onboardProject(ctx.cwd);
      const lines = [
        "loom инициализирован.",
        `Создано: ${result.created.join(", ") || "ничего нового"}`,
        `Классификация проекта: ${result.state.classification}`,
      ];
      if (result.existing.length > 0) {
        lines.push(`Уже существовало: ${result.existing.join(", ")}`);
      }
      ctx.ui.notify(lines.join("\n"), "success");

      // Onboarding wizard for non-clean states
      if (result.state.classification !== "clean") {
        const runOnboarding = await ctx.ui.select(
          `Проект классифицирован как "${result.state.classification}". Запустить onboarding pipeline?`,
          ["Да — запустить scout + research + migration", "Нет — оставить как есть"],
        );
        if (runOnboarding === "Да — запустить scout + research + migration") {
          pi.sendUserMessage("Запусти onboarding pipeline для этого проекта: сначала loom_run_scout, затем loom_run_researcher, затем loom_run_migrator. После этого сгенерируй AGENTS.md через loom_generate_agents_md.");
        }
      }
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

      const registry = readRegistryFile(knowledgeRoot);
      if (!registry || registry.tasks.length === 0) {
        ctx.ui.notify("Задачи не найдены.", "info");
        return;
      }

      const active = registry.tasks.filter((t) => t.status === "in_progress");
      const drafts = registry.tasks.filter((t) => t.status === "draft");
      const completed = registry.tasks.filter((t) => t.status === "completed");

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

  pi.registerCommand("rule-add", {
    description: "Добавить правило в каталог проекта",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }
      pi.sendUserMessage("Добавь новое правило в проект через tool loom_add_rule.");
    },
  });

  pi.registerCommand("rule-list", {
    description: "Показать список правил проекта",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }
      const rules = listRules(ctx.cwd);
      if (rules.length === 0) {
        ctx.ui.notify("Правила не найдены.", "info");
        return;
      }
      const lines = rules.map((r) => `• ${r.id} [${r.category}] ${r.title} (${r.status})`);
      ctx.ui.notify(`Правил: ${rules.length}\n${lines.join("\n")}`, "info");
    },
  });

  pi.registerCommand("arch-add", {
    description: "Добавить архитектурный компонент в каталог",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }
      pi.sendUserMessage("Добавь новый архитектурный компонент через tool loom_add_architecture_component.");
    },
  });

  pi.registerCommand("arch-list", {
    description: "Показать список архитектурных компонентов",
    handler: async (_args, ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }
      const comps = listArchitectureComponents(ctx.cwd);
      if (comps.length === 0) {
        ctx.ui.notify("Компоненты не найдены.", "info");
        return;
      }
      const lines = comps.map((c) => `• ${c.id} [${c.layer}] ${c.name} (${c.status})`);
      ctx.ui.notify(`Компонентов: ${comps.length}\n${lines.join("\n")}`, "info");
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
      ctx.ui.notify("loom загружен. Команды: /plan, /agent, /loom-init, /task-status, /rule-add, /rule-list, /arch-add, /arch-list", "info");
    }
  });

  pi.on("before_agent_start", async () => {
    if (state.mode === "plan") {
      const prompt = loadPrompt("prompts/plan-orchestrator");
      return {
        message: {
          customType: "loom-plan-context",
          content: `[LOOM PLAN MODE ACTIVE]\n\n${prompt}`,
          display: false,
        },
      };
    }

    if (state.mode === "agent") {
      const prompt = loadPrompt("prompts/agent-executor");
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

  pi.registerShortcut("ctrl+shift+m", {
    description: "Циклическое переключение режимов loom: idle → plan → agent → idle",
    handler: async (ctx) => {
      const knowledgeRoot = findKnowledgeRoot(ctx.cwd);
      if (!knowledgeRoot) {
        ctx.ui.notify("loom не инициализирован. Запустите /loom-init.", "error");
        return;
      }

      if (state.mode === "idle") {
        await enterPlanMode(ctx);
      } else if (state.mode === "plan") {
        const registry = readRegistryFile(knowledgeRoot);
        const activeTask = registry?.tasks?.find((t) => t.status === "in_progress");
        if (activeTask) {
          await enterAgentMode(ctx);
        } else {
          ctx.ui.notify("Нет активной задачи для Agent Mode. Сброс в idle.", "warning");
          await enterIdleMode(ctx);
        }
      } else {
        // agent → idle
        await enterIdleMode(ctx);
      }
    },
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
        await enterAgentMode(ctx);
        pi.sendUserMessage("Начни исполнение текущего плана.");
      } else if (choice === "Завершить сессию планирования") {
        await enterIdleMode(ctx);
      }
    }
  });

  // ── Register sub-modules ────────────────────────────────────────────────

  registerPlanMode(pi);
  registerAgentMode(pi);
}
