/**
 * Retrieval Cache — TTL-based caching layer for search results
 *
 * Invariants:
 *   INV-7: Cache results by query_hash to avoid redundant subagent spawns
 *   INV-4: Deterministic context — cache is file-backed and explicit
 *
 * Cache file: knowledge/project/cache/retrieval.json
 * Uses atomic writes (temp file + rename) to prevent corruption.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../../shared/logger";

/** Single cached entry */
export interface CacheEntry {
  query_hash: string;
  query: string;
  scope: string;
  response: SearchKnowledgeResponse;
  created_at: string; // ISO 8601
  expires_at: string; // ISO 8601
}

/** Response structure for knowledge search */
export interface SearchKnowledgeResponse {
  query: string;
  scope: string;
  results: SearchResult[];
  cached: boolean;
  execution_time_ms: number;
}

/** Individual search result */
export interface SearchResult {
  rank: number;
  source_path: string;
  excerpt: string;
  relevance_score: number;
  reasoning: string;
}

/** Default TTL: 1 hour in milliseconds */
const DEFAULT_TTL_MS = 3600_000;

/**
 * Cache for search results with TTL-based expiration.
 * Persists to a JSON file using atomic writes.
 */
export class RetrievalCache {
  private cacheFilePath: string;
  private ttlMs: number;

  /**
   * @param cacheFilePath — absolute path to the cache JSON file
   * @param ttlMs         — time-to-live in milliseconds (default: 1 hour)
   */
  constructor(cacheFilePath: string, ttlMs: number = DEFAULT_TTL_MS) {
    this.cacheFilePath = cacheFilePath;
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieve a cached response by query hash.
   * Returns null if not found or expired.
   *
   * @param queryHash — SHA-256 hash of normalized query + scope
   * @returns cached response or null
   */
  get(queryHash: string): SearchKnowledgeResponse | null {
    const entries = this.load();
    const entry = entries.find((e) => e.query_hash === queryHash);

    if (!entry) {
      return null;
    }

    const now = new Date().toISOString();
    if (now > entry.expires_at) {
      // Entry expired — remove it
      const filtered = entries.filter((e) => e.query_hash !== queryHash);
      this.save(filtered);
      return null;
    }

    // Return with cached flag set to true
    return {
      ...entry.response,
      cached: true,
    };
  }

  /**
   * Store a response in the cache.
   *
   * @param queryHash — SHA-256 hash of normalized query + scope
   * @param response  — search response to cache
   */
  set(queryHash: string, response: SearchKnowledgeResponse): void {
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.ttlMs).toISOString();

    const entries = this.load();

    // Remove existing entry with same hash (if any)
    const filtered = entries.filter((e) => e.query_hash !== queryHash);

    const newEntry: CacheEntry = {
      query_hash: queryHash,
      query: response.query,
      scope: response.scope,
      response: {
        ...response,
        cached: false, // stored value has cached=false; get() flips to true
      },
      created_at: createdAt,
      expires_at: expiresAt,
    };

    filtered.push(newEntry);
    this.save(filtered);
  }

  /**
   * Invalidate cached entries matching a pattern.
   * If no pattern is provided, clears the entire cache.
   *
   * @param pattern — optional string/regex pattern to match against query
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      // Clear all entries
      this.save([]);
      return;
    }

    const entries = this.load();
    const regex = new RegExp(pattern, "i");
    const filtered = entries.filter((e) => !regex.test(e.query));
    this.save(filtered);
  }

  /** Load entries from cache file. Returns empty array on any error. */
  private load(): CacheEntry[] {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return [];
      }
      const data = fs.readFileSync(this.cacheFilePath, "utf-8");
      const entries = JSON.parse(data) as CacheEntry[];
      if (!Array.isArray(entries)) {
        return [];
      }
      return this.cleanup(entries);
    } catch (err) {
      // Corrupted or unreadable cache — start fresh
      logger.warn("cache", `Failed to load cache file ${this.cacheFilePath}, starting fresh`, err);
      return [];
    }
  }

  /**
   * Save entries to cache file using atomic write.
   * Writes to a temp file first, then renames.
   */
  private save(entries: CacheEntry[]): void {
    const dir = path.dirname(this.cacheFilePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.cacheFilePath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.cacheFilePath);
    } catch (err) {
      // Clean up temp file on failure
      logger.warn("cache", `Failed atomic cache write to ${this.cacheFilePath}`, err);
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup error
        logger.debug("cache", `Failed to unlink temp cache file ${tmpPath}`);
      }
    }
  }

  /**
   * Remove expired entries from the cache.
   * Called on every load to prevent cache bloat.
   */
  private cleanup(entries: CacheEntry[]): CacheEntry[] {
    const now = new Date().toISOString();
    const valid = entries.filter((e) => e.expires_at > now);

    // If we removed any entries, persist the cleaned list
    if (valid.length < entries.length) {
      this.save(valid);
    }

    return valid;
  }
}
