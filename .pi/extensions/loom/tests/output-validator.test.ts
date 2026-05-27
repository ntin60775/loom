/**
 * Tests for subagent/output-validator.ts
 */
import { describe, it, expect } from "vitest";
import {
  validateSubagentOutput,
  validateWorkerOutput,
  validateReviewOutput,
} from "../subagent/output-validator";

describe("Output Validator", () => {
  describe("validateSubagentOutput", () => {
    const alwaysValid = () => null;
    const alwaysInvalid = () => "always fails";

    it("parses direct JSON and validates with schema", () => {
      const output = `{"verdict": "approve", "findings": []}`;
      const result = validateSubagentOutput(output, alwaysValid, "test");
      expect(result.valid).toBe(true);
      expect(result.method).toBe("schema");
      expect(result.data).toEqual({ verdict: "approve", findings: [] });
    });

    it("parses markdown JSON block and validates with schema", () => {
      const output = 'Some text\n```json\n{"verdict": "approve", "findings": []}\n```\nMore text';
      const result = validateSubagentOutput(output, alwaysValid, "test");
      expect(result.valid).toBe(true);
      expect(result.method).toBe("schema");
    });

    it("returns invalid when no JSON found", () => {
      const result = validateSubagentOutput("no json here", alwaysValid, "test");
      expect(result.valid).toBe(false);
      expect(result.method).toBe("none");
      expect(result.data).toBeNull();
    });

    it("returns regex_fallback when schema validation fails but JSON exists", () => {
      const output = `{"not_valid": true}`;
      const result = validateSubagentOutput(output, alwaysInvalid, "test");
      expect(result.valid).toBe(false);
      expect(result.method).toBe("regex_fallback");
      expect(result.data).toEqual({ not_valid: true });
      expect(result.errors).toContain("always fails");
    });

    it("handles empty output", () => {
      const result = validateSubagentOutput("", alwaysValid, "test");
      expect(result.valid).toBe(false);
      expect(result.method).toBe("none");
    });
  });

  describe("validateWorkerOutput", () => {
    it("accepts non-empty output", () => {
      const result = validateWorkerOutput("Worker did something");
      expect(result.valid).toBe(true);
    });

    it("rejects empty output", () => {
      const result = validateWorkerOutput("  ");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateReviewOutput", () => {
    it("accepts valid review JSON", () => {
      const data = {
        verdict: "approve",
        commit: "abc123",
        step_number: 1,
        findings: [{ severity: "note", message: "Looks good" }],
        reviewed_at: "2026-01-01",
      };
      expect(validateReviewOutput(data)).toBeNull();
    });

    it("rejects missing verdict", () => {
      expect(validateReviewOutput({ findings: [] })).toContain("verdict");
    });

    it("rejects invalid verdict", () => {
      expect(validateReviewOutput({ verdict: "maybe", findings: [] })).toContain("Invalid verdict");
    });

    it("rejects missing findings", () => {
      expect(validateReviewOutput({ verdict: "approve" })).toContain("findings");
    });

    it("rejects non-array findings", () => {
      expect(validateReviewOutput({ verdict: "approve", findings: "not-array" })).toContain("findings");
    });

    it("rejects finding without severity", () => {
      expect(validateReviewOutput({
        verdict: "approve",
        findings: [{ message: "ok" }],
      })).toContain("severity");
    });
  });
});
