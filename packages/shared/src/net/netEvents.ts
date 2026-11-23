import type { Balance } from "../config/balance";
import { weaponIds, type WeaponId } from "../combat/weapons";
import { MONEY_REASONS, type SimEvent } from "../core/simEvents";
import { MAX_PLAYERS } from "./messages";
import { headingToRad, quantizeHeading } from "./heading";
import { buildingTypeIds } from "../buildings/buildings";

/**
 * Sim events on the wire (Story 2.4). Each forwarded event is a short tuple `[kind, …fields]`
 * (msgpack keeps small ints in 1–3 bytes), sent in one `sim.events_flushed` message per tick:
 *
 * - players as their slot (255 = none), zombies as the net id `slot | generation << 8` (the
 *   Story 2.5 horde id), weapons as `weaponIds(balance)` indices;
 * - positions in integer centimetres, directions as `quantizeHeading`, damage in integer tenths,
 *   durations in integer milliseconds.
 *
 * Each story that adds a SimEvent adds its kind here, with a round-trip test.
 */
export const NET_EVENT_KIND = {
  ZOMBIE_KILLED: 1,
  ZOMBIE_HIT: 2,
  WEAPON_FIRED: 3,
  WEAPON_RELOAD_STARTED: 4,
  WEAPON_RELOADED: 5,
  WEAPON_SWAP_STARTED: 6,
  WEAPON_SWAPPED: 7,
  MELEE_SWUNG: 8,
  PLAYER_DAMAGED: 9,
  // 10 was PLAYER_DIED (removed in Story 2.8): never reuse a kind number.
  WAVE_STARTED: 11,
  WAVE_ENDED: 12,
  WAVE_RUSH_STARTED: 13,
  PLAYER_DOWNED: 14,
  PLAYER_REVIVED: 15,
  PLAYER_OUT: 16,
  PLAYER_RETURNED: 17,
  TEAM_WIPED: 18,
  MONEY_EARNED: 19,
  BUILD_STARTED: 20, // Story 3.1
  BUILDING_PLACED: 21, // Story 3.4
  BUILDING_DESTROYED: 22, // Story 3.5
  TURRET_FIRED: 23, // Story 3.6
  BUILDING_REPAIRED: 24, // Story 3.7
  RUN_HELD_OUT: 25, // Story 3.10
  DECAY_STAGE_CHANGED: 26, // Story 4.5
} as const;
export type NetEventKind = (typeof NET_EVENT_KIND)[keyof typeof NET_EVENT_KIND];

/** One encoded event: `[kind, …fields]`, all integers. */
export type NetEvent = readonly number[];

/** `sim.events_flushed` payload: the events of one server tick, in emit order. */
export interface SimEventsFlushed {
  tick: number;
  events: NetEvent[];
}

/** "No player" / "no zombie" on the wire. */
export const NET_NONE = 255;

export interface NetEventContext {
  readonly balance: Balance;
  /** Encode only: the net id of a zombie pool slot (`slot | generation << 8`). */
  readonly zombieNetId?: (zombieId: number) => number;
}

const PLAYER_IDS: readonly string[] = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`);

/** `"p0"`–`"p3"` → 0–3; anything else → NET_NONE. */
export function playerSlotOf(playerId: string | null): number {
  if (playerId === null || playerId.length !== 2 || playerId.charCodeAt(0) !== 112 /* p */) return NET_NONE;
  const slot = playerId.charCodeAt(1) - 48;
  return slot >= 0 && slot < MAX_PLAYERS ? slot : NET_NONE;
}

/** 0–3 → `"p0"`–`"p3"` (no allocation); NET_NONE → null. */
export function playerIdOfSlot(slot: number): string | null {
  return PLAYER_IDS[slot] ?? null;
}

/** The pool slot of a net id (the index the client mirror uses). */
export const zombieSlotOfNetId = (netId: number): number => netId & 0xff;

const cm = (m: number): number => Math.round(m * 100);
const tenths = (v: number): number => Math.round(v * 10);

function weaponIndex(balance: Balance, id: WeaponId): number {
  const i = weaponIds(balance).indexOf(id);
  return i < 0 ? NET_NONE : i;
}
const weaponOf = (balance: Balance, i: number): WeaponId => weaponIds(balance)[i] ?? "";

const zid = (ctx: NetEventContext, zombieId: number): number => (ctx.zombieNetId ? ctx.zombieNetId(zombieId) : zombieId);

/** Encodes an event for the wire, or `null` for events that are not forwarded (`test.ping`). */
export function encodeNetEvent(e: SimEvent, ctx: NetEventContext): NetEvent | null {
  const b = ctx.balance;
  const K = NET_EVENT_KIND;
  switch (e.type) {
    case "zombie.killed":
      // Story 3.6: a turret's kill appends its building id (index 6); its weapon (a building type) is NET_NONE.
      return e.buildingId !== undefined
        ? [K.ZOMBIE_KILLED, zid(ctx, e.zombieId), playerSlotOf(e.killerId), cm(e.x), cm(e.y), weaponIndex(b, e.weapon), e.buildingId]
        : [K.ZOMBIE_KILLED, zid(ctx, e.zombieId), playerSlotOf(e.killerId), cm(e.x), cm(e.y), weaponIndex(b, e.weapon)];
    case "zombie.hit":
      return [
        K.ZOMBIE_HIT,
        zid(ctx, e.zombieId),
        cm(e.x),
        cm(e.y),
        quantizeHeading(e.dirX, e.dirY),
        tenths(e.damage),
        weaponIndex(b, e.weapon),
        playerSlotOf(e.sourceId), // Story 2.7 (appended: index 7)
      ];
    case "weapon.fired":
      // Story 5.3: a pellet gun's shot appends its 16-bit input seq (index 6): remote clients rebuild the fan from it.
      return e.seq !== undefined
        ? [K.WEAPON_FIRED, playerSlotOf(e.playerId), weaponIndex(b, e.weapon), cm(e.x), cm(e.y), quantizeHeading(e.dirX, e.dirY), e.seq & 0xffff]
        : [K.WEAPON_FIRED, playerSlotOf(e.playerId), weaponIndex(b, e.weapon), cm(e.x), cm(e.y), quantizeHeading(e.dirX, e.dirY)];
    case "weapon.reload_started":
      return [K.WEAPON_RELOAD_STARTED, playerSlotOf(e.playerId), weaponIndex(b, e.weapon), Math.round(e.reloadS * 1000)];
    case "weapon.reloaded":
      return [K.WEAPON_RELOADED, playerSlotOf(e.playerId), weaponIndex(b, e.weapon)];
    case "weapon.swap_started":
      return [K.WEAPON_SWAP_STARTED, playerSlotOf(e.playerId)];
    case "weapon.swapped":
      return [K.WEAPON_SWAPPED, playerSlotOf(e.playerId), e.active, weaponIndex(b, e.weapon)];
    case "melee.swung":
      // Arc and range come from the weapon's balance on decode (melee.ts emits exactly those).
      return [K.MELEE_SWUNG, playerSlotOf(e.playerId), weaponIndex(b, e.weapon), cm(e.x), cm(e.y), quantizeHeading(e.dirX, e.dirY)];
    case "player.damaged":
      return [K.PLAYER_DAMAGED, playerSlotOf(e.playerId), tenths(e.amount), e.sourceZombieId < 0 ? -1 : zid(ctx, e.sourceZombieId)];
    case "player.downed":
      return [K.PLAYER_DOWNED, playerSlotOf(e.playerId)];
    case "player.revived":
      return [K.PLAYER_REVIVED, playerSlotOf(e.playerId), playerSlotOf(e.reviverId)];
    case "player.out":
      return [K.PLAYER_OUT, playerSlotOf(e.playerId)];
    case "player.returned":
      return [K.PLAYER_RETURNED, playerSlotOf(e.playerId), cm(e.x), cm(e.y)];
    case "team.wiped":
      return [K.TEAM_WIPED, e.wave];
    case "run.held_out":
      return [K.RUN_HELD_OUT, e.wave];
    case "wave.started":
      return [K.WAVE_STARTED, e.number, e.size];
    case "wave.ended":
      return [K.WAVE_ENDED, e.number];
    case "wave.rush_started":
      return [K.WAVE_RUSH_STARTED, e.count];
    case "money.earned":
      // Story 3.2: the HUD's "+N" (the wallet itself comes from schema).
      return [K.MONEY_EARNED, playerSlotOf(e.playerId), e.amount, MONEY_REASONS.indexOf(e.reason)];
    case "build.started":
      return [K.BUILD_STARTED, e.wave];
    case "building.placed": {
      // Story 3.4: the type as its `buildingTypeIds` index (the building itself comes from schema).
      const t = buildingTypeIds(b).indexOf(e.buildingType);
      return [K.BUILDING_PLACED, e.buildingId, t < 0 ? NET_NONE : t, playerSlotOf(e.ownerId), e.gx, e.gy, e.rot];
    }
    case "building.destroyed": {
      // Story 3.5: for the debris FX (the removal itself comes from schema, on the same patch).
      const t = buildingTypeIds(b).indexOf(e.buildingType);
      return [K.BUILDING_DESTROYED, e.buildingId, t < 0 ? NET_NONE : t, playerSlotOf(e.ownerId), e.gx, e.gy, e.rot];
    }
    case "turret.fired":
      // Story 3.6: id + heading only; the client puts the muzzle at its building (`muzzleM` from the centre).
      return [K.TURRET_FIRED, e.buildingId, quantizeHeading(e.dirX, e.dirY)];
    case "building.repaired":
      // Story 3.7: FX only (HP and wallet come from schema).
      return [K.BUILDING_REPAIRED, e.buildingId, playerSlotOf(e.playerId), e.cost, cm(e.x), cm(e.y)];
    case "decay.stage_changed":
      // Story 4.5: the banner (the map itself follows the room state's decayStage / decayVariants).
      return [K.DECAY_STAGE_CHANGED, e.stage, e.from];
    case "test.ping":
      return null;
  }
}

const n = (t: NetEvent, i: number): number => t[i] ?? 0;
const pid = (t: NetEvent, i: number): string => playerIdOfSlot(n(t, i)) ?? "";

/**
 * Rebuilds a SimEvent from a tuple. `playerId` becomes `"p" + slot`; `zombieId` becomes the pool
 * slot (`netId & 0xff`); the tuple keeps the full net id (index 1 for zombie events) for Story 2.7.
 * Returns `null` for an unknown kind (a newer server; never thrown on).
 */
export function decodeNetEvent(t: NetEvent, ctx: NetEventContext): SimEvent | null {
  const b = ctx.balance;
  const K = NET_EVENT_KIND;
  switch (t[0]) {
    case K.ZOMBIE_KILLED: {
      const killed: Extract<SimEvent, { type: "zombie.killed" }> = {
        type: "zombie.killed",
        zombieId: zombieSlotOfNetId(n(t, 1)),
        killerId: playerIdOfSlot(n(t, 2)),
        x: n(t, 3) / 100,
        y: n(t, 4) / 100,
        weapon: weaponOf(b, n(t, 5)),
      };
      if (t.length > 6) killed.buildingId = n(t, 6); // Story 3.6: a turret's kill
      return killed;
    }
    case K.ZOMBIE_HIT: {
      const a = headingToRad(n(t, 4));
      return {
        type: "zombie.hit",
        zombieId: zombieSlotOfNetId(n(t, 1)),
        x: n(t, 2) / 100,
        y: n(t, 3) / 100,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        damage: n(t, 5) / 10,
        weapon: weaponOf(b, n(t, 6)),
        // Story 2.7; a tuple without it (older server) has no source.
        sourceId: playerIdOfSlot(t[7] ?? NET_NONE),
      };
    }
    case K.WEAPON_FIRED: {
      const a = headingToRad(n(t, 5));
      const fired: Extract<SimEvent, { type: "weapon.fired" }> = {
        type: "weapon.fired",
        playerId: pid(t, 1),
        weapon: weaponOf(b, n(t, 2)),
        x: n(t, 3) / 100,
        y: n(t, 4) / 100,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
      };
      if (t.length > 6) fired.seq = n(t, 6) & 0xffff; // Story 5.3: a pellet gun's seq
      return fired;
    }
    case K.WEAPON_RELOAD_STARTED:
      return { type: "weapon.reload_started", playerId: pid(t, 1), weapon: weaponOf(b, n(t, 2)), reloadS: n(t, 3) / 1000 };
    case K.WEAPON_RELOADED:
      return { type: "weapon.reloaded", playerId: pid(t, 1), weapon: weaponOf(b, n(t, 2)) };
    case K.WEAPON_SWAP_STARTED:
      return { type: "weapon.swap_started", playerId: pid(t, 1) };
    case K.WEAPON_SWAPPED:
      return { type: "weapon.swapped", playerId: pid(t, 1), active: n(t, 2) === 1 ? 1 : 0, weapon: weaponOf(b, n(t, 3)) };
    case K.MELEE_SWUNG: {
      const a = headingToRad(n(t, 5));
      const weapon = weaponOf(b, n(t, 2));
      const stats = b.weapons[weapon];
      const melee = stats?.kind === "melee" ? stats : null;
      return {
        type: "melee.swung",
        playerId: pid(t, 1),
        weapon,
        x: n(t, 3) / 100,
        y: n(t, 4) / 100,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        arcDeg: melee?.arcDeg ?? 0,
        rangeM: melee?.rangeM ?? 0,
      };
    }
    case K.PLAYER_DAMAGED: {
      const src = n(t, 3);
      return { type: "player.damaged", playerId: pid(t, 1), amount: n(t, 2) / 10, sourceZombieId: src < 0 ? -1 : zombieSlotOfNetId(src) };
    }
    case K.PLAYER_DOWNED:
      return { type: "player.downed", playerId: pid(t, 1) };
    case K.PLAYER_REVIVED:
      return { type: "player.revived", playerId: pid(t, 1), reviverId: pid(t, 2) };
    case K.PLAYER_OUT:
      return { type: "player.out", playerId: pid(t, 1) };
    case K.PLAYER_RETURNED:
      return { type: "player.returned", playerId: pid(t, 1), x: n(t, 2) / 100, y: n(t, 3) / 100 };
    case K.TEAM_WIPED:
      return { type: "team.wiped", wave: n(t, 1) };
    case K.RUN_HELD_OUT:
      return { type: "run.held_out", wave: n(t, 1) };
    case K.WAVE_STARTED:
      return { type: "wave.started", number: n(t, 1), size: n(t, 2) };
    case K.WAVE_ENDED:
      return { type: "wave.ended", number: n(t, 1) };
    case K.WAVE_RUSH_STARTED:
      return { type: "wave.rush_started", count: n(t, 1) };
    case K.MONEY_EARNED: {
      const reason = MONEY_REASONS[n(t, 3)];
      return reason ? { type: "money.earned", playerId: pid(t, 1), amount: n(t, 2), reason } : null;
    }
    case K.BUILD_STARTED:
      return { type: "build.started", wave: n(t, 1) };
    case K.BUILDING_PLACED: {
      const buildingType = buildingTypeIds(b)[n(t, 2)];
      if (buildingType === undefined) return null;
      return { type: "building.placed", buildingId: n(t, 1), buildingType, ownerId: pid(t, 3), gx: n(t, 4), gy: n(t, 5), rot: n(t, 6) };
    }
    case K.BUILDING_DESTROYED: {
      const buildingType = buildingTypeIds(b)[n(t, 2)];
      if (buildingType === undefined) return null;
      return { type: "building.destroyed", buildingId: n(t, 1), buildingType, ownerId: pid(t, 3), gx: n(t, 4), gy: n(t, 5), rot: n(t, 6) };
    }
    case K.TURRET_FIRED: {
      // The muzzle (x, y) is not on the wire: NaN until the client puts it at its building.
      const a = headingToRad(n(t, 2));
      return { type: "turret.fired", buildingId: n(t, 1), x: Number.NaN, y: Number.NaN, dirX: Math.cos(a), dirY: Math.sin(a) };
    }
    case K.BUILDING_REPAIRED:
      return { type: "building.repaired", buildingId: n(t, 1), playerId: pid(t, 2), cost: n(t, 3), x: n(t, 4) / 100, y: n(t, 5) / 100 };
    case K.DECAY_STAGE_CHANGED:
      return { type: "decay.stage_changed", stage: n(t, 1), from: n(t, 2) };
    default:
      return null;
  }
}
