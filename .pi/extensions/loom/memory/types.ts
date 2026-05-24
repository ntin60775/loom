/**
 * Memory Layer Types — unified entry format for 4 tracks
 *
 * Invariants: INV-4 (deterministic context), INV-5 (task-scoped)
 */

export type TrackType = "session" | "episodic" | "semantic" | "procedural";

export interface SessionContent {
  role: "user" | "assistant" | "system" | "tool";
  message: string;
  tool_calls?: Record<string, unknown>[];
  session_id?: string;
}

export interface EpisodicContent {
  event: string;
  decision: string;
  outcome: "success" | "failure" | "partial" | "blocked";
  affected_files?: string[];
  invariants_checked?: string[];
}

export interface SemanticContent {
  fact: string;
  category: "rule" | "architecture" | "invariant" | "convention" | "dependency" | "domain";
  confidence?: number;
  domain?: string;
}

export interface ProceduralContent {
  pattern: string;
  context: string;
  validation_status?: "draft" | "validated" | "deprecated" | "rejected";
  origin_task_id?: string | null;
  usage_count?: number;
}

export type MemoryContent = SessionContent | EpisodicContent | SemanticContent | ProceduralContent;

export interface MemoryEntry {
  entry_id: string;
  task_id: string | null;
  step_number: number | null;
  timestamp: string; // ISO 8601
  track_type: TrackType;
  content: MemoryContent;
  relevance_score: number;
  source_ref: string;
  tags?: string[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  expires_at?: string | null; // ISO 8601
  access_count: number;
  last_accessed_at: string | null; // ISO 8601
}

export interface MemoryQuery {
  track_type?: TrackType;
  task_id?: string | null;
  step_number?: number;
  tags?: string[];
  min_relevance?: number;
  since?: string; // ISO 8601
  until?: string; // ISO 8601
  limit?: number;
}

export interface TrackStats {
  track_type: TrackType;
  total_entries: number;
  total_relevance: number;
  oldest_entry: string | null;
  newest_entry: string | null;
}
