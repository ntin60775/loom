/**
 * Tests: retrieval/cache.ts — TTL-based retrieval cache
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RetrievalCache } from "../retrieval/cache";
import type { SearchKnowledgeResponse } from "../retrieval/cache";

function makeResponse(query: string): SearchKnowledgeResponse {
  return {
    query,
    scope: "project",
    results: [
      { rank: 1, source_path: "/test/rule.json", excerpt: "Test excerpt", relevance_score: 0.9, reasoning: "Relevant" },
    ],
    cached: false,
    execution_time_ms: 100,
  };
}

describe("RetrievalCache", () => {
  let testDir: string;
  let cachePath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-cache-"));
    cachePath = path.join(testDir, "retrieval.json");
  });

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("returns null on cache miss", () => {
    const cache = new RetrievalCache(cachePath, 3600_000);
    expect(cache.get("nonexistent-hash")).toBeNull();
  });

  it("returns cached result on hit", () => {
    const cache = new RetrievalCache(cachePath, 3600_000);
    const response = makeResponse("test query");
    cache.set("hash-123", response);
    const cached = cache.get("hash-123");
    expect(cached).not.toBeNull();
    expect(cached!.cached).toBe(true);
    expect(cached!.results[0].rank).toBe(1);
  });

  it("expires entries after TTL", async () => {
    const cache = new RetrievalCache(cachePath, 1); // 1ms TTL
    cache.set("expiring-hash", makeResponse("expiring"));
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get("expiring-hash")).toBeNull();
  });

  it("persists data across instances", () => {
    const cache1 = new RetrievalCache(cachePath, 3600_000);
    cache1.set("persist-hash", makeResponse("persist query"));

    const cache2 = new RetrievalCache(cachePath, 3600_000);
    expect(cache2.get("persist-hash")).not.toBeNull();
  });

  it("invalidates by pattern", () => {
    const cache = new RetrievalCache(cachePath, 3600_000);
    cache.set("hash-a", makeResponse("query a"));
    cache.set("hash-b", makeResponse("query b"));
    cache.invalidate("query a");
    expect(cache.get("hash-a")).toBeNull();
    expect(cache.get("hash-b")).not.toBeNull();
  });

  it("invalidates all entries", () => {
    const cache = new RetrievalCache(cachePath, 3600_000);
    cache.set("hash-1", makeResponse("q1"));
    cache.set("hash-2", makeResponse("q2"));
    cache.invalidate();
    expect(cache.get("hash-1")).toBeNull();
    expect(cache.get("hash-2")).toBeNull();
  });

  it("handles missing cache file gracefully", () => {
    const nonExistentPath = path.join(testDir, "nonexistent", "cache.json");
    const cache = new RetrievalCache(nonExistentPath, 3600_000);
    expect(cache.get("any-hash")).toBeNull();
  });
});
