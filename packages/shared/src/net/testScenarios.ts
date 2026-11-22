import type { World } from "../core/world";

/**
 * Fixed, release-safe test scenarios (Story 2.10), like Story 1.11's `?stress`: the host's
 * `?scenario=net150` sends `scenario: "net150"` in the create options, and the server applies it at
 * the run start only when `ALLOW_TEST_SCENARIOS=1`. No free-form cheat is reachable.
 */
export const TEST_SCENARIOS = ["net150"] as const;
export type TestScenario = (typeof TEST_SCENARIOS)[number];

/**
 * `net150`, the 4-phone 4G test: wave 4 (4 × 40 = 160 Walkers, so the 150-alive cap is reached),
 * god mode so the team survives it. Everything else is normal: real spawns, AI and hits, Pistols.
 */
export const NET150_START_WAVE = 4;

export const isTestScenario = (v: unknown): v is TestScenario =>
  typeof v === "string" && (TEST_SCENARIOS as readonly string[]).includes(v);

/**
 * Sets a just-created World up for the scenario: god mode on, and the wave director's counter one
 * below the start wave, so its usual intro (`waves.firstWaveDelayS`) leads into that wave.
 */
export function applyTestScenario(world: World, scenario: TestScenario): void {
  switch (scenario) {
    case "net150":
      world.debug.godMode = true;
      world.waves.number = NET150_START_WAVE - 1;
      return;
  }
}
