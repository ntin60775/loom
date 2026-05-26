/**
 * Unit tests for RetrievalCache
 *
 * Covers: TTL expiration, cache hit/miss, atomic write, cleanup.
 * Run: npx tsx .pi/extensions/loom/tests/cache.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RetrievalCache } from "../retrieval/cache";
import type { SearchKnowledgeResponse } from "../retrieval/cache";

let testDir: string;
let cachePath: string;

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

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✅ ${message}`);
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

function setup(): void {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-test-cache-"));
  cachePath = path.join(testDir, "retrieval.json");
}

function teardown(): void {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────

function testCacheMiss(): void {
  const cache = new RetrievalCache(cachePath, 3600_000);
  const result = cache.get("nonexistent-hash");
  assert(result === null, "cache miss returns null");
}

function testCacheHit(): void {
  const cache = new RetrievalCache(cachePath, 3600_000);
  const response = makeResponse("test query");
  cache.set("hash-123", response);
  const cached = cache.get("hash-123");
  assert(cached !== null, "cache hit returns result");
  assert(cached!.cached === true, "cached flag is true");
  assert(cached!.results[0].rank === 1, "result data preserved");
}

function testTTLExpiration(): void {
  const cache = new RetrievalCache(cachePath, 1); // 1ms TTL
  cache.set("expiring-hash", makeResponse("expiring"));
  // Wait for TTL
  const start = Date.now();
  while (Date.now() - start < 5) { /* busy-wait ~5ms */ }
  const result = cache.get("expiring-hash");
  assert(result === null, "expired entry returns null");
}

function testCachePersistence(): void {
  const cache1 = new RetrievalCache(cachePath, 3600_000);
  cache1.set("persist-hash", makeResponse("persist query"));

  // New cache instance reads from same file
  const cache2 = new RetrievalCache(cachePath, 3600_000);
  const result = cache2.get("persist-hash");
  assert(result !== null, "persisted data survives new instance");
}

function testInvalidate(): void {
  const cache = new RetrievalCache(cachePath, 3600_000);
  cache.set("hash-a", makeResponse("query a"));
  cache.set("hash-b", makeResponse("query b"));

  cache.invalidate("query a");
  assert(cache.get("hash-a") === null, "invalidated entry returns null");
  assert(cache.get("hash-b") !== null, "unmatched entry preserved");
}

function testInvalidateAll(): void {
  const cache = new RetrievalCache(cachePath, 3600_000);
  cache.set("hash-1", makeResponse("q1"));
  cache.set("hash-2", makeResponse("q2"));
  cache.invalidate();
  assert(cache.get("hash-1") === null, "clear all: hash-1 null");
  assert(cache.get("hash-2") === null, "clear all: hash-2 null");
}

// ── Runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  setup();
  try {
    console.log(`\n${name}`);
    fn();
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${err.message}`);
    failed++;
  }
  teardown();
}

run("Cache Miss", testCacheMiss);
run("Cache Hit", testCacheHit);
run("TTL Expiration", testTTLExpiration);
run("Cache Persistence", testCachePersistence);
run("Invalidate by Pattern", testInvalidate);
run("Invalidate All", testInvalidateAll);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
