import { configDefaults, defineConfig } from "vitest/config";

/** Every test file. Only the two projects below use it, so `npm test` (both projects) runs every file exactly once. */
const INCLUDE = ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tools/**/*.test.ts"];
const ROOTS = ["packages/*/src", "apps/*/src", "tools"];

/**
 * The `slow` project (designer 2026-11-25, CI speed-up item 6): fuzzes, whole-run sims, bot / netsim / netaudit
 * tools, browser DOM checks, tick-cost, event spots and replay. Everything else is `unit` (`npm run test:fast`).
 * Each glob sits under an INCLUDE root, so `slow` ⊆ INCLUDE and `unit` = INCLUDE minus `slow`.
 */
export const SLOW = [
  ...ROOTS.flatMap((r) => [
    `${r}/**/*.fuzz.test.ts`,
    `${r}/**/*Sim.test.ts`,
    `${r}/**/*DomLayout.test.ts`,
    `${r}/**/tickCost*.test.ts`,
    `${r}/**/events/spots.test.ts`,
    `${r}/**/replay/**/*.test.ts`,
  ]),
  "tools/bots/**/*.test.ts",
  "tools/netsim/**/*.test.ts",
  "tools/netaudit/**/*.test.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    // Whole-run sims, replays and tick-cost tests take 1–3 s alone but time out at the 5 s default
    // when parallel builders load the shared box (load 8–16). Timing asserts stay behind PERF_ASSERT=1.
    testTimeout: 30_000,
    // VITEST_MAX_WORKERS=2–3 when several sessions share one box (HANDOFF §3); a --maxWorkers flag still wins.
    ...(process.env.VITEST_MAX_WORKERS ? { maxWorkers: Number(process.env.VITEST_MAX_WORKERS) } : {}),
    projects: [
      { extends: true, test: { name: "unit", include: INCLUDE, exclude: [...configDefaults.exclude, ...SLOW] } },
      { extends: true, test: { name: "slow", include: SLOW } },
    ],
  },
});
