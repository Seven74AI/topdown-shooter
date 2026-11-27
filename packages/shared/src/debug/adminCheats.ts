import type { World } from "../core/world";
import type { Building } from "../buildings/buildings";
import { setLoadout } from "../combat/loadout";
import { weaponIds, type WeaponId } from "../combat/weapons";
import { changeDecayStage } from "../decay/decaySystem";
import { setForcedBlackout } from "../decay/lightState";
import { forceEvent } from "../events/specialEvents";
import { startBossWarning } from "../boss/behemoth";
import { MAP_STAGE_COUNT } from "../map/districtMap";
import { CHEAT_SPAWN_MAX, CHEAT_SPAWN_MIN, type AdminCheat } from "../net/messages";
import { skipWave } from "../run/runStateMachine";
import { killZombie } from "../zombies/zombiePool";
import { spawnInView, spawnRing, type ViewRect } from "../zombies/spawnRing";

/**
 * Story 10.12: the cheat panel's world cheats, shared by the solo panel (client, Story 1.11) and the server's online
 * admin cheats (`applyAdminCheat`). Moved here from `apps/client/src/debug/devCheatActions.ts`. Debug numbers, not
 * gameplay balance (they never act in a clean run).
 */

/** Ring radius of "Spawn N around me", meters (inside the view on a phone in landscape). */
export const CHEAT_RING_RADIUS_M = 8;
/** "Leave last 5": the wave's last-5 rush (FR30) starts on the next tick. */
export const CHEAT_LEAVE_COUNT = 5;
/** Story 3.3: "+500 money" for shop checks. */
export const CHEAT_MONEY = 500;
/** Story 3.7: "Damage nearest building 50 %". */
export const CHEAT_BUILDING_DAMAGE = 0.5;
/** "Spawn in view" when the message carries no view: a phone-landscape view around the admin, meters. */
export const CHEAT_VIEW_W_M = 24;
export const CHEAT_VIEW_H_M = 13.5;

export const clampSpawnCount = (n: number): number =>
  Number.isFinite(n) ? Math.min(CHEAT_SPAWN_MAX, Math.max(CHEAT_SPAWN_MIN, Math.round(n))) : CHEAT_SPAWN_MIN;

/** Dev cheat: clears the wave's queue and kills wave zombies until `keep` are left (they then rush). */
export function leaveLast(world: World, keep: number): void {
  if (world.run.phase !== "wave") return;
  world.waves.queued = 0;
  const z = world.zombies;
  let waveAlive = 0;
  for (let i = 0; i < z.aliveCount; i++) if (z.waveZombie[z.aliveIds[i] as number] === 1) waveAlive++;
  for (let i = z.aliveCount - 1; i >= 0 && waveAlive > keep; i--) {
    const id = z.aliveIds[i] as number;
    if (z.waveZombie[id] !== 1) continue;
    killZombie(world, id, null, "cheat");
    waveAlive--;
  }
}

/**
 * Dev cheat (Story 3.7): takes `fraction` of its max HP from the building nearest to (x, y), never below 1 HP. Returns
 * the building, or null when none.
 */
export function damageNearestBuilding(world: World, x: number, y: number, fraction: number): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildings.list) {
    const d = ((b.minX + b.maxX) / 2 - x) ** 2 + ((b.minY + b.maxY) / 2 - y) ** 2; // box centre (works with any grid anchoring)
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best) best.hp = Math.max(1, best.hp - best.maxHp * fraction);
  return best;
}

/** Review L1 (Story 4.2): the decay stage cheat works only where a real stage change could happen (build phase, lobby). */
export function decayCheatAllowed(world: World): boolean {
  return world.run.phase === "build" || world.run.phase === "lobby";
}

/** The decay stage cheat (Story 4.2/4.5): the build-start decay path for stage 1–5; build phase only. Returns the stage in force. */
export function setDecayStageCheat(world: World, stage: number): number {
  if (!decayCheatAllowed(world)) return world.decay.stage;
  const s = Math.min(MAP_STAGE_COUNT, Math.max(1, Math.round(stage)));
  changeDecayStage(world, s);
  return world.decay.stage;
}

/** Scratch view for "Spawn in view" without a view (no allocation per cheat). */
const scratchView: ViewRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Story 10.12 (AC 3): applies one online admin cheat (already schema-checked) for `playerId`'s own survivor, on the
 * server's World, from the tick (B2). Returns true when it changed something ("used"), false when it could not apply
 * (no survivor, wrong phase, unknown weapon / zombie type): nothing happened. `restart` is the room's, never here.
 */
export function applyAdminCheat(world: World, playerId: string, cheat: AdminCheat): boolean {
  const p = world.players.get(playerId);
  switch (cheat.cheat) {
    case "spawn": {
      if (!p || world.balance.zombies.types[cheat.type] === undefined) return false;
      const n = clampSpawnCount(cheat.count);
      if (cheat.where === "ring") return spawnRing(world, cheat.type, n, p.x, p.y, CHEAT_RING_RADIUS_M) > 0;
      const v = cheat.view;
      if (v) {
        scratchView.x = v.x;
        scratchView.y = v.y;
        scratchView.w = v.w;
        scratchView.h = v.h;
      } else {
        scratchView.w = CHEAT_VIEW_W_M;
        scratchView.h = CHEAT_VIEW_H_M;
        scratchView.x = p.x - CHEAT_VIEW_W_M / 2;
        scratchView.y = p.y - CHEAT_VIEW_H_M / 2;
      }
      return spawnInView(world, cheat.type, n, scratchView, p.x, p.y) > 0;
    }
    case "skip_wave":
      if (world.run.phase !== "wave") return false;
      skipWave(world);
      return true;
    case "leave_last":
      if (world.run.phase !== "wave") return false;
      leaveLast(world, CHEAT_LEAVE_COUNT);
      return true;
    case "behemoth":
      return startBossWarning(world);
    case "event":
      return forceEvent(world, cheat.kind);
    case "loadout": {
      if (!p) return false;
      const ids = weaponIds(world.balance) as readonly string[];
      const w1 = cheat.w1 === cheat.w0 ? null : cheat.w1;
      if (!ids.includes(cheat.w0) || (w1 !== null && !ids.includes(w1))) return false;
      setLoadout(world.balance, p.loadout, [cheat.w0 as WeaponId, w1 as WeaponId | null]);
      return true;
    }
    case "money":
      if (!p) return false;
      p.wallet += CHEAT_MONEY; // a cheat: no "+N" event, not counted as earned
      return true;
    case "damage_building":
      return p ? damageNearestBuilding(world, p.x, p.y, CHEAT_BUILDING_DAMAGE) !== null : false;
    case "god":
      if (!p) return false;
      if (cheat.on) world.godPlayers.add(playerId);
      else world.godPlayers.delete(playerId);
      return true;
    case "decay":
      if (!decayCheatAllowed(world)) return false;
      setDecayStageCheat(world, cheat.stage);
      return true;
    case "blackout":
      setForcedBlackout(world, cheat.pct);
      return true;
    case "restart":
      return false;
  }
}
