/**
 * Test Setup — helper functions for file-backed tests
 *
 * No global hooks — use beforeEach/afterEach in individual test files.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** Get a fresh temp directory for a test suite */
export function testDir(name: string): string {
  const dir = path.join(os.tmpdir(), "loom-test-" + Date.now() + "-" + name);
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
