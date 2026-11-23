import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
    // Whole-run sims, replays and tick-cost tests take 1–3 s alone but time out at the 5 s default
    // when parallel builders load the shared box (load 8–16). Timing asserts stay behind PERF_ASSERT=1.
    testTimeout: 30_000,
  },
});
