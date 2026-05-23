/**
 * Model Resolver — domain-aware model selection from subagent-config.json
 *
 * Invariants:
 *   INV-10: Model config in subagent-config.json; no hardcoded model strings
 */

import * as path from "node:path";
import { readSubagentConfig } from "../knowledge/io";

interface DomainConfig {
  provider: string;
  model: string;
  thinking?: string;
}

interface DomainRule {
  extension?: string;
  domain: string;
  default?: string;
}

interface AgentDomainConfig {
  thinking?: string;
  domain_rules?: DomainRule[];
}

export interface ResolvedModel {
  model: string;
  provider: string;
  thinking?: string;
}

export type AgentType = "worker" | "reviewer" | "scout";

/**
 * Extract file extensions from expected_output or task description text.
 * Used to match domain_rules for model selection.
 */
function extractExtensions(text: string): string[] {
  const exts: string[] = [];
  const regex = /\.([a-zA-Z0-9]+)\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    exts.push("." + match[1]);
  }
  return exts;
}

/**
 * Resolve the best model for a subagent based on domain_rules.
 *
 * Strategy:
 * 1. If agent type is 'scout', use domains.<scout_domain> if configured, else first domain.
 * 2. For worker/reviewer, iterate domain_rules and match file extensions in the task context.
 * 3. Fall back to the rule with `default` marker.
 * 4. Fall back to the first domain in the config.
 * 5. Return null if no config at all (let pi CLI use its default).
 */
export function resolveModel(
  agentType: AgentType,
  taskContext: string,
  cwd: string,
): ResolvedModel | null {
  const configPath = path.join(cwd, "knowledge", "project", "configs", "subagent-config.json");
  const config = readSubagentConfig(configPath);

  if (!config || !config.domains) return null;

  const domains = config.domains;
  const domainKeys = Object.keys(domains);
  if (domainKeys.length === 0) return null;

  // Scout: use dedicated scout config or fallback to first domain
  if (agentType === "scout") {
    const scoutConfig = config.scout;
    // Scout doesn't have domain_rules — use first domain or a 'general' domain
    const domainName = domainKeys.includes("general") ? "general" : domainKeys[0];
    const domain = domains[domainName];
    return {
      model: domain.model,
      provider: domain.provider,
      thinking: scoutConfig?.thinking ?? domain.thinking,
    };
  }

  // Worker / Reviewer: use domain_rules
  const agentConfig: AgentDomainConfig | undefined = config[agentType];
  const domainRules: DomainRule[] = agentConfig?.domain_rules ?? [];
  const extensions = extractExtensions(taskContext);
  const agentThinking = agentConfig?.thinking;

  // Try to match by file extension
  for (const rule of domainRules) {
    if (rule.extension && extensions.includes(rule.extension)) {
      const domain = domains[rule.domain];
      if (domain) {
        return {
          model: domain.model,
          provider: domain.provider,
          thinking: agentThinking ?? domain.thinking,
        };
      }
    }
  }

  // Fallback to default rule
  for (const rule of domainRules) {
    if (rule.default) {
      const domain = domains[rule.default];
      if (domain) {
        return {
          model: domain.model,
          provider: domain.provider,
          thinking: agentThinking ?? domain.thinking,
        };
      }
    }
  }

  // Absolute fallback: first domain
  const fallbackDomain = domains[domainKeys[0]];
  return {
    model: fallbackDomain.model,
    provider: fallbackDomain.provider,
    thinking: agentThinking ?? fallbackDomain.thinking,
  };
}

/**
 * Build the --model argument value for pi CLI.
 * Returns undefined if no resolved model (let pi use its default).
 */
export function resolveModelArg(
  agentType: AgentType,
  taskContext: string,
  cwd: string,
): string | undefined {
  const resolved = resolveModel(agentType, taskContext, cwd);
  if (!resolved) return undefined;
  return `${resolved.provider}:${resolved.model}`;
}
