import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "html", "json-summary"],
    include: ["src/**/*.ts"],
    exclude: [
      "src/**/*.test.ts",
      "src/index.ts",
    ],
    thresholds: {
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
    },
  },
});
