/**
 * Tests: subagent/model-resolver.ts — domain-aware model selection
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveModel, resolveModelArg } from "../subagent/model-resolver";
import type { AgentType } from "../subagent/model-resolver";
import { makeSubagentConfig } from "./fixtures";

describe("Model Resolver", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "loom-model-test-"));
    const configDir = path.join(cwd, "knowledge", "project", "configs");
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function writeConfig(config: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(cwd, "knowledge", "project", "configs", "subagent-config.json"),
      JSON.stringify(config),
    );
  }

  // ── resolveModel ──────────────────────────────────────────────────────

  describe("resolveModel", () => {
    it("returns null when no config exists", () => {
      const result = resolveModel("worker", "test task context", cwd);
      expect(result).toBeNull();
    });

    it("returns null when domains is missing", () => {
      writeConfig({ worker: {} });
      expect(resolveModel("worker", "test task", cwd)).toBeNull();
    });

    it("picks first domain as fallback for worker", () => {
      writeConfig(makeSubagentConfig());
      const result = resolveModel("worker", "test task", cwd);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("deepseek-chat");
    });

    it("matches worker by file extension", () => {
      writeConfig({
        domains: {
          general: { provider: "deepseek", model: "deepseek-chat" },
          onec: { provider: "onec", model: "onec-model" },
        },
        worker: {
          domain_rules: [
            { extension: ".bsl", domain: "onec" },
            { default: "general" },
          ],
        },
      });

      const result = resolveModel("worker", "edit file.bsl and config.json", cwd);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("onec-model");
    });

    it("falls back to default rule when no extension match", () => {
      writeConfig({
        domains: {
          general: { provider: "deepseek", model: "deepseek-chat" },
          onec: { provider: "onec", model: "onec-model" },
        },
        worker: {
          domain_rules: [
            { extension: ".bsl", domain: "onec" },
            { default: "general" },
          ],
        },
      });

      const result = resolveModel("worker", "edit file.ts", cwd);
      expect(result!.model).toBe("deepseek-chat");
    });

    it("reviewer uses thinking from config", () => {
      writeConfig(makeSubagentConfig({ reviewer: { thinking: "xhigh", domain_rules: [{ default: "general" }] } }));
      const result = resolveModel("reviewer", "review this", cwd);
      expect(result!.thinking).toBe("xhigh");
    });

    it("scout uses scout domain or fallback to general", () => {
      writeConfig(makeSubagentConfig());
      const result = resolveModel("scout", "analyze", cwd);
      expect(result).not.toBeNull();
      // scout domain not defined, falls back to first domain (general)
      expect(result!.model).toBe("deepseek-chat");
    });

    it("general type picks general domain", () => {
      writeConfig(makeSubagentConfig());
      const result = resolveModel("general", "research", cwd);
      expect(result!.model).toBe("deepseek-chat");
    });
  });

  // ── resolveModelArg ───────────────────────────────────────────────────

  describe("resolveModelArg", () => {
    it("returns formatted model:provider string", () => {
      writeConfig(makeSubagentConfig());
      const arg = resolveModelArg("worker", "test task", cwd);
      expect(arg).toMatch(/^deepseek:deepseek-chat$/);
    });

    it("returns undefined when no config", () => {
      const arg = resolveModelArg("worker", "test", cwd);
      expect(arg).toBeUndefined();
    });
  });
});
