/**
 * Onboarding Pipeline — initialize loom in a project
 *
 * Invariants:
 *   INV-3: Legacy/Greenfield parity — handles clean, partial, foreign_system, mixed_system, compatible states
 *   INV-7: Pi-Native (extension, not standalone)
 *   INV-12: Operator text in Russian; machine markers in English
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { writeJson, readJson } from "./io";

export interface OnboardingResult {
  knowledgeRoot: string;
  created: string[];
  existing: string[];
  state: OnboardingState;
}

export interface OnboardingState {
  git_repo: boolean;
  has_agents_md: boolean;
  has_knowledge: boolean;
  classification: "clean" | "partial" | "foreign_system" | "mixed_system" | "compatible";
  stack_scouted: boolean;
  research_done: boolean;
  migration_analyzed: boolean;
  rules_initialized: boolean;
  architecture_initialized: boolean;
  agents_md_generated: boolean;
}

function detectClassification(state: Omit<OnboardingState, "classification">): OnboardingState["classification"] {
  const { git_repo, has_agents_md, has_knowledge } = state;
  if (!git_repo) return "partial"; // no git = partial at best
  if (has_agents_md && has_knowledge) return "compatible";
  if (has_agents_md && !has_knowledge) return "foreign_system";
  if (!has_agents_md && has_knowledge) return "mixed_system";
  return "clean";
}

export function preCheck(cwd: string): Omit<OnboardingState, "classification"> {
  const gitRepo = fs.existsSync(path.join(cwd, ".git"));
  const agentsMd = fs.existsSync(path.join(cwd, "AGENTS.md"));
  const knowledge = fs.existsSync(path.join(cwd, "knowledge"));
  return {
    git_repo: gitRepo,
    has_agents_md: agentsMd,
    has_knowledge: knowledge,
    stack_scouted: false,
    research_done: false,
    migration_analyzed: false,
    rules_initialized: false,
    architecture_initialized: false,
    agents_md_generated: false,
  };
}

export function ensureKnowledgeStructure(cwd: string): { created: string[]; existing: string[] } {
  const knowledgeRoot = path.join(cwd, "knowledge");
  const dirs = [
    { path: path.join(knowledgeRoot, "tasks"), label: "tasks" },
    { path: path.join(knowledgeRoot, "project"), label: "project" },
    { path: path.join(knowledgeRoot, "project", "schemas"), label: "schemas" },
    { path: path.join(knowledgeRoot, "project", "configs"), label: "configs" },
    { path: path.join(knowledgeRoot, "project", "rules"), label: "rules" },
    { path: path.join(knowledgeRoot, "project", "architecture"), label: "architecture" },
    { path: path.join(knowledgeRoot, "project", "architecture", "components"), label: "architecture/components" },
    { path: path.join(knowledgeRoot, "project", "onboarding"), label: "onboarding" },
  ];

  const created: string[] = [];
  const existing: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir.path)) {
      fs.mkdirSync(dir.path, { recursive: true });
      created.push(dir.label);
    } else {
      existing.push(dir.label);
    }
  }

  // Registry
  const registryPath = path.join(knowledgeRoot, "tasks", "registry.json");
  if (!fs.existsSync(registryPath)) {
    writeJson(registryPath, { schema_version: "1.0.0", tasks: [] });
    created.push("registry.json");
  } else {
    existing.push("registry.json");
  }

  // Default configs
  const executionConfigPath = path.join(knowledgeRoot, "project", "configs", "execution-config.json");
  if (!fs.existsSync(executionConfigPath)) {
    writeJson(executionConfigPath, {
      schema_version: "1.0.0",
      git_safety: {
        require_files_to_commit: true,
        validate_against_plan: true,
      },
      recovery: {
        max_worker_iterations: 10,
        timeout_reviewer_seconds: 300,
        on_worker_crash: "retry_once",
      },
      localization_guard: {
        enabled: true,
        command: "bash scripts/check-docs-localization.sh",
      },
    });
    created.push("execution-config.json");
  } else {
    existing.push("execution-config.json");
  }

  const subagentConfigPath = path.join(knowledgeRoot, "project", "configs", "subagent-config.json");
  if (!fs.existsSync(subagentConfigPath)) {
    writeJson(subagentConfigPath, {
      schema_version: "1.0.0",
      domains: {},
      worker: { model: null, tools: ["read", "bash", "edit", "write"] },
      reviewer: { model: null, tools: ["read", "bash", "grep", "find", "ls"] },
    });
    created.push("subagent-config.json");
  } else {
    existing.push("subagent-config.json");
  }

  return { created, existing };
}

export function onboardProject(cwd: string): OnboardingResult {
  const pre = preCheck(cwd);
  const { created, existing } = ensureKnowledgeStructure(cwd);
  const classification = detectClassification(pre);

  const state: OnboardingState = {
    ...pre,
    classification,
    rules_initialized: fs.existsSync(path.join(cwd, "knowledge", "project", "rules")),
    architecture_initialized: fs.existsSync(path.join(cwd, "knowledge", "project", "architecture", "components")),
  };

  return {
    knowledgeRoot: path.join(cwd, "knowledge"),
    created,
    existing,
    state,
  };
}

// ── Artifact Paths ────────────────────────────────────────────────────────

export function getOnboardingArtifactsDir(cwd: string): string {
  return path.join(cwd, "knowledge", "project", "onboarding");
}

export function ensureOnboardingArtifactsDir(cwd: string): string {
  const dir = getOnboardingArtifactsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getStackJsonPath(cwd: string): string {
  return path.join(ensureOnboardingArtifactsDir(cwd), "stack.json");
}

export function getContextResearchPath(cwd: string): string {
  return path.join(ensureOnboardingArtifactsDir(cwd), "context-research.json");
}

export function getMigrationAnalysisPath(cwd: string): string {
  return path.join(ensureOnboardingArtifactsDir(cwd), "migration-analysis.json");
}

export function getGeneratedAgentsMdPath(cwd: string): string {
  return path.join(cwd, "AGENTS.md.generated");
}

// ── AGENTS.md Generator ───────────────────────────────────────────────────

export interface AgentsMdInput {
  projectName: string;
  stack: Record<string, unknown> | null;
  research: Record<string, unknown> | null;
  rules: Array<Record<string, unknown>>;
  components: Array<Record<string, unknown>>;
  /** Optional task data for generating navigation and invariants section */
  tasks?: Array<{ task_id: string; title: string; status: string; priority: string; branch: string }>;
  active_task_id?: string | null;
}

export function generateAgentsMd(input: AgentsMdInput): string {
  const lines: string[] = [
    `# AGENTS.md — ${input.projectName}`,
    "",
    "## Проект",
    "",
    `- **Название:** ${input.projectName}`,
    `**Stack:** ${input.stack ? (input.stack.languages as string[])?.join(", ") ?? "unknown" : "unknown"}`,
    "",
    "## Маршрутизация",
    "",
    "- `/plan [desc]` — вход в Plan Mode (брейншторм, артефакты)",
    "- `/agent` — вход в Agent Mode (исполнение по плану)",
    "- `/loom-init` — инициализация loom в проекте (с onboarding wizard)",
    "- `/task-status` — статус текущей задачи",
    "- `/rule-add` — добавить правило в каталог",
    "- `/rule-list` — список правил проекта",
    "- `/arch-add` — добавить архитектурный компонент",
    "- `/arch-list` — список архитектурных компонентов",
    "- **Шорткат:** `ctrl+shift+m` — циклическое переключение режимов: idle → plan → agent → idle",
    "",
  ];

  if (input.tasks && input.tasks.length > 0) {
    lines.push("## Задачи");
    lines.push("");
    const active = input.tasks.filter((t) => t.status === "in_progress");
    const drafts = input.tasks.filter((t) => t.status === "draft");
    const completed = input.tasks.filter((t) => t.status === "completed");
    lines.push(`- Всего задач: ${input.tasks.length}`);
    lines.push(`- 🟢 Активных: ${active.length}`);
    lines.push(`- 🟡 Черновиков: ${drafts.length}`);
    lines.push(`- ✅ Завершённых: ${completed.length}`);
    if (input.active_task_id) {
      const curr = input.tasks.find((t) => t.task_id === input.active_task_id);
      if (curr) lines.push(`- **Текущая:** ${curr.task_id}: ${curr.title} [${curr.branch}]`);
    }
    lines.push("");
    lines.push("Текущие задачи: см. `knowledge/tasks/registry.json`");
    lines.push("");
  }

  // ── Invariants ────────────────────────────────────────────────────────

  if (input.tasks && input.tasks.length > 0) {
    const allInvariants: Array<{ id: string; text: string; marker: string }> = [];
    for (const t of input.tasks) {
      // invariants are in task.json, not the registry entry — skip if not loaded
    }
  }

  lines.push("## Архитектура");
  lines.push("");

  if (input.components.length > 0) {
    for (const comp of input.components) {
      lines.push(`### ${comp.name as string} [${comp.id as string}]`);
      lines.push("");
      lines.push(`- **Слой:** ${comp.layer as string}`);
      lines.push(`- **Статус:** ${comp.status as string}`);
      lines.push(`- **Файлы:** ${(comp.files as string[])?.join(", ") ?? "—"}`);
      lines.push("");
      const responsibilities = comp.responsibilities as string[];
      if (responsibilities && responsibilities.length > 0) {
        lines.push("**Ответственности:**");
        for (const r of responsibilities) lines.push(`- ${r}`);
        lines.push("");
      }
    }
  } else {
    lines.push("Компоненты ещё не задокументированы.");
    lines.push("");
  }

  lines.push("## Правила");
  lines.push("");
  if (input.rules.length > 0) {
    for (const rule of input.rules) {
      lines.push(`### ${rule.title as string} [${rule.id as string}]`);
      lines.push("");
      lines.push(`${rule.body as string}`);
      lines.push("");
      lines.push(`- **Категория:** ${rule.category as string} | **Статус:** ${rule.status as string} | **Версия:** ${rule.version as number}`);
      lines.push("");
    }
  } else {
    lines.push("Правила ещё не задокументированы.");
    lines.push("");
  }

  lines.push("## Контекст");
  lines.push("");
  if (input.research) {
    lines.push(`**README:** ${(input.research.readme_summary as string) ?? "—"}`);
    lines.push("");
    const recs = input.research.recommendations as string[];
    if (recs && recs.length > 0) {
      lines.push("**Рекомендации:**");
      for (const r of recs) lines.push(`- ${r}`);
      lines.push("");
    }
  } else {
    lines.push("Контекст ещё не исследован.");
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by loom onboarding pipeline*");

  return lines.join("\n");
}

// ── Catalog Helpers ───────────────────────────────────────────────────────

export function getRulesDir(cwd: string): string {
  return path.join(cwd, "knowledge", "project", "rules");
}

export function getArchitectureComponentsDir(cwd: string): string {
  return path.join(cwd, "knowledge", "project", "architecture", "components");
}

export function listRules(cwd: string): Array<{ id: string; title: string; category: string; status: string }> {
  const dir = getRulesDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const rules: Array<{ id: string; title: string; category: string; status: string }> = [];
  for (const file of files) {
    const data = readJson<Record<string, unknown>>(path.join(dir, file));
    if (data) {
      rules.push({
        id: String(data.id ?? file.replace(".json", "")),
        title: String(data.title ?? "—"),
        category: String(data.category ?? "other"),
        status: String(data.status ?? "proposed"),
      });
    }
  }
  return rules;
}

export function listArchitectureComponents(cwd: string): Array<{ id: string; name: string; layer: string; status: string }> {
  const dir = getArchitectureComponentsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const comps: Array<{ id: string; name: string; layer: string; status: string }> = [];
  for (const file of files) {
    const data = readJson<Record<string, unknown>>(path.join(dir, file));
    if (data) {
      comps.push({
        id: String(data.id ?? file.replace(".json", "")),
        name: String(data.name ?? "—"),
        layer: String(data.layer ?? "unknown"),
        status: String(data.status ?? "discovered"),
      });
    }
  }
  return comps;
}

export function writeRule(cwd: string, rule: Record<string, unknown>): string {
  const dir = getRulesDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const id = String(rule.id ?? `RULE-${Date.now()}`);
  const filePath = path.join(dir, `${id}.json`);
  writeJson(filePath, { ...rule, id });
  return filePath;
}

export function writeArchitectureComponent(cwd: string, comp: Record<string, unknown>): string {
  const dir = getArchitectureComponentsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const id = String(comp.id ?? `COMP-${Date.now()}`);
  const filePath = path.join(dir, `${id}.json`);
  writeJson(filePath, { ...comp, id });
  return filePath;
}
