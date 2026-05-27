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


/**
 * Structured progress event emitted by spawner.
 * Used by SubagentCard for live TUI updates.
 */
export interface ProgressEvent {
  status: "running" | "completed" | "error" | "aborted";
  tools_used: number;
  ctx_current: number;
  ctx_window: number;
  tokens_cumulative: number;
  cost: number;
  duration_ms: number;
  current_tool?: string;
  /** For retry state */
  retry?: {
    attempt: number;
    max: number;
    reason?: string;
    delay_ms?: number;
  };
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
