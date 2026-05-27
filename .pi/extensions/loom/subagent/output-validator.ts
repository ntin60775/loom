/**
 * Subagent Output Validator — JSON Schema validation for subagent output
 *
 * Replaces regex-based markdown JSON extraction with schema-based validation
 * with fallback to old regex method.
 *
 * Invariant: INV-10 (model config in subagent-config.json, no hardcoded strings)
 */

import { logger } from "../shared/logger";

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data: T | null;
  errors: string[];
  method: "schema" | "regex_fallback" | "none";
}

/**
 * Extract JSON from subagent output text.
 * Tries direct JSON.parse first, then regex markdown extraction.
 */
function extractJson(text: string): { json: unknown; method: "direct" | "regex" } | null {
  // Try direct parse first
  try {
    const parsed = JSON.parse(text.trim());
    return { json: parsed, method: "direct" };
  } catch {
    // continue
  }

  // Try markdown code block extraction
  const mdMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
  if (mdMatch) {
    try {
      const parsed = JSON.parse(mdMatch[1]);
      return { json: parsed, method: "regex" };
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Validate subagent output against an expected JSON shape.
 *
 * @param output - Raw subagent text output
 * @param schemaValidator - Function that returns null if valid, or error message string
 * @param schemaName - Human-readable schema name for logging
 * @returns ValidationResult with parsed data and method used
 */
export function validateSubagentOutput<T = Record<string, unknown>>(
  output: string,
  schemaValidator: (data: unknown) => string | null,
  schemaName: string,
): ValidationResult<T> {
  const extracted = extractJson(output);

  if (!extracted) {
    return {
      valid: false,
      data: null,
      errors: ["No JSON found in subagent output"],
      method: "none",
    };
  }

  const { json, method } = extracted;

  // Try schema validation
  const schemaError = schemaValidator(json);
  if (schemaError === null) {
    return {
      valid: true,
      data: json as T,
      errors: [],
      method: "schema",
    };
  }

  // Schema validation failed
  logger.warn("output-validator", `Schema validation failed for ${schemaName}`, { error: schemaError, method });

  // If we used regex extraction and schema failed, try direct parse too (may have been missed)
  if (method === "regex") {
    const direct = extractJson(text.trim());
    if (direct && direct.method === "direct") {
      const directError = schemaValidator(direct.json);
      if (directError === null) {
        return {
          valid: true,
          data: direct.json as T,
          errors: [],
          method: "schema",
        };
      }
    }
  }

  // Fallback: return data with validation errors (caller decides)
  return {
    valid: false,
    data: json as T,
    errors: [schemaError],
    method: "regex_fallback",
  };
}

/**
 * Worker output validator — validates that worker output is a non-empty string.
 * Workers produce unstructured text, so validation is minimal.
 */
export function validateWorkerOutput(output: string): ValidationResult<string> {
  if (!output || output.trim().length === 0) {
    return {
      valid: false,
      data: null,
      errors: ["Worker produced empty output"],
      method: "none",
    };
  }

  return {
    valid: true,
    data: output,
    errors: [],
    method: "schema",
  };
}

/**
 * Review output schema validator — checks required review JSON fields.
 */
export function validateReviewOutput(data: unknown): string | null {
  if (!data || typeof data !== "object") return "Review output is not an object";
  const obj = data as Record<string, unknown>;

  if (!("verdict" in obj)) return "Missing required field: verdict";
  if (!["approve", "reject", "needs_discussion"].includes(obj.verdict as string)) {
    return `Invalid verdict: ${obj.verdict}`;
  }

  if (!("findings" in obj) || !Array.isArray(obj.findings)) {
    return "Missing or invalid findings array";
  }

  for (const finding of obj.findings as Array<Record<string, unknown>>) {
    if (typeof finding !== "object" || !finding) return "Finding is not an object";
    if (!("severity" in finding)) return "Finding missing severity";
    if (!("message" in finding)) return "Finding missing message";
  }

  return null;
}
