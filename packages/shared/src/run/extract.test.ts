import { afterEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S, TICK_RATE_HZ } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { holdPlayer, returnPlayer } from "../player/hold";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { spawnZombie } from "../zombies/zombiePool";
import { AREA_KIND, spawnArea } from "../hazards/areaPool";
import { bodyFitsInMap, circleOverlapsBox } from "../buildings/collision";
import { castVote, skipWave, startBuild, startWave } from "./runStateMachine";
import { EXTRACT_PROTECT_TICKS, evacPadPoint, extractTestHooks } from "./extract";

/** Story 12.2: the extraction — walk to the helicopter, board, lift off, fly out, then Results. */
const balance = loadBalance();
const ev = balance.waves.evac;
const PAD = evacPadPoint(DOWNTOWN_MAP, { x: 0, y: 0 });
const WALK_TIMEOUT = ticksFor(ev.walkTimeoutS);
const FLY_OUT = ticksFor(ev.flyOutS);

afterEach(() => extractTestHooks.stalled.clear());

function setup(n = 4, seed = 11) {
  const world = createWorld({ balance, seed, map: DOWNTOWN_MAP });
  world.debug.bossWaves = []; // the extraction alone (the boss has its own tests)
  const at = { x: 0, y: 0 };
  const players: PlayerState[] = [];
  for (let i = 0; i < n; i++) {
    teamSpawnPoint(world, i, at);
    players.push(addPlayer(world, `p${i}`, at.x, at.y));
  }
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}

/** Lobby → … → the vote after wave 10 (dev skips: the run's own transitions). */
function toVote(world: World): void {
  startBuild(world);
  while (world.run.phase === "build" || world.run.phase === "wave") {
    if (world.run.phase === "build") startWave(world);
    skipWave(world);
  }
  expect(world.run.phase).toBe("vote");
}

function voteExtract(world: World): void {
  for (const id of world.players.keys()) castVote(world, id, "extract");
}

/** Steps until `phase` (or `max` ticks); returns the ticks stepped. */
function runUntil(world: World, done: (w: World) => boolean, max = 2000): number {
  let t = 0;
  while (!done(world) && t < max) {
    step(world, TICK_DT_S);
    t++;
  }
  return t;
}
const ofType = <T extends SimEvent["type"]>(events: readonly SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe("Story 12.2: Vote → Extract → Results", () => {
  it("a 4-player team votes Extract: everyone walks aboard within walkTimeoutS, run.lifted, then endRun after flyOutS (ending extracted)", () => {
    const { world, events } = setup();
    toVote(world);
    voteExtract(world);
    runUntil(world, (w) => w.run.phase !== "vote");
    expect(world.run.phase).toBe("extract");
    expect(world.run.ending).toBe("extracted"); // decided at the vote (AC 1)
    expect(ofType(events, "run.extracted")).toHaveLength(1);
    const startTick = world.tick;
    runUntil(world, (w) => w.run.phase === "results");
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
    const boarded = ofType(events, "player.boarded");
    expect(boarded.map((e) => e.playerId).sort()).toEqual(["p0", "p1", "p2", "p3"]);
    expect(ofType(events, "run.extract_cut")).toHaveLength(0); // everyone walked (no timeout)
    const lifted = ofType(events, "run.lifted");
    expect(lifted).toHaveLength(1);
    const liftTick = lifted[0]!.tick;
    expect(liftTick - startTick).toBeLessThan(WALK_TIMEOUT + ticksFor(ev.liftBeatS) + 1);
    expect(world.extract.liftedAtTick).toBe(liftTick);
    expect(ofType(events, "run.extract_done")).toHaveLength(1);
    expect(world.tick - 1 - liftTick).toBe(FLY_OUT); // the fly-out's full length, then Results the same tick
    // FR67 reworded: the survivors walk and fly out in ≤ 20 s, then Results.
    expect((world.tick - startTick) / TICK_RATE_HZ).toBeLessThanOrEqual(20);
  });

  it("boarding waits for the landing: a vote resolved before descendS boards nobody until the helicopter is down", () => {
    const { world, players, events } = setup(1);
    toVote(world);
    // Stand ON the pad, vote at once: the vote resolves allVotedHoldS later (1 s < descendS 2 s).
    players[0]!.x = PAD.x;
    players[0]!.y = PAD.y;
    voteExtract(world);
    const openedAt = world.tick;
    runUntil(world, (w) => w.run.phase === "extract");
    expect(world.extract.landTicksLeft).toBeGreaterThan(0);
    runUntil(world, () => ofType(events, "player.boarded").length > 0, 200);
    expect(world.tick - openedAt).toBeGreaterThanOrEqual(Math.round(ev.descendS * TICK_RATE_HZ));
  });

  it("walks from far corners of Downtown: every reachable spot boards before the timeout (no cut)", () => {
    const spots: { x: number; y: number }[] = [];
    const r = balance.player.radiusM;
    const solids = DOWNTOWN_MAP.solids ?? [];
    for (let y = 2; y < DOWNTOWN_MAP.heightM - 1; y += 3) {
      for (let x = 2; x < DOWNTOWN_MAP.widthM - 1; x += 5) {
        if (!bodyFitsInMap(x, y, r + 0.3, DOWNTOWN_MAP.widthM, DOWNTOWN_MAP.heightM)) continue;
        if (solids.some((b) => circleOverlapsBox(x, y, r + 0.3, b.minX, b.minY, b.maxX, b.maxY))) continue;
        spots.push({ x, y });
      }
    }
    expect(spots.length).toBeGreaterThan(40);
    let worst = 0;
    for (let k = 0; k < spots.length; k += 4) {
      const { world, events } = setup(Math.min(4, spots.length - k));
      toVote(world);
      let i = 0;
      for (const p of world.players.values()) {
        const s = spots[k + i++]!;
        p.x = p.prevX = s.x;
        p.y = p.prevY = s.y;
      }
      voteExtract(world);
      runUntil(world, (w) => w.run.phase === "extract");
      const start = world.tick;
      runUntil(world, (w) => w.extract.liftedAtTick >= 0, 400);
      expect(ofType(events, "run.extract_cut"), `spots ${k}..${k + 3}`).toHaveLength(0);
      worst = Math.max(worst, world.extract.liftedAtTick - start);
    }
    expect(worst).toBeLessThan(WALK_TIMEOUT);
  });
});

describe("Story 12.2: who boards how (CN-3, CN-4)", () => {
  it("a downed survivor stands up where they lie and walks; an out one and a held seat board at the start", () => {
    const { world, players, events } = setup(4);
    toVote(world);
    const [standing, downed, out, held] = players as [PlayerState, PlayerState, PlayerState, PlayerState];
    downPlayer(world, downed);
    downPlayer(world, out);
    out.status = "out";
    holdPlayer(world, held.id);
    voteExtract(world);
    const downedAt = { x: downed.x, y: downed.y };
    runUntil(world, (w) => w.run.phase === "extract");
    expect(downed.status).toBe("alive");
    expect(downed.hp).toBeGreaterThan(0);
    expect({ x: downed.x, y: downed.y }).toEqual(downedAt); // stood up in place
    expect(world.extract.boarded.has(out.id)).toBe(true);
    expect(world.extract.boarded.has(held.id)).toBe(true);
    expect(world.extract.boarded.has(downed.id)).toBe(false);
    expect(world.extract.boarded.has(standing.id)).toBe(false);
    runUntil(world, (w) => w.run.phase === "results");
    expect(new Set(ofType(events, "player.boarded").map((e) => e.playerId))).toEqual(new Set(["p0", "p1", "p2", "p3"]));
    expect(ofType(events, "run.extract_cut")).toHaveLength(0);
  });

  it("a held seat that comes back mid-walk stays aboard (never walks again)", () => {
    const { world, players } = setup(2);
    toVote(world);
    holdPlayer(world, players[1]!.id);
    voteExtract(world);
    runUntil(world, (w) => w.run.phase === "extract");
    returnPlayer(world, players[1]!.id);
    step(world, TICK_DT_S);
    expect(world.extract.boarded.has(players[1]!.id)).toBe(true);
    expect(world.inputs.has(players[1]!.id)).toBe(false);
  });

  it("a survivor held up past walkTimeoutS (test hook) is boarded by the cut: run.extract_cut once, then the lift-off", () => {
    const { world, players, events } = setup(2);
    toVote(world);
    extractTestHooks.stalled.add(players[1]!.id);
    players[1]!.x = players[1]!.prevX = 6; // far from the pad (the team starts are next to it)
    players[1]!.y = players[1]!.prevY = 4;
    voteExtract(world);
    runUntil(world, (w) => w.run.phase === "extract");
    const start = world.tick;
    runUntil(world, (w) => w.extract.liftedAtTick >= 0);
    const cut = ofType(events, "run.extract_cut");
    expect(cut).toHaveLength(1);
    expect(world.extract.boarded.has(players[1]!.id)).toBe(true);
    expect(world.extract.liftedAtTick - start).toBeGreaterThanOrEqual(WALK_TIMEOUT);
    runUntil(world, (w) => w.run.phase === "results");
    expect(world.run.ending).toBe("extracted");
  });
});

describe("Story 12.2: nothing hurts, nothing counts", () => {
  it("AC 3: player input is ignored during the extract (the autopilot alone moves the bodies)", () => {
    const a = setup(2);
    const b = setup(2);
    for (const { world } of [a, b]) {
      toVote(world);
      voteExtract(world);
      runUntil(world, (w) => w.run.phase === "extract");
    }
    const wild = { ...NEUTRAL_INPUT, moveX: -1, moveY: 1, fire: true, aimX: 1, swap: true, consumable: true };
    for (let t = 0; t < 60; t++) {
      for (const id of b.world.players.keys()) setInput(b.world, id, { ...wild, seq: t + 1 });
      step(a.world, TICK_DT_S);
      step(b.world, TICK_DT_S);
    }
    expect(snapshotWorld(b.world).players.map(([, p]) => [p.x, p.y])).toEqual(snapshotWorld(a.world).players.map(([, p]) => [p.x, p.y]));
    expect(b.events.filter((e) => e.type.startsWith("weapon.") || e.type === "consumable.used")).toHaveLength(a.events.filter((e) => e.type.startsWith("weapon.") || e.type === "consumable.used").length);
  });

  it("AC 4: no damage — zombies at the body, an acid puddle and a fire under it, the whole phase", () => {
    const { world, players, events } = setup(2);
    toVote(world);
    voteExtract(world);
    runUntil(world, (w) => w.run.phase === "extract");
        const p = players[0]!;
    for (let k = 0; k < 6; k++) spawnZombie(world, "walker", p.x + 0.6, p.y, false);
    spawnArea(world.areas, 8, AREA_KIND.ACID, 1, p.x, p.y, 3, 400, world.tick);
    const hp = players.map((q) => q.hp);
    const from = events.length;
    runUntil(world, (w) => w.run.phase === "results");
    expect(players.map((q) => q.hp)).toEqual(hp);
    expect(events.slice(from).filter((e) => e.type === "player.damaged" || e.type === "player.downed")).toHaveLength(0);
    for (const q of players) expect(q.protectTicks).toBeGreaterThan(EXTRACT_PROTECT_TICKS - 2);
  });

  it("AC 10 / X8: the horde spawns only after the lift-off; it is no wave and counts for nothing (no kill, no money, milestone counters unchanged)", () => {
    const { world, players, events } = setup(2);
    toVote(world);
    voteExtract(world);
    runUntil(world, (w) => w.run.phase === "extract");
    const before = players.map((p) => ({ kills: p.kills, earned: p.earned, wallet: p.wallet, revives: p.revives, downs10: p.downs10, barricades: p.barricades, waveMask: p.waveMask, wavesIn: p.wavesIn }));
    const wave = world.waves.number;
    runUntil(world, (w) => w.extract.liftedAtTick >= 0);
    expect(world.zombies.aliveCount).toBe(0); // nothing before the lift-off
    const from = events.length;
    runUntil(world, (w) => w.run.phase === "results");
    expect(world.extract.hordeSpawned).toBe(Math.min(ev.flyOutHorde.count, Math.floor(((FLY_OUT + 1) * ev.flyOutHorde.perS) / TICK_RATE_HZ)));
    expect(world.zombies.aliveCount).toBeGreaterThan(0);
    const after = events.slice(from);
    expect(after.filter((e) => e.type === "zombie.killed" || e.type === "money.earned" || e.type.startsWith("wave."))).toHaveLength(0);
    expect(world.waves.number).toBe(wave);
    expect(players.map((p) => ({ kills: p.kills, earned: p.earned, wallet: p.wallet, revives: p.revives, downs10: p.downs10, barricades: p.barricades, waveMask: p.waveMask, wavesIn: p.wavesIn }))).toEqual(before);
  });

  it("the horde heads for the pad (the boarded bodies wait there)", () => {
    const { world } = setup(1);
    toVote(world);
    voteExtract(world);
    runUntil(world, (w) => w.extract.liftedAtTick >= 0);
    runUntil(world, (w) => w.zombies.aliveCount >= 4);
    const z = world.zombies;
    const d0 = Array.from({ length: z.aliveCount }, (_, i) => Math.hypot((z.x[z.aliveIds[i]!] as number) - PAD.x, (z.y[z.aliveIds[i]!] as number) - PAD.y));
    const ids = Array.from(z.aliveIds.subarray(0, z.aliveCount));
    runUntil(world, (w) => w.run.phase === "results");
    const d1 = ids.map((id) => Math.hypot((z.x[id] as number) - PAD.x, (z.y[id] as number) - PAD.y));
    expect(d1.filter((d, i) => d < d0[i]!).length).toBeGreaterThanOrEqual(Math.ceil(ids.length / 2));
  });
});

describe("Story 12.2: determinism", () => {
  it("the same run twice gives the same digest through the extraction (no new replay command)", () => {
    const go = () => {
      const { world } = setup(3, 21);
      toVote(world);
      voteExtract(world);
      runUntil(world, (w) => w.run.phase === "results");
      return JSON.stringify(snapshotWorld(world));
    };
    const a = go();
    expect(go()).toBe(a);
    expect(a).toContain('"extract"');
  });
});
