import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import { DOWNTOWN_MAP, PLACEHOLDER_MAP, NET_EVENT_KIND, TICK_DT_S, loadBalance, spawnZombie, startWave, type NetEvent, type NetEventContext, type SimEvent, type World } from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";

/**
 * Story 5.6 (brief line 11, AC 14): what Spitters add to each client's `sim.events_flushed`. The
 * windup rides in the horde stream's state nibble (0 B); `spitter.spat` and `acid.splashed` are
 * local events (`EventInterest`), the acid `player.damaged` (source −2) is global. Measured per
 * client as the bytes of its tick message with everything minus the same message without the
 * Spitter-caused tuples (spat, splashed, acid damage).
 */
const balance = loadBalance();
const SECONDS = 30;
const TICKS = SECONDS / TICK_DT_S;
const SPIT_KINDS = new Set<number>([NET_EVENT_KIND.SPITTER_SPAT, NET_EVENT_KIND.ACID_SPLASHED]);

/** Story estimate: ~24 B per spit (spat + splash) — measured worst case 33 B; acid damage ~7 B per hit. */
const EST_BYTES_PER_SPIT = 24;

interface Result {
  /** Added B/s per client. */
  addedBps: number[];
  spits: number;
  hits: number;
  acidHits: number;
}

function measure(c: RunController, views: () => readonly (readonly [number, number])[], each?: (w: World, t: number) => void): Result {
  const world = c.world;
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const interest = new EventInterest();
  const added = [0, 0, 0, 0];
  let spits = 0;
  let hits = 0;
  let acidHits = 0;
  const without: NetEvent[] = [];
  for (let t = 0; t < TICKS; t++) {
    each?.(world, t);
    const events = c.tick();
    for (const e of events as readonly SimEvent[]) {
      if (e.type === "spitter.spat") spits++;
      else if (e.type === "acid.splashed" && e.hitPlayerId !== null) hits++;
      else if (e.type === "player.damaged" && e.sourceZombieId === -2) acidHits++;
    }
    interest.prepare(world, events, ctx);
    const vs = views();
    for (let i = 0; i < vs.length; i++) {
      const [vx, vy] = vs[i] as readonly [number, number];
      const mine = interest.eventsFor(world, vx, vy);
      if (mine.length === 0) continue;
      without.length = 0;
      for (const tu of mine) if (!SPIT_KINDS.has(tu[0] as number) && !(tu[0] === NET_EVENT_KIND.PLAYER_DAMAGED && tu[3] === -2)) without.push(tu);
      const all = pack({ tick: world.tick, events: mine }).length;
      const rest = without.length > 0 ? pack({ tick: world.tick, events: without }).length : 0;
      added[i] = (added[i] as number) + all - rest;
    }
  }
  return { addedBps: added.map((b) => b / SECONDS), spits, hits, acidHits };
}

describe("Spitter bandwidth (Story 5.6, brief line 11)", () => {
  it("stress: 20 Spitters in range of one god-mode player, 30 s: spits flow constantly, bytes stay inside the estimate × 1.5", () => {
    const c = new RunController({ balance, seed: 5, players: [{ playerId: "p0", slot: 0 }], pauseWaves: true, map: PLACEHOLDER_MAP });
    const w = c.world;
    w.debug.godMode = true;
    const p = w.players.get("p0");
    if (!p) throw new Error("no player");
    p.x = 24;
    p.y = 16;
    startWave(w);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 2 * Math.PI;
      spawnZombie(w, "spitter", 24 + Math.cos(a) * 5, 16 + Math.sin(a) * 5);
    }
    const r = measure(c, () => [[24, 16]]);
    const spitsPerS = r.spits / SECONDS;
    const est = spitsPerS * EST_BYTES_PER_SPIT;
    console.log(`[spit bandwidth, stress] 20 Spitters: ${spitsPerS.toFixed(1)} spits/s, ${r.hits} hits; added ${r.addedBps[0]?.toFixed(0)} B/s (estimate ${est.toFixed(0)} B/s)`);
    expect(r.spits).toBeGreaterThanOrEqual(10); // liveness
    expect(r.hits).toBeGreaterThanOrEqual(5);
    expect(r.addedBps[0] as number).toBeLessThanOrEqual(est * 1.5);
  });

  it("wave 4 on Downtown at 4 players with its Spitters: added B/s per client (spits, splashes, acid damage)", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 9, players, map: DOWNTOWN_MAP });
    const w = c.world;
    for (const p of w.players.values()) p.hp = 1e9; // standing all wave (no bots: they only stand and get spat at)
    w.run.phase = "build";
    w.waves.number = 3;
    startWave(w); // wave 4: walker 81, runner 40, crawler 27, spitter 12
    expect(w.waves.number).toBe(4);
    const view = (): (readonly [number, number])[] => [...w.players.values()].map((p) => [p.x, p.y] as const);
    const r = measure(c, view);
    const total = r.spits * EST_BYTES_PER_SPIT + r.acidHits * 7;
    console.log(
      `[spit bandwidth, wave 4] ${r.spits} spits, ${r.hits} spit hits, ${r.acidHits} acid hits in ${SECONDS} s; added per client ${r.addedBps.map((v) => v.toFixed(0)).join(" / ")} B/s (estimate ≤ ${(total / SECONDS).toFixed(0)} B/s to each)`,
    );
    expect(r.spits).toBeGreaterThanOrEqual(10); // liveness: the wave's Spitters reached the team and spat
    expect(r.hits).toBeGreaterThanOrEqual(5);
    for (const v of r.addedBps) expect(v).toBeLessThanOrEqual((total / SECONDS) * 1.5);
    for (const v of r.addedBps) expect(v).toBeLessThan(1024); // far inside the 30 KB/s total
  }, 60_000);
});
