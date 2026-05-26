import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  test: {
    // Test file patterns
    include: [".pi/extensions/loom/**/*.test.ts"],
    exclude: ["node_modules", "dist"],

    // Environment
    environment: "node",

    // Timeouts
    testTimeout: 10_000,
    hookTimeout: 10_000,

    // Coverage (v8 provider, fast)
    coverage: {
      provider: "v8",
      include: [".pi/extensions/loom/**/*.ts"],
      exclude: [
        ".pi/extensions/loom/**/*.test.ts",
        ".pi/extensions/loom/**/prompts/*.md",
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
      reporter: ["text", "lcov"],
    },

    // Setup file
    setupFiles: [".pi/extensions/loom/tests/setup.ts"],
  },
});
