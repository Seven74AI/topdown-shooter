import type { World } from "../core/world";
import type { PlayerState } from "./player";
import { bossSlotOf, clearBossThreatSlot } from "../boss/target";
import { claimFlameSlot, releaseFlameSlot } from "../combat/flame";
import { placeNextToTeammate } from "./downed";

/**
 * Story 8.1 (FR73, Epic 8 D2/D3): a dropped (or quiet, decision 8.1 D1) player is HELD: their
 * `PlayerState` leaves `world.players` for `world.heldPlayers`, so every system that loops over
 * `world.players` (targeting, AI, damage, revive, the wipe check, boss, events, aim assist, turret
 * targets) ignores them without knowing about holds ("detach, don't add a fourth status"). Only the
 * pay path (`economy.earn`, F5) also looks in `heldPlayers`.
 *
 * Hold, field by field (the round-trip test in hold.test.ts lists every PlayerState field):
 * - F1: `downed` becomes `out` (no free revive): the downed countdown and revive fields are cleared.
 * - F2: everything else is kept exactly (HP, wallet, earned, weapons and levels, ammo, gear,
 *   consumables, the stored card offer and rerolls in `world.shop`), except a reload in progress
 *   (starts over), a Brute knockback and the flame burst edge (transient), the build-phase Ready and
 *   the evacuation vote (silent, 6.11 D1): both are "pressed while gone" (F7).
 * - What `removePlayer` does to the boss threat slot (6.5 F7) and the flame slot (5.4): the slot
 *   frees, so the survivor NPC's leader and the crate claim (Epic 6, keyed by slot) drop too.
 * - Their inputs are dropped (F7: nothing pressed offline happens late).
 *
 * Deterministic: the server decides hold and return at a tick (between steps) and the replay log
 * records both (`replay/inputLog.ts`, kinds "hold" / "return"). Returns false for an unknown or
 * already held id.
 */
export function holdPlayer(world: World, id: string): boolean {
  const p = world.players.get(id);
  if (!p) return false;
  clearBossThreatSlot(world, bossSlotOf(world, id)); // the Behemoth switches target at once
  releaseFlameSlot(world, id);
  p.flameSlot = 255;
  if (p.status === "downed") {
    p.status = "out"; // F1
    p.downedTicksLeft = 0;
  }
  p.reviveTicks = 0;
  p.reviverId = null;
  p.reviveNeedTicks = 0;
  for (const s of p.loadout.slots) if (s) s.reloadTicks = 0; // a reload in progress starts over
  p.knockTicks = 0;
  p.knockDx = 0;
  p.knockDy = 0;
  p.knockStepMm = 0;
  p.flaming = false;
  p.buildReady = false;
  p.vote = 0;
  p.protectTicks = 0;
  world.players.delete(id);
  world.pendingInputs.delete(id);
  world.inputs.delete(id);
  world.lastAppliedSeq.delete(id);
  world.heldPlayers.set(id, { player: p, buildIdx: buildStartIndex(world), atTick: world.tick });
  return true;
}

/**
 * Review H1: how many build starts the run has had — `waves.number` counts a wave at its START, so
 * during a build phase (which leads into wave N + 1) one more build start has happened than the
 * wave number says. A held player missed a build start iff this grew while they were held.
 */
export function buildStartIndex(world: Readonly<World>): number {
  return world.waves.number + (world.run.phase === "build" ? 1 : 0);
}

/**
 * Story 8.1: puts a held player back (F2: as held). Placement (F4): mid-wave next to the
 * lowest-slot standing teammate (`placeNextToTeammate`, the build-start spot rule) with
 * `returnProtectTicks` of spawn protection (decision 8.1 D3) — review M1 / decision 8.1 B15: at
 * most ONCE per player per wave, and only after a hold of at least `returnMinHoldTicks` (3 s);
 * any other mid-wave return lands where they vanished (their last server position), unprotected
 * (a reload or a socket loop is never an escape or an invulnerability). In a build phase (or with
 * nobody standing) where they were. A build start they missed while held is applied to them now
 * (`catchUpBuildStart`: the same heal, return of an out player, and per-build clocks as
 * `startBuild`); an `out` player returning mid-wave stays out until the next build start (F1).
 * Returns false for an id that is not held.
 */
export function returnPlayer(world: World, id: string): boolean {
  const h = world.heldPlayers.get(id);
  if (!h || world.players.has(id)) return false;
  world.heldPlayers.delete(id);
  const p = h.player;
  const phase = world.run.phase;
  if (buildStartIndex(world) > h.buildIdx) catchUpBuildStart(world, p); // review H1: only a build start really missed
  const stats = world.balance.player;
  const longHold = world.tick - h.atTick >= stats.returnMinHoldTicks;
  if (phase === "wave" && p.status === "alive" && longHold && p.protectedReturnWave !== world.waves.number) {
    p.protectedReturnWave = world.waves.number; // B15: once per wave
    placeNextToTeammate(world, p); // nobody standing: where they were
    p.protectTicks = stats.returnProtectTicks;
  }
  world.players.set(id, p);
  claimFlameSlot(world, p);
  return true;
}

/**
 * The parts of `startBuild` that touch one player (Story 3.1 heal and return, 5.4 / 5.6 clocks),
 * for a player who was held across a build start. The card offer is drawn on demand
 * (`shopCards.ensureOffer`), the Ready flags were cleared at the hold.
 */
function catchUpBuildStart(world: World, p: PlayerState): void {
  const stats = world.balance.player;
  p.acidTicks = 0;
  p.flameClock.fill(0);
  if (p.status === "alive") {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * stats.buildHealFrac);
    return;
  }
  // Out (or downed, never kept by a hold): standing again next to a teammate, like returnOutPlayers.
  if (!placeNextToTeammate(world, p)) return; // nobody standing: stays out (the run is wiping)
  p.hp = Math.min(p.maxHp, p.maxHp * stats.buildHealFrac);
  p.status = "alive";
  p.downedTicksLeft = 0;
  world.events.emit({ type: "player.returned", playerId: p.id, x: p.x, y: p.y });
}

/** Story 8.1: true when `id` is on hold. */
export function isHeld(world: Readonly<World>, id: string): boolean {
  return world.heldPlayers.has(id);
}

/**
 * Story 8.1 (F8, Epic 8 D4): the hold ran out (or the player left for good while held): the held
 * state leaves the World and is returned to the caller (the room remembers the seat). Their
 * buildings stay and pay nobody from now on (F5). Null for an id that is not held.
 */
export function releaseHeldPlayer(world: World, id: string): { player: PlayerState; buildIdx: number } | null {
  const h = world.heldPlayers.get(id);
  if (!h) return null;
  world.heldPlayers.delete(id);
  return { player: h.player, buildIdx: h.buildIdx }; // review H2: the remembered seat keeps its build-start index
}

/**
 * Story 8.1 (F8): a remembered seat comes back (a build phase only; the room checks): it re-enters
 * as held at this tick with the build-start index it was held at (review H2: a Leave and a rejoin
 * in the same build is no build start) and `returnPlayer` places it. False if the id is in the World already.
 */
export function restoreSeat(world: World, p: PlayerState, buildIdx: number): boolean {
  if (world.players.has(p.id) || world.heldPlayers.has(p.id)) return false;
  world.heldPlayers.set(p.id, { player: p, buildIdx, atTick: world.tick }); // review H2: the seat's own build-start index
  return returnPlayer(world, p.id);
}
