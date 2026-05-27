/**
 * Test Fixtures — factory functions for loom data types
 *
 * Provides deterministic, minimal data for unit tests.
 */

import type { MemoryEntry, MemoryQuery, SessionContent, EpisodicContent, SemanticContent, ProceduralContent, TrackType } from "../memory/types";

// ── MemoryEntry factories ─────────────────────────────────────────────────

let entryCounter = 0;

export function makeMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  entryCounter++;
  const now = new Date().toISOString();
  const trackType: TrackType = overrides.track_type ?? "episodic";
  const defaultContent: Record<string, unknown> = {
    episodic: { event: `test-event-${entryCounter}`, decision: "test-decision", outcome: "success" } satisfies EpisodicContent,
    semantic: { fact: `test-fact-${entryCounter}`, category: "convention", confidence: 0.9 } satisfies SemanticContent,
    procedural: { pattern: `test-pattern-${entryCounter}`, context: "test-context", validation_status: "draft", usage_count: 0 } satisfies ProceduralContent,
    session: { role: "user", message: `test-message-${entryCounter}` } satisfies SessionContent,
  };

  return {
    entry_id: `test-entry-${entryCounter}`,
    task_id: null,
    step_number: null,
    timestamp: now,
    track_type: trackType,
    content: overrides.content ?? (defaultContent[trackType] as MemoryEntry["content"]),
    relevance_score: 0.5,
    source_ref: `test-source-${entryCounter}`,
    tags: [],
    created_at: now,
    updated_at: now,
    expires_at: null,
    access_count: 0,
    last_accessed_at: now,
    ...overrides,
  };
}

export function makeMemoryQuery(overrides: Partial<MemoryQuery> = {}): MemoryQuery {
  return {
    task_id: null,
    min_relevance: 0.1,
    limit: 10,
    ...overrides,
  };
}

// ── Task factories ────────────────────────────────────────────────────────

export interface TestTask {
  task_id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  branch: string;
  execution_mode?: string;
  invariants: Array<{ id: string; text: string; marker: string; status: string }>;
  delivery_units: Array<{ id: string; status: string; purpose: string; base_branch: string }>;
  created_at: string;
  updated_at: string;
  schema_version: string;
}

export function makeTask(overrides: Partial<TestTask> = {}): TestTask {
  const now = new Date().toISOString().split("T")[0];
  return {
    task_id: "TASK-2026-0099-test",
    slug: "test-task",
    title: "Test Task",
    description: "A test task for unit tests",
    status: "draft",
    priority: "medium",
    branch: "task/test-task",
    invariants: [],
    delivery_units: [],
    created_at: now,
    updated_at: now,
    schema_version: "1.0.0",
    ...overrides,
  };
}

export interface TestPlanStep {
  step_number: number;
  title: string;
  description: string;
  expected_output: string;
  constraints: string[];
  depends_on: number[];
  estimated_effort: string;
  status: string;
}

export interface TestPlan {
  task_id: string;
  steps: TestPlanStep[];
  risks: Array<{ id: string; description: string; severity: string; mitigation: string }>;
  checkpoints: Array<{ id: string; description: string; after_step: number; verification: string }>;
}

export function makePlan(overrides: Partial<TestPlan> = {}): TestPlan {
  return {
    task_id: "TASK-2026-0099-test",
    steps: [
      {
        step_number: 1,
        title: "Step 1",
        description: "First step",
        expected_output: "output-1.json",
        constraints: [],
        depends_on: [],
        estimated_effort: "small",
        status: "pending",
      },
      {
        step_number: 2,
        title: "Step 2",
        description: "Second step",
        expected_output: "output-2.json",
        constraints: [],
        depends_on: [1],
        estimated_effort: "medium",
        status: "pending",
      },
    ],
    risks: [],
    checkpoints: [],
    ...overrides,
  };
}

// ── Config factories ──────────────────────────────────────────────────────

export interface TestExecutionConfig {
  review?: { enabled?: boolean; max_iterations?: number };
  recovery?: { max_retries_per_step?: number; default_strategy?: string; escalate_after_total_failures?: number };
  timeout?: { worker?: number; reviewer?: number; scout?: number };
  use_memory_v2?: boolean;
  memory?: {
    token_budget?: number;
    relevance_weights?: { freshness: number; frequency: number; explicit_rating: number };
    retention?: {
      max_entries_session?: number;
      max_entries_episodic?: number;
      max_entries_semantic?: number;
      max_entries_procedural?: number;
      max_age_days?: number;
      min_relevance?: number;
    };
  };
  [key: string]: unknown;
}

export function makeExecutionConfig(overrides: TestExecutionConfig = {}): Record<string, unknown> {
  return {
    review: { enabled: true, max_iterations: 10 },
    recovery: { max_retries_per_step: 10, default_strategy: "retry_with_correction", escalate_after_total_failures: 5 },
    timeout: { worker: 3600, reviewer: 1800, scout: 600 },
    use_memory_v2: false,
    memory: {
      token_budget: 4000,
      relevance_weights: { freshness: 0.4, frequency: 0.3, explicit_rating: 0.3 },
      retention: {
        max_entries_session: 1000,
        max_entries_episodic: 500,
        max_entries_semantic: 2000,
        max_entries_procedural: 500,
        max_age_days: 90,
        min_relevance: 0.1,
      },
    },
    ...overrides,
  };
}

export interface TestSubagentConfig {
  domains?: Record<string, { provider: string; model: string; thinking?: string }>;
  worker?: { domain_rules?: Array<{ extension?: string; domain: string; default?: string }> };
  reviewer?: { thinking?: string; domain_rules?: Array<{ extension?: string; domain: string; default?: string }> };
  scout?: { thinking?: string };
}

export function makeSubagentConfig(overrides: TestSubagentConfig = {}): Record<string, unknown> {
  return {
    domains: {
      general: { provider: "deepseek", model: "deepseek-chat", thinking: "medium" },
    },
    worker: { domain_rules: [{ default: "general" }] },
    reviewer: { thinking: "xhigh", domain_rules: [{ default: "general" }] },
    scout: { thinking: "xhigh" },
    ...overrides,
  };
}

// ── Review factory ────────────────────────────────────────────────────────

export interface TestReview {
  verdict: string;
  commit: string;
  step_number: number;
  findings: Array<{ severity: string; message: string; file_path?: string }>;
  recommendations?: string;
  reviewed_at: string;
}

export function makeReview(overrides: Partial<TestReview> = {}): TestReview {
  return {
    verdict: "approve",
    commit: "abc123",
    step_number: 1,
    findings: [],
    reviewed_at: new Date().toISOString(),
    ...overrides,
  };
}


// ── Theme mock ────────────────────────────────────────────────────────────

export function fg(color: string, text: string): string {
  return text;
}

export function bg(color: string, text: string): string {
  return text;
}
