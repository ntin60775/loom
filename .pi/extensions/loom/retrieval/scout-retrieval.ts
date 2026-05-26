/**
 * Scout Retrieval Engine — knowledge search via scout subagent
 *
 * Invariants:
 *   INV-2:  Retrieval via scout subagent with explicit reasoning, not vector embeddings
 *   INV-7:  Cache results by query_hash to avoid redundant spawns
 *   INV-4:  Deterministic context assembly
 *   INV-12: All code comments in English
 */

import * as crypto from "node:crypto";
import * as path from "node:path";
import type { Scope } from "./scope-filter";
import { resolveSearchPaths } from "./scope-filter";
import { RetrievalCache } from "./cache";
import type { SearchKnowledgeResponse, SearchResult } from "./cache";
import type { SubagentResult } from "../subagent/specs";
import { spawnSubagent } from "../subagent/spawner";
import { loadPrompt } from "../shared/utils";
import { logger } from "../shared/logger";

/** Options for ScoutRetrieval construction */
export interface ScoutRetrievalOptions {
  /** Project root directory */
  cwd: string;
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtlMs?: number;
  /** Timeout for scout subagent in milliseconds (default: 60_000) */
  scoutTimeoutMs?: number;
  /** Default maximum number of results (default: 10) */
  defaultLimit?: number;
}

/** Internal scout search report */
interface ScoutSearchReport {
  results: SearchResult[];
  rawOutput: string;
}

/** Internal scout search spec (subset of BaseSpec for type safety) */
interface ScoutSearchSpec {
  name: string;
  systemPrompt: string;
  task: string;
  cwd: string;
}

/** Default cache path relative to cwd */
const DEFAULT_CACHE_PATH = path.join("knowledge", "project", "cache", "retrieval.json");

/** Default scout timeout — 60 seconds */
const DEFAULT_SCOUT_TIMEOUT_MS = 60_000;

/** Default result limit */
const DEFAULT_LIMIT = 10;

/**
 * Scout Retrieval Engine.
 * Searches knowledge files by spawning a scout subagent that reads
 * files and ranks relevant excerpts. Results are cached by query hash.
 */
export class ScoutRetrieval {
  private cache: RetrievalCache;
  private cwd: string;
  private scoutTimeoutMs: number;
  private defaultLimit: number;

  constructor(options: ScoutRetrievalOptions) {
    this.cwd = options.cwd;
    this.scoutTimeoutMs = options.scoutTimeoutMs ?? DEFAULT_SCOUT_TIMEOUT_MS;
    this.defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;

    const cacheFilePath = path.join(options.cwd, DEFAULT_CACHE_PATH);
    this.cache = new RetrievalCache(cacheFilePath, options.cacheTtlMs);
  }

  /**
   * Search knowledge using the scout subagent.
   * Checks cache first; on miss, spawns a scout to search files.
   *
   * @param query  — search query string
   * @param scope  — search scope (task | project | domain)
   * @param limit  — maximum number of results (optional)
   * @param taskId — task identifier (required when scope is "task")
   * @returns search response with results
   */
  async searchKnowledge(
    query: string,
    scope: Scope,
    limit?: number,
    taskId?: string,
  ): Promise<SearchKnowledgeResponse> {
    const startTime = Date.now();
    const effectiveLimit = limit ?? this.defaultLimit;
    const normalizedQuery = query.trim().toLowerCase();
    const queryHash = this.computeQueryHash(normalizedQuery, scope);

    // 1. Check cache
    const cached = this.cache.get(queryHash);
    if (cached) {
      return {
        ...cached,
        cached: true,
        execution_time_ms: Date.now() - startTime,
      };
    }

    // 2. Build file manifest for the scope
    const fileManifest = this.buildFileManifest(scope, taskId);

    if (fileManifest.length === 0) {
      return {
        query,
        scope,
        results: [],
        cached: false,
        execution_time_ms: Date.now() - startTime,
      };
    }

    // 3. Spawn scout subagent
    let results: SearchResult[] = [];
    try {
      const report = await this.spawnScoutSearch(normalizedQuery, fileManifest, effectiveLimit);
      results = report.results;
    } catch (err) {
      // On failure: retry once with simplified prompt
      logger.warn("scout-retrieval", `Scout search failed, retrying with simplified prompt: query="${normalizedQuery}"`, err);
      try {
        const retryReport = await this.spawnScoutSearch(
          normalizedQuery,
          fileManifest,
          effectiveLimit,
          true, // simplified
        );
        results = retryReport.results;
      } catch (retryErr) {
        // Retry also failed — return empty results
        logger.error("scout-retrieval", `Scout search retry also failed: query="${normalizedQuery}"`, retryErr);
        results = [];
      }
    }

    const response: SearchKnowledgeResponse = {
      query,
      scope,
      results,
      cached: false,
      execution_time_ms: Date.now() - startTime,
    };

    // 4. Store in cache
    this.cache.set(queryHash, response);

    return response;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Compute SHA-256 hash of normalized query + scope.
   * Used as cache key.
   */
  private computeQueryHash(query: string, scope: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(`${query}::${scope}`);
    return hash.digest("hex");
  }

  /**
   * Build a file manifest for the given scope.
   * Returns absolute paths to all searchable files.
   */
  private buildFileManifest(scope: Scope, taskId?: string): string[] {
    return resolveSearchPaths(this.cwd, scope, taskId);
  }

  /**
   * Spawn a scout subagent to perform the search.
   * Accepts an optional spawn function for testability.
   *
   * @param query         — normalized search query
   * @param fileManifest  — list of files to search
   * @param limit         — max results
   * @param simplified    — if true, use a simplified prompt (for retries)
   * @param spawnFn       — optional spawn function override (for testing)
   * @returns scout search report with parsed results
   */
  private async spawnScoutSearch(
    query: string,
    fileManifest: string[],
    limit: number,
    simplified: boolean = false,
    spawnFn?: (spec: ScoutSearchSpec) => Promise<SubagentResult>,
  ): Promise<ScoutSearchReport> {
    const spec = this.buildScoutSearchSpec(query, fileManifest, limit, simplified);

    const doSpawn = spawnFn ?? spawnSubagent;
    // Scout search uses the same shape as WorkerSpec (BaseSpec fields only)
    const result = await doSpawn(spec as unknown as import("../subagent/specs").WorkerSpec);

    if (result.exitCode !== 0) {
      throw new Error(`Scout subagent exited with code ${result.exitCode}: ${result.stderr}`);
    }

    // Extract final assistant message
    const rawOutput = this.extractAssistantOutput(result);
    const results = this.parseScoutReport(rawOutput);

    return { results, rawOutput };
  }

  /**
   * Parse and validate scout JSON output.
   * Returns empty array on invalid output.
   */
  private parseScoutReport(output: string): SearchResult[] {
    // Try to extract JSON array from the output
    let jsonText = output.trim();

    // Handle markdown code blocks
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    // Find the JSON array if embedded in other text
    const arrayStart = jsonText.indexOf("[");
    const arrayEnd = jsonText.lastIndexOf("]");
    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
      return [];
    }
    jsonText = jsonText.slice(arrayStart, arrayEnd + 1);

    try {
      const parsed = JSON.parse(jsonText) as unknown[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      // Validate each result against schema
      const validated: SearchResult[] = [];
      for (const item of parsed) {
        if (this.isValidSearchResult(item)) {
          validated.push(item as SearchResult);
        }
      }

      // Sort by rank ascending
      validated.sort((a, b) => a.rank - b.rank);

      return validated;
    } catch (err) {
      logger.warn("scout-retrieval", `Failed to parse scout JSON output, returning empty results. Raw output length: ${output.length}`, err);
    }
  }

  /**
   * Type guard to validate a parsed object matches SearchResult schema.
   */
  private isValidSearchResult(obj: unknown): boolean {
    if (typeof obj !== "object" || obj === null) {
      return false;
    }

    const r = obj as Record<string, unknown>;

    // Check required fields
    if (typeof r.rank !== "number" || r.rank < 1 || !Number.isInteger(r.rank)) {
      return false;
    }
    if (typeof r.source_path !== "string" || r.source_path.length === 0) {
      return false;
    }
    if (typeof r.excerpt !== "string" || r.excerpt.length > 500) {
      return false;
    }
    if (
      typeof r.relevance_score !== "number" ||
      r.relevance_score < 0 ||
      r.relevance_score > 1
    ) {
      return false;
    }
    if (typeof r.reasoning !== "string" || r.reasoning.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Build a scout search specification.
   */
  private buildScoutSearchSpec(
    query: string,
    fileManifest: string[],
    limit: number,
    simplified: boolean = false,
  ): ScoutSearchSpec {
    const systemPrompt = loadPrompt("subagent/prompts/scout-search");

    const fileList = fileManifest.map((p) => `- ${p}`).join("\n");

    const task = simplified
      ? this.buildSimplifiedTask(query, fileList, limit)
      : this.buildStandardTask(query, fileList, limit);

    return {
      name: `scout-search-${Date.now()}`,
      systemPrompt,
      task,
      cwd: this.cwd,
    };
  }

  /** Build the standard scout search task prompt. */
  private buildStandardTask(query: string, fileList: string, limit: number): string {
    return [
      `Search Query: "${query}"`,
      ``,
      `Files to search (${fileList.split("\n").length} files):`,
      fileList,
      ``,
      `Instructions:`,
      `1. Read each file in the list above completely (not just filenames).`,
      `2. Find excerpts that are relevant to the search query.`,
      `3. Rank results by relevance (1 = most relevant).`,
      `4. Return a JSON array of at most ${limit} SearchResult objects.`,
      `5. Each result must include: rank, source_path, excerpt (max 500 chars), relevance_score (0.0-1.0), reasoning.`,
      ``,
      `Output: Return ONLY a JSON array. No prose outside the JSON.`,
    ].join("\n");
  }

  /** Build a simplified task prompt for retry attempts. */
  private buildSimplifiedTask(query: string, fileList: string, limit: number): string {
    return [
      `QUERY: "${query}"`,
      ``,
      `FILES:`,
      fileList,
      ``,
      `Return JSON array (max ${limit} items):`,
      `[{"rank":1,"source_path":"...","excerpt":"...","relevance_score":0.9,"reasoning":"..."}]`,
    ].join("\n");
  }

  /**
   * Extract the final assistant text output from subagent result messages.
   */
  private extractAssistantOutput(result: SubagentResult): string {
    for (let i = result.messages.length - 1; i >= 0; i--) {
      const msg = result.messages[i];
      if (msg.role === "assistant") {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            return part.text;
          }
        }
      }
    }
    return "";
  }
}
