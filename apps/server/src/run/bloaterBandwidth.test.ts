import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import { DOWNTOWN_MAP, NET_EVENT_KIND, NET_NONE, PLACEHOLDER_MAP, TICK_DT_S, ZOMBIE_TYPES, applyZombieDamage, loadBalance, spawnZombie, startWave, type NetEvent, type NetEventContext, type SimEvent, type World } from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";

/**
 * Story 5.8 (brief line 11, AC 7): what Bloaters add to each client's `sim.events_flushed`. The
 * swell rides the horde stream's state nibble (0 B) plus one `bloater.swell_started`; a burst is one
 * `bloater.burst` (the client spawns the gas cloud from it: no cloud state), its blast's
 * `player.damaged` (source −2) and its zombie hits (weapon index NET_NONE; the non-killing ones are
 * local). Measured per client as its tick message's bytes minus the same message without those tuples.
 */
const balance = loadBalance();

const isBloaterTuple = (t: NetEvent): boolean =>
  t[0] === NET_EVENT_KIND.BLOATER_SWELL_STARTED ||
  t[0] === NET_EVENT_KIND.BLOATER_BURST ||
  (t[0] === NET_EVENT_KIND.PLAYER_DAMAGED && t[3] === -2) ||
  (t[0] === NET_EVENT_KIND.ZOMBIE_HIT && t[6] === NET_NONE);

function measure(c: RunController, seconds: number, views: () => readonly (readonly [number, number])[], each?: (w: World, t: number) => void) {
  const world = c.world;
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const interest = new EventInterest();
  const added = [0, 0, 0, 0];
  let peak = 0;
  let bursts = 0;
  let swells = 0;
  const without: NetEvent[] = [];
  for (let t = 0; t < seconds / TICK_DT_S; t++) {
    each?.(world, t);
    const events = c.tick();
    for (const e of events as readonly SimEvent[]) {
      if (e.type === "bloater.burst") bursts++;
      else if (e.type === "bloater.swell_started") swells++;
    }
    interest.prepare(world, events, ctx);
    const vs = views();
    for (let i = 0; i < vs.length; i++) {
      const [vx, vy] = vs[i] as readonly [number, number];
      const mine = interest.eventsFor(world, vx, vy);
      if (mine.length === 0) continue;
      without.length = 0;
      for (const tu of mine) if (!isBloaterTuple(tu)) without.push(tu);
      const all = pack({ tick: world.tick, events: mine }).length;
      const rest = without.length > 0 ? pack({ tick: world.tick, events: without }).length : 0;
      added[i] = (added[i] as number) + all - rest;
      peak = Math.max(peak, all - rest);
    }
  }
  return { addedBps: added.map((b) => b / seconds), peak, bursts, swells };
}

describe("Bloater bandwidth (Story 5.8, brief line 11)", () => {
  it("wave 6 on Downtown at 4 standing players: < 50 B/s added per client on average; bursts and swells really happened", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 6, players, map: DOWNTOWN_MAP });
    const w = c.world;
    for (const p of w.players.values()) p.hp = 1e9;
    w.run.phase = "build";
    w.waves.number = 5;
    startWave(w); // wave 6: 240 = walker 96, runner 48, crawler 36, spitter 24, bloater 36 (one Walker slot is the Brute)
    expect(w.waves.number).toBe(6);
    const view = (): (readonly [number, number])[] => [...w.players.values()].map((p) => [p.x, p.y] as const);
    // The team kills one non-Bloater every 4 ticks (else the 150-alive cap holds the wave's Bloaters back).
    const bloater = ZOMBIE_TYPES.indexOf("bloater");
    const r = measure(c, 90, view, (world, t) => {
      if (t % 4 !== 0) return;
      const z = world.zombies;
      for (let k = 0; k < z.aliveCount; k++) {
        const id = z.aliveIds[k] as number;
        if (z.type[id] === bloater) continue;
        applyZombieDamage(world, id, 1000, 1, 0, 0, "p0", "pistol");
        break;
      }
    });
    console.log(`[bloater bandwidth, wave 6] ${r.swells} swells, ${r.bursts} bursts in 90 s; added per client ${r.addedBps.map((v) => v.toFixed(1)).join(" / ")} B/s; worst tick ${r.peak} B`);
    expect(r.bursts).toBeGreaterThanOrEqual(5); // liveness: Bloaters reached the team and burst
    expect(r.swells).toBeGreaterThanOrEqual(5);
    for (const v of r.addedBps) expect(v).toBeLessThan(50);
  }, 120_000);

  it("a forced 20-Bloater chain in one crowd: ≤ 8 bursts a tick keep the worst tick bounded", () => {
    const c = new RunController({ balance, seed: 5, players: [{ playerId: "p0", slot: 0 }], pauseWaves: true, map: PLACEHOLDER_MAP });
    const w = c.world;
    w.debug.godMode = true;
    const p = w.players.get("p0");
    if (!p) throw new Error("no player");
    p.x = 24;
    p.y = 16;
    startWave(w);
    for (let i = 0; i < 20; i++) spawnZombie(w, "bloater", 20 + (i % 5) * 1.05, 14 + Math.floor(i / 5) * 1.05);
    for (let i = 0; i < 40; i++) spawnZombie(w, "walker", 19 + (i % 8) * 0.75, 18 + Math.floor(i / 8) * 0.75);
    const r = measure(c, 3, () => [[24, 16]], (world, t) => {
      if (t === 0) applyZombieDamage(world, world.zombies.aliveIds[0] as number, 1000, 1, 0, 0, "p0", "pistol");
    });
    console.log(`[bloater bandwidth, chain] ${r.bursts} bursts; worst tick ${r.peak} B; ${r.addedBps[0]?.toFixed(0)} B/s over the 3 s`);
    expect(r.bursts).toBe(20);
    expect(r.peak).toBeLessThan(1500);
  });
});
