import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { DAMAGE_TAGS, type DamageTag, type SimEvent } from "../core/simEvents";
import { NET_EVENT_KIND, NET_NONE, decodeNetEvent, encodeNetEvent, playerSlotOf, type NetEvent, type NetEventContext } from "./netEvents";

const balance = loadBalance();
/** Server side: pool slot 7 has generation 3. */
const generation = (id: number): number => (id === 7 ? 3 : 0);
const enc: NetEventContext = { balance, zombieNetId: (id) => id | (generation(id) << 8) };
const dec: NetEventContext = { balance };

/** One of every forwarded kind, with values already on the wire grid (cm, tenths, ms). */
const dir = (deg: number) => ({ dirX: Math.cos((deg * Math.PI) / 180), dirY: Math.sin((deg * Math.PI) / 180) });
const EVENTS: SimEvent[] = [
  { type: "zombie.killed", zombieId: 7, killerId: "p2", x: 12.34, y: 5.67, weapon: "smg" },
  { type: "zombie.killed", zombieId: 3, killerId: null, x: 0, y: 31.5, weapon: "pistol" },
  { type: "zombie.hit", zombieId: 7, x: 47.99, y: 0.01, ...dir(90), damage: 4.5, weapon: "hunting_rifle", sourceId: "p1" },
  { type: "zombie.hit", zombieId: 3, x: 1, y: 2, ...dir(0), damage: 1, weapon: "pistol", sourceId: null },
  { type: "weapon.fired", playerId: "p0", weapon: "pistol", x: 24.5, y: 16.25, ...dir(180) },
  { type: "weapon.reload_started", playerId: "p1", weapon: "smg", reloadS: 1.6 },
  { type: "weapon.reloaded", playerId: "p3", weapon: "pistol" },
  { type: "weapon.swap_started", playerId: "p1" },
  { type: "weapon.swapped", playerId: "p1", active: 1, weapon: "machete" },
  { type: "melee.swung", playerId: "p2", weapon: "machete", x: 3, y: 4, ...dir(270), arcDeg: 110, rangeM: 1.8 },
  { type: "player.damaged", playerId: "p0", amount: 10, sourceZombieId: 7, tag: "zombie", sourcePlayerId: null },
  { type: "player.downed", playerId: "p0" },
  { type: "player.revived", playerId: "p1", reviverId: "p3" },
  { type: "player.out", playerId: "p2" },
  { type: "player.returned", playerId: "p2", x: 25.5, y: 14.5 },
  { type: "team.wiped", wave: 7 },
  { type: "run.held_out", wave: 5 }, // Story 3.10
  { type: "decay.stage_changed", stage: 2, from: 1 }, // Story 4.5
  { type: "money.earned", playerId: "p1", amount: 12, reason: "refund" }, // Story 4.5
  { type: "wave.started", number: 3, size: 24 },
  { type: "wave.ended", number: 3 },
  { type: "wave.rush_started", count: 5 },
  { type: "build.started", wave: 4 },
  { type: "money.earned", playerId: "p2", amount: 30, reason: "wave" },
  { type: "money.earned", playerId: "p0", amount: 1, reason: "assist" },
  { type: "building.placed", buildingId: 3, buildingType: "wood_barricade", ownerId: "p1", gx: 47, gy: 31, rot: 3 },
  { type: "building.destroyed", buildingId: 4, buildingType: "wood_barricade", ownerId: "p2", gx: 12, gy: 30, rot: 1 },
  { type: "building.repaired", buildingId: 3, playerId: "p2", cost: 20, x: 47.25, y: 31.5 },
  // Story 3.6: a turret's kill (the building type is no weapon: decodes to "").
  { type: "zombie.killed", zombieId: 7, killerId: "p1", x: 3, y: 4, weapon: "", buildingId: 12 },
  // Story 5.9: an upgrade, a mine blast, a blast's player damage (source -2, not fire).
  { type: "building.upgraded", buildingId: 5, playerId: "p3", cost: 70, toType: "metal_barricade", x: 12.25, y: 7.5 },
  { type: "mine.exploded", buildingId: 9, x: 20.25, y: 11.75 },
  { type: "bear_trap.snapped", buildingId: 12, x: 8.5, y: 30.5 }, // Story 5.14
  { type: "player.damaged", playerId: "p1", amount: 40, sourceZombieId: -2, tag: "explosion", sourcePlayerId: "p3" },
  { type: "player.damaged", playerId: "p2", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: null },
  // Story 5.4: flame friendly fire (fire, source player p0) and a burst's edges.
  { type: "player.damaged", playerId: "p3", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: "p0" },
  { type: "weapon.flame_started", playerId: "p0", weapon: "flamethrower" },
  { type: "weapon.flame_started", playerId: "p1", weapon: "gas_torch" },
  { type: "weapon.flame_stopped", playerId: "p0" },
  // Story 5.6: spits, puddles and acid damage (source −3, apart from fire −1 and blast −2).
  { type: "spitter.spat", zombieId: 7, spitId: 65535, x: 12.34, y: 5.67, toX: 17.5, toY: 0.01 },
  { type: "acid.splashed", puddleId: 3, x: 47.99, y: 31.99, hitPlayerId: "p2" },
  { type: "acid.splashed", puddleId: 4, x: 0, y: 0, hitPlayerId: null },
  { type: "player.damaged", playerId: "p1", amount: 2, sourceZombieId: -3, tag: "acid", sourcePlayerId: null },
  // Story 5.1: a weapon upgrade.
  { type: "weapon.upgraded", playerId: "p2", weapon: "smg", slot: 1, level: 3 },
  { type: "weapon.upgraded", playerId: "p0", weapon: "pistol", slot: 0, level: 4 },
  // Story 5.7: the Brute's roar / banner (first of the run, then a later one).
  { type: "zombie.brute_spawned", zombieId: 9, x: 0.6, y: 31.4, first: true },
  { type: "zombie.brute_spawned", zombieId: 200, x: 47.4, y: 16, first: false },
  // Story 5.5: a lobbed round (the decoder without a flush tick puts landTick = flightTicks) and blasts.
  { type: "grenade.launched", playerId: "p2", grenadeId: 255, x: 10.5, y: 3.25, tx: 22.49, ty: 3.01, landTick: 12, flightTicks: 12, seq: 65535 },
  { type: "explosion.happened", kind: 0, x: 22.49, y: 3.01, radiusM: 2, sourcePlayerId: "p2", grenadeId: 255 },
  { type: "explosion.happened", kind: 1, x: 0, y: 31.99, radiusM: 2.5, sourcePlayerId: null, grenadeId: 0 },
  // Story 5.8
  { type: "bloater.swell_started", zombieId: 17, x: 12.34, y: 5.6 },
  { type: "bloater.burst", x: 0.5, y: 31.5, chain: false },
  { type: "bloater.burst", x: 47.5, y: 0.5, chain: true },
  // Story 5.12: a use (HUD/sound), a thrown molotov (its item appended at index 9), a hand-grenade blast, a lit zone.
  { type: "consumable.used", playerId: "p1", item: 2 },
  { type: "consumable.used", playerId: "p3", item: 0 },
  { type: "grenade.launched", playerId: "p1", grenadeId: 7, x: 10.5, y: 3.25, tx: 18.5, ty: 3.25, landTick: 14, flightTicks: 14, seq: 42, item: 3 },
  { type: "explosion.happened", kind: 3, x: 18.5, y: 3.25, radiusM: 2.5, sourcePlayerId: "p1", grenadeId: 7 },
  { type: "molotov.ignited", zoneId: 65535, item: 2, x: 18.5, y: 3.25, playerId: "p1" },
  { type: "molotov.ignited", zoneId: 1, item: 2, x: 0, y: 31.99, playerId: null },
];

/** Story 3.6: a turret shot (its muzzle is not sent). */
const TURRET_SHOT: SimEvent = { type: "turret.fired", buildingId: 12, x: 10.5, y: 4.5, ...dir(135) };

/** Bytes msgpack uses for an integer (fixint, int8/16/32, uint8/16/32). */
function msgpackIntBytes(v: number): number {
  if (v >= 0) return v < 128 ? 1 : v < 256 ? 2 : v < 65536 ? 3 : 5;
  return v >= -32 ? 1 : v >= -128 ? 2 : v >= -32768 ? 3 : 5;
}
const msgpackTupleBytes = (t: NetEvent): number => 1 + t.reduce((s, v) => s + msgpackIntBytes(v), 0);

function expectSameEvent(got: SimEvent | null, want: SimEvent): void {
  expect(got).not.toBeNull();
  const g = got as Record<string, unknown>;
  for (const [k, v] of Object.entries(want)) {
    if (typeof v === "number" && (k === "dirX" || k === "dirY")) expect(g[k] as number).toBeCloseTo(v, 1);
    else if (typeof v === "number") expect(g[k] as number).toBeCloseTo(v, 9);
    else expect(g[k]).toEqual(v);
  }
  expect(Object.keys(g).sort()).toEqual(Object.keys(want).sort());
}

describe("netEvents", () => {
  it("Story 5.12: a launcher round's tuple is unchanged (0 added bytes); a thrown item adds one field", () => {
    const base = { type: "grenade.launched", playerId: "p2", grenadeId: 9, x: 1, y: 2, tx: 3, ty: 4, landTick: 10, flightTicks: 10, seq: 5 } as const;
    expect((encodeNetEvent(base, enc) as NetEvent).length).toBe(9);
    expect((encodeNetEvent({ ...base, item: 2 }, enc) as NetEvent).length).toBe(10);
    expect(decodeNetEvent(encodeNetEvent(base, enc) as NetEvent, dec)).not.toHaveProperty("item");
  });

  it("round-trips every forwarded kind", () => {
    const kinds = new Set<number>();
    for (const e of EVENTS) {
      const t = encodeNetEvent(e, enc);
      expect(t).not.toBeNull();
      expect((t as NetEvent).every((v) => Number.isInteger(v))).toBe(true);
      kinds.add((t as NetEvent)[0] as number);
      expectSameEvent(decodeNetEvent(t as NetEvent, dec), e);
    }
    kinds.add((encodeNetEvent(TURRET_SHOT, enc) as NetEvent)[0] as number); // own test below (muzzle not on the wire)
    expect([...kinds].sort((a, b) => a - b)).toEqual(Object.values(NET_EVENT_KIND).sort((a, b) => a - b));
  });

  it("Story 3.4: building.placed carries the type as its index; an unknown index decodes to null", () => {
    const t = encodeNetEvent({ type: "building.placed", buildingId: 9, buildingType: "wood_barricade", ownerId: "p0", gx: 1, gy: 2, rot: 1 }, enc);
    expect(t).toEqual([NET_EVENT_KIND.BUILDING_PLACED, 9, 0, 0, 1, 2, 1]);
    expect(msgpackTupleBytes(t as NetEvent)).toBeLessThanOrEqual(8);
    expect(decodeNetEvent([NET_EVENT_KIND.BUILDING_PLACED, 9, 200, 0, 1, 2, 1], dec)).toBeNull();
  });

  it("Story 3.7: building.repaired carries the centre in cm (≤ 12 bytes)", () => {
    const t = encodeNetEvent({ type: "building.repaired", buildingId: 9, playerId: "p1", cost: 125, x: 47.25, y: 31.5 }, enc);
    expect(t).toEqual([NET_EVENT_KIND.BUILDING_REPAIRED, 9, 1, 125, 4725, 3150]);
    expect(msgpackTupleBytes(t as NetEvent)).toBeLessThanOrEqual(12);
  });

  it("sends the hit's source as a player slot, 255 for none (Story 2.7)", () => {
    const hit = (sourceId: string | null) =>
      encodeNetEvent({ type: "zombie.hit", zombieId: 7, x: 1, y: 1, dirX: 1, dirY: 0, damage: 5, weapon: "pistol", sourceId }, enc) as NetEvent;
    expect(hit("p2")[7]).toBe(2);
    expect(hit(null)[7]).toBe(NET_NONE);
    expect(decodeNetEvent(hit("p3"), dec)).toMatchObject({ sourceId: "p3" });
    expect(decodeNetEvent(hit(null), dec)).toMatchObject({ sourceId: null });
    // A tuple without the field (a server older than 2.7) decodes with no source.
    expect(decodeNetEvent(hit("p1").slice(0, 7), dec)).toMatchObject({ sourceId: null });
  });

  it("Story 5.4: player.damaged appends tag + source slot only for a player's fire/blast (friendly fire); every other cause keeps 4 fields", () => {
    const dmg = (src: number, tag: DamageTag, from: string | null) => encodeNetEvent({ type: "player.damaged", playerId: "p0", amount: 5, sourceZombieId: src, tag, sourcePlayerId: from }, enc) as NetEvent;
    expect(dmg(7, "zombie", null)).toHaveLength(4);
    expect(dmg(-1, "fire", null)).toHaveLength(4);
    expect(dmg(-2, "explosion", null)).toHaveLength(4);
    expect(dmg(-3, "acid", null)).toHaveLength(4);
    const ff = dmg(-1, "fire", "p2");
    expect(ff).toEqual([NET_EVENT_KIND.PLAYER_DAMAGED, 0, 50, -1, DAMAGE_TAGS.indexOf("fire"), 2]);
    expect(decodeNetEvent(ff, dec)).toEqual({ type: "player.damaged", playerId: "p0", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: "p2" });
    expect(msgpackTupleBytes(ff)).toBeLessThanOrEqual(8);
    // a 4-field tuple decodes with the tag its source implies and no source player
    expect(decodeNetEvent(dmg(-3, "acid", null), dec)).toMatchObject({ tag: "acid", sourcePlayerId: null });
    expect(decodeNetEvent(dmg(4, "zombie", null), dec)).toMatchObject({ tag: "zombie", sourcePlayerId: null });
  });

  it("Story 5.6: acid (−3), blast (−2) and fire (−1) damage stay apart on the wire; spit events are small", () => {
    const dmg = (src: number) => decodeNetEvent(encodeNetEvent({ type: "player.damaged", playerId: "p0", amount: 2, sourceZombieId: src, tag: "zombie", sourcePlayerId: null }, enc) as NetEvent, dec);
    expect(dmg(-3)).toMatchObject({ sourceZombieId: -3 });
    expect(dmg(-2)).toMatchObject({ sourceZombieId: -2 });
    expect(dmg(-1)).toMatchObject({ sourceZombieId: -1 });
    expect(dmg(7)).toMatchObject({ sourceZombieId: 7 });
    const spat = encodeNetEvent({ type: "spitter.spat", zombieId: 7, spitId: 300, x: 47.99, y: 31.99, toX: 42.01, toY: 26.5 }, enc) as NetEvent;
    expect(spat).toEqual([NET_EVENT_KIND.SPITTER_SPAT, 7 | (3 << 8), 300, 4799, 3199, 4201, 2650]);
    expect(msgpackTupleBytes(spat)).toBeLessThanOrEqual(20); // worst case (4 B over the story estimate of ~14)
    const splash = encodeNetEvent({ type: "acid.splashed", puddleId: 300, x: 47.99, y: 31.99, hitPlayerId: null }, enc) as NetEvent;
    expect(splash).toEqual([NET_EVENT_KIND.ACID_SPLASHED, 300, 4799, 3199, NET_NONE]);
    expect(msgpackTupleBytes(splash)).toBeLessThanOrEqual(13);
  });

  it("does not forward test.ping", () => {
    expect(encodeNetEvent({ type: "test.ping", n: 1 }, enc)).toBeNull();
  });

  it("keeps the zombie generation in the net id; decode gives the pool slot", () => {
    const t = encodeNetEvent({ type: "zombie.hit", zombieId: 7, x: 1, y: 1, dirX: 1, dirY: 0, damage: 5, weapon: "pistol", sourceId: "p0" }, enc) as NetEvent;
    expect(t[1]).toBe(7 | (3 << 8));
    const e = decodeNetEvent(t, dec);
    expect(e?.type === "zombie.hit" && e.zombieId).toBe(7);
    const killed = encodeNetEvent({ type: "zombie.killed", zombieId: 7, killerId: "p0", x: 1, y: 1, weapon: "pistol" }, enc) as NetEvent;
    expect(killed[1]).toBe(0x307);
  });

  it("rounds positions to cm, damage to tenths and directions to a heading", () => {
    const t = encodeNetEvent({ type: "zombie.hit", zombieId: 1, x: 1.23456, y: 2.0049, ...dir(45), damage: 3.333, weapon: "smg", sourceId: null }, enc) as NetEvent;
    const e = decodeNetEvent(t, dec);
    expect(e).toMatchObject({ x: 1.23, y: 2, damage: 3.3 });
  });

  it("Story 5.3: weapon.fired with a pellet seq round-trips as a 7th field (≤ 19 B); without it stays 6 fields", () => {
    const e = { type: "weapon.fired" as const, playerId: "p2", weapon: "shotgun", x: 12.5, y: 3.25, ...dir(90), seq: 65_535 };
    const t = encodeNetEvent(e, enc) as NetEvent;
    expect(t.length).toBe(7);
    expect(t[6]).toBe(65_535);
    expect(msgpackTupleBytes(t)).toBeLessThanOrEqual(19);
    const back = decodeNetEvent(t, dec);
    expect(back).toMatchObject({ type: "weapon.fired", weapon: "shotgun", seq: 65_535 });
    expect(encodeNetEvent({ ...e, seq: 70_000 }, enc)?.[6]).toBe(70_000 & 0xffff);
    const t6 = encodeNetEvent({ type: "weapon.fired", playerId: "p2", weapon: "assault_rifle", x: 12.5, y: 3.25, ...dir(90) }, enc) as NetEvent;
    expect(t6.length).toBe(6);
    expect(decodeNetEvent(t6, dec)).not.toHaveProperty("seq");
  });

  it("keeps a typical weapon.fired at or under 16 bytes as msgpack", () => {
    const t = encodeNetEvent({ type: "weapon.fired", playerId: "p3", weapon: "hunting_rifle", x: 47.99, y: 31.99, ...dir(200) }, enc) as NetEvent;
    expect(t.length).toBe(6);
    expect(msgpackTupleBytes(t)).toBeLessThanOrEqual(16);
  });

  it("Story 3.6: turret.fired is [23, buildingId, heading] (≤ 5 B); the muzzle decodes as NaN for the client to fill", () => {
    const t = encodeNetEvent(TURRET_SHOT, enc) as NetEvent;
    expect(t).toEqual([NET_EVENT_KIND.TURRET_FIRED, 12, 96]);
    expect(msgpackTupleBytes(t)).toBeLessThanOrEqual(5);
    const e = decodeNetEvent(t, dec);
    expect(e?.type).toBe("turret.fired");
    if (e?.type !== "turret.fired") return;
    expect(e.buildingId).toBe(12);
    expect(e.dirX).toBeCloseTo(-Math.SQRT1_2, 2);
    expect(e.dirY).toBeCloseTo(Math.SQRT1_2, 2);
    expect(Number.isNaN(e.x) && Number.isNaN(e.y)).toBe(true);
  });

  it("Story 3.6: only a turret's zombie.killed carries index 6 (player kills stay 6 fields)", () => {
    const player = encodeNetEvent({ type: "zombie.killed", zombieId: 1, killerId: "p0", x: 1, y: 1, weapon: "pistol" }, enc) as NetEvent;
    expect(player.length).toBe(6);
    expect(decodeNetEvent(player, dec)).not.toHaveProperty("buildingId");
    const turret = encodeNetEvent({ type: "zombie.killed", zombieId: 1, killerId: "p0", x: 1, y: 1, weapon: "auto_turret", buildingId: 5 }, enc) as NetEvent;
    expect(turret.length).toBe(7);
    expect(turret[6]).toBe(5);
    expect(decodeNetEvent(turret, dec)).toMatchObject({ killerId: "p0", buildingId: 5 });
  });

  it("maps player ids to slots and unknown kinds to null", () => {
    expect(playerSlotOf("p0")).toBe(0);
    expect(playerSlotOf("p3")).toBe(3);
    expect(playerSlotOf("p4")).toBe(NET_NONE);
    expect(playerSlotOf("local")).toBe(NET_NONE);
    expect(playerSlotOf(null)).toBe(NET_NONE);
    expect(decodeNetEvent([99, 1, 2], dec)).toBeNull();
  });
});
