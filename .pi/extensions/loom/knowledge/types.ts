/**
 * Knowledge Types — domain interfaces for loom artifacts
 *
 * These mirror the TypeBox schemas in schemas.ts but as plain TypeScript types
 * for use in IO wrappers and business logic.
 *
 * Invariant: Must stay in sync with schemas.ts
 */

export interface InvariantData {
  id: string;
  text: string;
  marker: string;
  status: string;
  verification_method: string;
}

export interface DeliveryUnitData {
  id: string;
  status: string;
  purpose: string;
  base_branch: string;
}

export interface TaskData {
  task_id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  branch: string;
  parent_task_id?: string;
  parent_delivery_unit?: string;
  invariants: InvariantData[];
  delivery_units: DeliveryUnitData[];
  created_at: string;
  updated_at: string;
  schema_version: string;
}

export interface PlanStepData {
  step_number: number;
  title: string;
  description: string;
  expected_output: string;
  constraints?: string[];
  depends_on?: number[];
  estimated_effort: string;
  status: string;
}

export interface RiskData {
  id: string;
  description: string;
  severity: string;
  mitigation: string;
}

export interface CheckpointData {
  id: string;
  description: string;
  after_step: number;
  verification: string;
}

export interface PlanData {
  task_id: string;
  steps: PlanStepData[];
  risks?: RiskData[];
  checkpoints?: CheckpointData[];
}

export interface RegistryEntryData {
  task_id: string;
  slug: string;
  title: string;
  status: string;
  priority: string;
  branch: string;
  parent_task_id?: string;
  parent_delivery_unit?: string;
  created_at: string;
  updated_at: string;
}

export interface RegistryData {
  schema_version: string;
  tasks: RegistryEntryData[];
}

export interface SubagentDomainConfig {
  provider: string;
  model: string;
  thinking?: string;
}

export interface DomainRuleConfig {
  extension?: string;
  domain: string;
  default?: string;
}

export interface SubagentWorkerConfig {
  tools?: string[];
  domain_rules?: DomainRuleConfig[];
}

export interface SubagentReviewerConfig {
  thinking?: string;
  domain_rules?: DomainRuleConfig[];
}

export interface SubagentScoutConfig {
  thinking?: string;
}

export interface SubagentConfigData {
  domains: Record<string, SubagentDomainConfig>;
  worker?: SubagentWorkerConfig;
  reviewer?: SubagentReviewerConfig;
  scout?: SubagentScoutConfig;
}

export interface ExecutionConfigRecovery {
  default_strategy: string;
  max_retries_per_step: number;
  escalate_after_total_failures: number;
}

export interface ExecutionConfigGit {
  commit_mode: string;
  commit_message_template: string;
  require_clean_worktree: boolean;
}

export interface ExecutionConfigLocalizationGuard {
  enabled: boolean;
  check_on_review: boolean;
  check_on_finalize: boolean;
  script_path: string;
}

export interface ExecutionConfigData {
  review?: {
    enabled: boolean;
    max_iterations: number;
    auto_select_reviewer: { enabled: boolean; domain_rules: DomainRuleConfig[] };
  };
  parallelism?: { plan_mode_max_subagents: number };
  timeout?: { worker: number; reviewer: number; scout: number };
  recovery?: ExecutionConfigRecovery;
  localization_guard?: ExecutionConfigLocalizationGuard;
  git?: ExecutionConfigGit;
}

export interface ReviewFindingData {
  severity: "blocker" | "warning" | "note";
  message: string;
  file_path?: string;
  line_number?: number;
}

export interface ReviewData {
  verdict: "approve" | "reject" | "needs_discussion";
  commit: string;
  step_number: number;
  findings: ReviewFindingData[];
  recommendations?: string;
  reviewer_model?: string;
  reviewed_at: string;
}

export interface RuleSummary {
  id: string;
  title: string;
  category: string;
  status: string;
}

export interface ComponentSummary {
  id: string;
  name: string;
  layer: string;
  status: string;
}

export interface OnboardingSubagentResult {
  parsed: unknown;
  outputPath: string;
  result: import("../subagent/specs").SubagentResult;
}
