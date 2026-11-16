import { defineConfig } from "vitest/config";

const live = process.env["LIVE"] === "1";

export default defineConfig({
  test: {
    include: live
      ? ["test/live/**/*.test.ts"]
      : ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    testTimeout: live ? 60_000 : 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli/**",
        "src/demo/**",
        "src/index.ts",
        "src/payment/x402-concordium.ts",
        "src/**/*.d.ts",
      ],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
