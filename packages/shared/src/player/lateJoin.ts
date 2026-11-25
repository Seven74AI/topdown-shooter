import type { World } from "../core/world";
import { addPlayer, type PlayerInit, type PlayerState } from "./player";
import { teamSpawnPoint } from "./spawn";
import { findFreeSpotNear, spotBlocked } from "./freeSpot";
import { addBuildTime } from "../run/runStateMachine";
import { ticksFor } from "../core/time";

const at = { x: 0, y: 0 };

/**
 * Story 8.2 (AC 1, J1, J5, J7; Epic 8 D6/D7): a late joiner enters a started run's World between
 * ticks, in a build phase only (a mid-wave joiner waits outside the World, J4). The survivor is added
 * at its slot's team spawn point (the first free spot round it when that is blocked by a body or a
 * building, like a build start's placement), with `wallet` (the server's `lateJoinWallet`, or a dev
 * override) instead of the normal start money; every other field is a fresh survivor's
 * (`addPlayer` defaults: Pistol, the `wavesIn` / `bossesIn` counters at 0 — J7). The first late
 * join of the build phase adds `lateJoin.extraBuildS` to the build timer (J5, E8-J4); `extend`
 * false skips it (a test or a caller that already extended). The card offer is drawn on demand
 * (`shopCards.ensureOffer`, stream `shop:<slot>:<n>`). Deterministic: the replay's "join" command
 * calls this with the same arguments. Returns null outside a build phase or for an id in the run.
 */
export function addLatePlayer(world: World, id: string, slot: number, wallet: number, init: PlayerInit = {}, extend = true): PlayerState | null {
  if (world.run.phase !== "build" || world.players.has(id) || world.heldPlayers.has(id)) return null;
  teamSpawnPoint(world, slot, at);
  const p = addPlayer(world, id, at.x, at.y, init);
  if (spotBlocked(world, p.x, p.y, p.radiusM, p) && findFreeSpotNear(world, at.x, at.y, p, at)) {
    p.x = at.x;
    p.y = at.y;
    p.prevX = at.x;
    p.prevY = at.y;
  }
  p.wallet = Math.max(0, Math.floor(wallet));
  if (extend) addBuildTime(world, ticksFor(world.balance.economy.lateJoin.extraBuildS));
  return p;
}
