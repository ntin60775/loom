/**
 * Scope Filter — search path resolution and file inclusion rules
 *
 * Defines three search scopes:
 *   "task"     — knowledge for a specific task only
 *   "project"  — project-level knowledge (rules, schemas, configs)
 *   "domain"   — all knowledge + loom extension source
 *
 * Invariants:
 *   INV-2: Retrieval via scout subagent, not embeddings
 *   INV-4: Deterministic context assembly
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Search scope — controls breadth of knowledge search */
export type Scope = "task" | "project" | "domain";

/** Maximum file size in bytes — files larger than this are excluded */
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100KB

/** Directory names that are always excluded from search */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
]);

/** File patterns that are always excluded from search */
const EXCLUDED_PATTERNS = [
  /\.lock$/,           // *.lock files
  /package-lock\.json/, // npm lock file
];

/**
 * Resolve search paths for a given scope.
 *
 * @param cwd      — project root directory
 * @param scope    — search scope (task | project | domain)
 * @param taskId   — required when scope is "task"
 * @returns array of absolute file paths matching the scope
 */
export function resolveSearchPaths(cwd: string, scope: Scope, taskId?: string): string[] {
  const knowledgeDir = path.join(cwd, "knowledge");
  const extensionDir = path.join(cwd, ".pi", "extensions", "loom");

  const patterns: string[] = [];

  switch (scope) {
    case "task": {
      if (!taskId) {
        throw new Error('Scope "task" requires a taskId parameter');
      }
      const taskDir = path.join(knowledgeDir, "tasks", taskId);
      if (!fs.existsSync(taskDir)) {
        return [];
      }
      collectFiles(taskDir, patterns);
      break;
    }

    case "project": {
      const projectDir = path.join(knowledgeDir, "project");
      if (!fs.existsSync(projectDir)) {
        return [];
      }
      collectFiles(projectDir, patterns);
      break;
    }

    case "domain": {
      if (fs.existsSync(knowledgeDir)) {
        collectFiles(knowledgeDir, patterns);
      }
      if (fs.existsSync(extensionDir)) {
        collectFiles(extensionDir, patterns);
      }
      break;
    }

    default: {
      const _exhaustive: never = scope;
      throw new Error(`Unknown scope: ${_exhaustive}`);
    }
  }

  return patterns.filter(shouldIncludeFile);
}

/**
 * Recursively collect files from a directory.
 * Only includes .json and .md files.
 *
 * @param dir     — directory to scan
 * @param out     — accumulator array for file paths
 */
function collectFiles(dir: string, out: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      collectFiles(fullPath, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ext === ".json" || ext === ".md") {
        out.push(fullPath);
      }
    }
  }
}

/**
 * Determine whether a file should be included in search.
 * Checks exclusions (build artifacts, secrets, large binaries).
 *
 * @param filePath — absolute or relative file path
 * @returns true if the file should be included
 */
export function shouldIncludeFile(filePath: string): boolean {
  // Check excluded directory segments
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) {
      return false;
    }
  }

  // Check excluded patterns
  const basename = path.basename(filePath);
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(basename)) {
      return false;
    }
  }

  // Check file size
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      return false;
    }
  } catch {
    // If we cannot stat the file, exclude it
    return false;
  }

  return true;
}
