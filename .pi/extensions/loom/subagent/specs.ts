/**
 * Subagent Specifications — Worker and Reviewer runtime contracts
 */

export interface WorkerSpec {
  name: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  task: string;
  cwd?: string;
  sessionDir?: string;
}

export interface ReviewerSpec {
  name: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  task: string;
  targetCommit: string;
  planJsonPath: string;
  stepNumber: number;
  cwd?: string;
  sessionDir?: string;
}

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
