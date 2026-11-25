import type { World } from "../core/world";
import type { PlayerState } from "../player/player";

/**
 * Story 7.2 (AC 1, S2): the per-player "was I there" counters Supplies are paid from (`meta/supplies.ts`).
 *
 * A wave or a Behemoth counts for every player in the run when it happens: in `world.players` (alive, downed or out)
 * AND in 8.1's `world.heldPlayers` (a short drop or a quiet hold keeps counting). Not for a player who joined later
 * (8.2: their counters start at 0) or who left before (their state is gone, or remembered and frozen, 8.1 F8).
 *
 * - `countWaveEnded` — `wave.ended { number }` (economy system, beside the wave-clear money: one place for both);
 * - `countWipedWave` — `team.wiped` DURING a wave (decision 7.2 D8: the wave the team falls in counts; a wipe in a
 *   build phase adds nothing), called by `checkTeamWipe`, where the phase is still the wave's;
 * - `countBossKilled` — `boss.killed` (economy system), endless ones (killed in a wave past `runWaves`) counted apart.
 *
 * Module-level callbacks: no closure or iterator per call (these run once per wave, but keep the house rule).
 */
let endless = false;
const addWave = (p: PlayerState): void => {
  if (endless) p.endlessWavesIn = Math.min(0xffff, p.endlessWavesIn + 1);
  else p.wavesIn = Math.min(0xff, p.wavesIn + 1);
};
const addHeldWave = (h: { readonly player: PlayerState }): void => addWave(h.player);
const addBoss = (p: PlayerState): void => {
  p.bossesIn = Math.min(0xff, p.bossesIn + 1);
  if (endless) p.endlessBossesIn = Math.min(0xff, p.endlessBossesIn + 1);
};
const addHeldBoss = (h: { readonly player: PlayerState }): void => addBoss(h.player);

/** `wave.ended { number }`: +1 wave for everyone in the run (present or held). */
export function countWaveEnded(world: World, number: number): void {
  endless = number > world.balance.waves.runWaves;
  world.players.forEach(addWave);
  world.heldPlayers.forEach(addHeldWave);
}

/** `team.wiped` while the run is in phase "wave" (D8): the wave the team fell in counts once. Nothing in a build phase. */
export function countWipedWave(world: World): void {
  if (world.run.phase !== "wave") return;
  countWaveEnded(world, world.waves.number);
}

/**
 * `boss.killed`: +1 Behemoth for everyone in the run; one killed in an endless wave (the current wave > `runWaves`;
 * the event's `number` is the boss count, not the wave) also counts apart.
 */
export function countBossKilled(world: World): void {
  endless = world.waves.number > world.balance.waves.runWaves;
  world.players.forEach(addBoss);
  world.heldPlayers.forEach(addHeldBoss);
}
