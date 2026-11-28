import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  createWorld,
  decodeNetEvent,
  encodeNetEvent,
  loadBalance,
  setInput,
  startBuild,
  startWave,
  step,
  type SimEvent,
  type World,
} from "@topdown/shared";
import { MolotovFires } from "./molotovFx";
import { GrenadeFlights } from "./grenadeFx";

/**
 * Story 5.12 (M-A, AC 8): the client's molotov zones are the server's — built from the wire events
 * only (encode → decode, like `sim.events_flushed`), the same cap rule, the same lifetime; a woken
 * tab's stale ignite never shows a ghost fire; a build start clears them.
 */
const balance = loadBalance();

function server(): { world: World; wire: SimEvent[] } {
  const world = createWorld({ balance, seed: 3, systems: { waves: () => {}, zombies: () => {} } });
  for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 10 + i * 6, 10);
  startBuild(world);
  startWave(world);
  const wire: SimEvent[] = [];
  world.events.subscribe((e) => {
    const t = encodeNetEvent(e, { balance });
    if (!t) return;
    const d = decodeNetEvent(t, { balance, tick: world.tick + 1 });
    if (d) wire.push(d);
  });
  return { world, wire };
}

const serverIds = (w: World): number[] => {
  const a = w.molotovs.areas;
  const out: number[] = [];
  for (let i = 0; i < a.capacity; i++) if (a.active[i] === 1) out.push(a.id[i] as number);
  return out.sort((x, y) => x - y);
};

describe("MolotovFires: the client holds the server's zones (Story 5.12)", () => {
  it("4 players × 2 molotovs, then 2 more: same live set every tick (cap 8 replaces the oldest), same end tick", () => {
    const { world, wire } = server();
    const fires = new MolotovFires(balance);
    const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, "p0", 1);
    let seq = 1;
    const ids: number[] = [];
    let maxLive = 0;
    for (let t = 0; t < 200; t++) {
      for (let i = 0; i < 4; i++) {
        const p = world.players.get(`p${i}`)!;
        if (t === 0 || t === 12 || (i < 2 && t === 30)) {
          p.consumable = "molotovs";
          p.consumableCount = 2;
          p.consumableCooldownTicks = 0;
        }
        const tap = t === 0 || t === 12 || (i < 2 && t === 30);
        setInput(world, p.id, { ...NEUTRAL_INPUT, seq: seq++, aimX: Math.cos(i + t), aimY: Math.sin(i + t), consumable: tap, isMouse: true });
      }
      step(world, TICK_DT_S);
      const nowS = world.tick * TICK_DT_S;
      for (const e of wire) {
        fires.handle(e, nowS);
        flights.handle(e, nowS);
      }
      wire.length = 0;
      // The server's set after step T is the zones that burn in step T + 1; the client draws a zone for
      // the frames of its damage ticks (lit in step L → shown from tick L + 1 to L + 80): one tick ahead.
      fires.update(nowS + TICK_DT_S);
      expect(fires.ids(ids).sort((a, b) => a - b), `tick ${world.tick}`).toEqual(serverIds(world));
      maxLive = Math.max(maxLive, fires.live.length);
    }
    expect(maxLive).toBe(8); // liveness: the cap was reached
    expect(fires.live.length).toBe(0);
    expect(flights.count).toBe(0); // every bottle ended at its fire
    // Story 9.18 interim (until T6 draws the teardrop): the ring at the cone's full reach
    expect(balance.consumables.items.molotovs?.cone?.reachEndM).toBe(4.5);
  });

  it("a woken tab: an ignite older than its life draws nothing; a younger one is back-dated; a build start clears", () => {
    const fires = new MolotovFires(balance);
    type Ignited = Extract<SimEvent, { type: "molotov.ignited" }>;
    const e = (ageS: number): Ignited => ({ type: "molotov.ignited", zoneId: 9, item: 2, x: 5, y: 5, playerId: "p1", ageS });
    expect(fires.handle(e(4.5), 100)).toBe(true);
    expect(fires.live.length).toBe(0);
    fires.handle({ ...e(1), zoneId: 10 }, 100);
    expect(fires.live.map((z) => [z.id, z.radiusM, z.startS])).toEqual([[10, 4.5, 99]]); // Story 9.18 interim: the cone's reach (T6 replaces the ring)
    fires.update(102.99);
    expect(fires.live.length).toBe(1);
    fires.update(103);
    expect(fires.live.length).toBe(0);
    fires.handle({ ...e(0), zoneId: 11 }, 200);
    fires.handle({ type: "build.started", wave: 2 }, 200.1);
    expect(fires.live.length).toBe(0);
  });

  it("the envelope fades over the last 0.6 s", () => {
    const z = { x: 0, y: 0, radiusM: 3, id: 1, startS: 0, endS: 4, spread: 0, dir: 0 };
    expect(MolotovFires.envelope(z, 1)).toBe(1);
    expect(MolotovFires.envelope(z, 3.7)).toBeCloseTo(0.5, 9);
    expect(MolotovFires.envelope(z, 4)).toBe(0);
  });
});

describe("MolotovFires: splash direction (Story 5.12 review L7)", () => {
  it("a molotov's spread direction is its throw's, even after 100 hand grenades filled the memory", () => {
    const fires = new MolotovFires(balance);
    for (let i = 0; i < 100; i++) fires.handle({ type: "grenade.launched", playerId: "p0", grenadeId: (i % 250) + 1, x: 0, y: 0, tx: 5 + i * 0.1, ty: 5, landTick: 10, flightTicks: 10, seq: i, item: 2 }, 0);
    fires.handle({ type: "grenade.launched", playerId: "p1", grenadeId: 9, x: 10, y: 10, tx: 13, ty: 14, landTick: 10, flightTicks: 10, seq: 1, item: 3 }, 0);
    fires.handle({ type: "molotov.ignited", zoneId: 1, item: 2, x: 13, y: 14, playerId: "p1" }, 0.5);
    expect(fires.live[0]?.dir).toBeCloseTo(Math.atan2(4, 3), 9);
  });
});
