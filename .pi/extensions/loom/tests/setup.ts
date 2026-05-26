/**
 * Test Setup — global beforeAll/afterAll hooks for vitest
 *
 * - Creates temp directories for file-backed tests
 * - Cleans up after all tests
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const TEST_ROOT = path.join(os.tmpdir(), "loom-test-" + Date.now());

beforeAll(() => {
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort
  }
});

/** Get a fresh temp directory for a test suite */
export function testDir(name: string): string {
  const dir = path.join(TEST_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a minimal knowledge/ structure for testing */
export function setupTestKnowledge(baseDir: string): string {
  const knowledge = path.join(baseDir, "knowledge");
  fs.mkdirSync(path.join(knowledge, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(knowledge, "project", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(knowledge, "project", "configs"), { recursive: true });
  fs.mkdirSync(path.join(knowledge, "project", "rules"), { recursive: true });
  fs.mkdirSync(path.join(knowledge, "project", "architecture", "components"), { recursive: true });
  fs.mkdirSync(path.join(knowledge, "project", "memory"), { recursive: true });
  return knowledge;
}
