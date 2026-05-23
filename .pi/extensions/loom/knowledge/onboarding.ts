/**
 * Onboarding Pipeline — initialize loom in a project
 *
 * Invariants:
 *   INV-3: Legacy/Greenfield parity
 *   INV-7: Pi-Native (extension, not standalone)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { writeJson } from "./io";

export interface OnboardingResult {
  knowledgeRoot: string;
  created: string[];
  existing: string[];
}

export function onboardProject(cwd: string): OnboardingResult {
  const knowledgeRoot = path.join(cwd, "knowledge");
  const tasksDir = path.join(knowledgeRoot, "tasks");
  const projectDir = path.join(knowledgeRoot, "project");
  const schemasDir = path.join(projectDir, "schemas");
  const configsDir = path.join(projectDir, "configs");
  const rulesDir = path.join(projectDir, "rules");
  const archDir = path.join(projectDir, "architecture");

  const created: string[] = [];
  const existing: string[] = [];

  const dirs = [
    { path: tasksDir, label: "tasks" },
    { path: projectDir, label: "project" },
    { path: schemasDir, label: "schemas" },
    { path: configsDir, label: "configs" },
    { path: rulesDir, label: "rules" },
    { path: archDir, label: "architecture" },
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir.path)) {
      fs.mkdirSync(dir.path, { recursive: true });
      created.push(dir.label);
    } else {
      existing.push(dir.label);
    }
  }

  // Registry
  const registryPath = path.join(tasksDir, "registry.json");
  if (!fs.existsSync(registryPath)) {
    writeJson(registryPath, { schema_version: "1.0.0", tasks: [] });
    created.push("registry.json");
  } else {
    existing.push("registry.json");
  }

  // Default configs
  const executionConfigPath = path.join(configsDir, "execution-config.json");
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

  const subagentConfigPath = path.join(configsDir, "subagent-config.json");
  if (!fs.existsSync(subagentConfigPath)) {
    writeJson(subagentConfigPath, {
      schema_version: "1.0.0",
      worker: {
        model: null,
        tools: ["read", "bash", "edit", "write"],
      },
      reviewer: {
        model: null,
        tools: ["read", "bash", "grep", "find", "ls"],
      },
    });
    created.push("subagent-config.json");
  } else {
    existing.push("subagent-config.json");
  }

  return { knowledgeRoot, created, existing };
}
