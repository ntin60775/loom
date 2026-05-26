/**
 * Tests: shared/utils.ts — prompt loading, sanitizeId, getFinalOutput
 */

import { describe, it, expect } from "vitest";
import { sanitizeId, getFinalOutput } from "../shared/utils";

describe("sanitizeId", () => {
  it("keeps alphanumeric, dashes and underscores", () => {
    expect(sanitizeId("abc-123_test")).toBe("abc-123_test");
  });

  it("replaces unsafe characters with underscore", () => {
    expect(sanitizeId("rule:name with spaces")).toBe("rule_name_with_spaces");
  });

  it("replaces slashes", () => {
    expect(sanitizeId("path/to/file")).toBe("path_to_file");
  });

  it("replaces Russian characters", () => {
    // Cyrillic chars are not in [a-zA-Z0-9_-], so they get replaced with _
    // The dash '-' IS in the allowed set, so it's preserved
    expect(sanitizeId("правило-1")).toBe("_______-1");
  });

  it("handles empty string", () => {
    expect(sanitizeId("")).toBe("");
  });
});

describe("getFinalOutput", () => {
  const makeMsg = (role: string, text: string) => ({
    role,
    content: [{ type: "text" as const, text }],
  });

  it("returns last assistant message", () => {
    const messages = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "hi there"),
      makeMsg("assistant", "final answer"),
    ];
    expect(getFinalOutput(messages)).toBe("final answer");
  });

  it("returns empty string for no assistant messages", () => {
    const messages = [makeMsg("user", "hello")];
    expect(getFinalOutput(messages)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getFinalOutput([])).toBe("");
  });

  it("skips assistant messages without text content", () => {
    const messages = [
      { role: "assistant", content: [{ type: "image" as const }] },
      makeMsg("assistant", "real answer"),
    ];
    expect(getFinalOutput(messages)).toBe("real answer");
  });
});
