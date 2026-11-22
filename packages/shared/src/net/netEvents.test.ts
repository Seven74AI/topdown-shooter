import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
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
  { type: "player.damaged", playerId: "p0", amount: 10, sourceZombieId: 7 },
  { type: "player.downed", playerId: "p0" },
  { type: "player.revived", playerId: "p1", reviverId: "p3" },
  { type: "player.out", playerId: "p2" },
  { type: "player.returned", playerId: "p2", x: 25.5, y: 14.5 },
  { type: "team.wiped", wave: 7 },
  { type: "wave.started", number: 3, size: 24 },
  { type: "wave.ended", number: 3 },
  { type: "wave.rush_started", count: 5 },
  { type: "build.started", wave: 4 },
  { type: "money.earned", playerId: "p2", amount: 30, reason: "wave" },
  { type: "money.earned", playerId: "p0", amount: 1, reason: "assist" },
  { type: "building.placed", buildingId: 3, buildingType: "wood_barricade", ownerId: "p1", gx: 47, gy: 31, rot: 3 },
  { type: "building.repaired", buildingId: 3, playerId: "p2", cost: 20, x: 47.25, y: 31.5 },
];

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
  it("round-trips every forwarded kind", () => {
    const kinds = new Set<number>();
    for (const e of EVENTS) {
      const t = encodeNetEvent(e, enc);
      expect(t).not.toBeNull();
      expect((t as NetEvent).every((v) => Number.isInteger(v))).toBe(true);
      kinds.add((t as NetEvent)[0] as number);
      expectSameEvent(decodeNetEvent(t as NetEvent, dec), e);
    }
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

  it("keeps a typical weapon.fired at or under 16 bytes as msgpack", () => {
    const t = encodeNetEvent({ type: "weapon.fired", playerId: "p3", weapon: "hunting_rifle", x: 47.99, y: 31.99, ...dir(200) }, enc) as NetEvent;
    expect(t.length).toBe(6);
    expect(msgpackTupleBytes(t)).toBeLessThanOrEqual(16);
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
