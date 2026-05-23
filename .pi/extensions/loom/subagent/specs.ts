/**
 * Subagent Specifications — runtime contracts for all subagent roles
 *
 * Roles: worker, reviewer, scout, researcher, migrator
 */

export interface BaseSpec {
  name: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  task: string;
  cwd?: string;
  sessionDir?: string;
}

export interface WorkerSpec extends BaseSpec {}

export interface ReviewerSpec extends BaseSpec {
  targetCommit: string;
  planJsonPath: string;
  stepNumber: number;
}

export interface ScoutSpec extends BaseSpec {
  outputArtifact: string; // path to stack.json
}

export interface ResearcherSpec extends BaseSpec {
  outputArtifact: string; // path to context-research.json
}

export interface MigratorSpec extends BaseSpec {
  outputArtifact: string; // path to migration-analysis.json
}

export type OnboardingSubagentSpec = ScoutSpec | ResearcherSpec | MigratorSpec;

export interface SubagentResult {
  exitCode: number;
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string }>;
  }>;
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  model?: string;
  stopReason?: string;
  errorMessage?: string;
}
