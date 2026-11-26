import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { holdPlayer, returnPlayer } from "../player/hold";
import { addPlayer, removePlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { throwConsumable } from "../combat/grenades";
import { consumableIndex, throwStatsOf } from "../economy/consumables";
import { igniteMolotov } from "../hazards/molotov";
import { AREA_KIND, spawnArea } from "../hazards/areaPool";
import {
  castVote,
  countVotes,
  endRun,
  isEvacWave,
  openEvacVote,
  resolveEvacVote,
  skipWave,
  startBuild,
  startWave,
  voteOutcome,
  VOTE_EXTRACT,
  VOTE_NONE,
  VOTE_STAY,
  type EvacChoice,
} from "./runStateMachine";

/**
 * Story 6.11: the evacuation vote (fairness rules F1–F7, every transition; brief lines 3, 9, 28).
 * Story 6.12: Stay → endless, a vote after every 5th endless wave, a wipe after Stay = "lost".
 */
const balance = loadBalance();
const VOTE_TICKS = ticksFor(balance.waves.evac.voteS);
const HOLD_TICKS = ticksFor(balance.waves.evac.allVotedHoldS);

function setup(ids: readonly string[] = ["p0", "p1"]) {
  const world = createWorld({ balance, seed: 7, systems: { zombies: () => {} } });
  world.debug.bossWaves = []; // the vote flow alone (the Behemoth's own tests cover wave 10's boss)
  const players = ids.map((id, i) => addPlayer(world, id, 20 + i * 3, 16));
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const ofType = (events: readonly SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type);
/** Lobby → … → the vote after wave `n` (waves skipped by the dev cheat; the run's flow, not a hand-set phase). */
function toVoteAfter(world: World, n = balance.waves.runWaves): void {
  if (world.run.phase === "lobby") startBuild(world);
  while (world.run.phase === "build" || world.run.phase === "wave") {
    if (world.run.phase === "build") startWave(world);
    skipWave(world);
    if (world.waves.number >= n) break;
  }
  expect(world.run.phase).toBe("vote");
  expect(world.waves.number).toBe(n);
}

describe("Story 6.11: the vote opens only when the wave is really over (F6)", () => {
  it("isEvacWave: wave 10 only in the run; in endless 10, 15, 20, 25 (6.12)", () => {
    const run = Array.from({ length: 30 }, (_, i) => i + 1).filter((w) => isEvacWave(balance, w));
    expect(run).toEqual(Array.from({ length: 21 }, (_, i) => i + 10)); // 10, and any wave past it outside endless (a run never plays on without a Stay)
    const endless = Array.from({ length: 30 }, (_, i) => i + 1).filter((w) => isEvacWave(balance, w, true));
    expect(endless).toEqual([10, 15, 20, 25, 30]);
  });

  it("Wave → Vote on the clearing tick of wave 10: the bonus is paid, rounds and blasts are gone, run.vote_opened { wave, ticks }", () => {
    const { world, events } = setup();
    toVoteAfter(world);
    expect(world.run.voteTicksLeft).toBe(VOTE_TICKS);
    expect(VOTE_TICKS).toBe(300); // F4: 15 s
    expect(world.grenades.count).toBe(0);
    run(world, 1);
    expect(ofType(events, "run.vote_opened")).toEqual([{ type: "run.vote_opened", wave: 10, ticks: 300 }]);
    expect(ofType(events, "money.earned").filter((e) => (e as { reason: string }).reason === "wave").length).toBeGreaterThanOrEqual(20); // 10 waves × 2 players
  });

  it("openEvacVote / resolveEvacVote from a wrong phase throw; castVote outside a vote is ignored", () => {
    const { world } = setup();
    expect(() => openEvacVote(world)).toThrow(/not allowed from phase "lobby"/);
    expect(() => resolveEvacVote(world)).toThrow(/not allowed from phase "lobby"/);
    startBuild(world);
    castVote(world, "p0", "stay");
    expect(world.players.get("p0")?.vote).toBe(VOTE_NONE);
    expect(() => resolveEvacVote(world)).toThrow(/not allowed from phase "build"/);
    startWave(world);
    expect(() => resolveEvacVote(world)).toThrow(/not allowed from phase "wave"/);
    castVote(world, "p0", "stay");
    expect(world.players.get("p0")?.vote).toBe(VOTE_NONE);
  });
});

describe("Story 6.11: everyone votes, Stay needs a real majority (F1, F3, D1)", () => {
  it("voteOutcome: more than half of the players in the run must vote Stay; ties and silence → Extract", () => {
    expect(voteOutcome(2, 4)).toBe("extract"); // 2 Stay / 2 Extract
    expect(voteOutcome(2, 4)).toBe("extract"); // 2 Stay / 2 silent
    expect(voteOutcome(3, 4)).toBe("stay");
    expect(voteOutcome(2, 3)).toBe("stay");
    expect(voteOutcome(1, 2)).toBe("extract");
    expect(voteOutcome(1, 1)).toBe("stay"); // solo: Stay only if you tap Stay
    expect(voteOutcome(0, 1)).toBe("extract");
    expect(voteOutcome(0, 0)).toBe("extract");
  });

  /** One full vote: `votes[i]` for player i (null = silent); returns the result and the tally event. */
  function vote(votes: readonly (EvacChoice | null)[]) {
    const ids = votes.map((_, i) => `p${i}`);
    const { world, events } = setup(ids);
    toVoteAfter(world);
    votes.forEach((v, i) => v && castVote(world, ids[i] as string, v));
    run(world, VOTE_TICKS + 1);
    const resolved = ofType(events, "run.vote_resolved");
    expect(resolved.length).toBe(1);
    return { world, resolved: resolved[0] as Extract<SimEvent, { type: "run.vote_resolved" }> };
  }

  it("the F3 table for 1–4 players, silent players included, through the real vote", () => {
    const table: [readonly (EvacChoice | null)[], EvacChoice][] = [
      [[null], "extract"],
      [["stay"], "stay"],
      [["extract"], "extract"],
      [["stay", null], "extract"],
      [["stay", "stay"], "stay"],
      [["stay", "extract"], "extract"],
      [["stay", "stay", null], "stay"],
      [["stay", null, null], "extract"],
      [["stay", "stay", "extract", "extract"], "extract"],
      [["stay", "stay", null, null], "extract"],
      [["stay", "stay", "stay", null], "stay"],
      [["stay", "stay", "stay", "extract"], "stay"],
      [[null, null, null, null], "extract"],
    ];
    for (const [votes, want] of table) {
      const { world, resolved } = vote(votes);
      expect(resolved.choice, JSON.stringify(votes)).toBe(want);
      expect(resolved.stay + resolved.extract + resolved.silent).toBe(votes.length);
      expect(world.run.phase, JSON.stringify(votes)).toBe(want === "stay" ? "build" : "results");
    }
  });

  it("Story 8.12 (reverses 6.11 F1): a downed player doesn't count; the standing one decides alone", () => {
    const { world, players } = setup(["p0", "p1"]);
    toVoteAfter(world);
    downPlayer(world, players[1]!);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "extract"); // not counted
    run(world, HOLD_TICKS + 1); // everyone who counts voted: ends after the hold
    expect(world.run.phase).toBe("build");
    expect(world.run.endless).toBe(true);
  });

  it("a player who left is not counted (beat the rule 2): their Stay is gone and the vote can end early", () => {
    const { world, events } = setup(["p0", "p1", "p2"]);
    toVoteAfter(world);
    castVote(world, "p2", "stay");
    castVote(world, "p0", "stay");
    removePlayer(world, "p2");
    castVote(world, "p1", "extract");
    run(world, HOLD_TICKS + 1); // everyone LEFT voted: ends after the hold
    const r = ofType(events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(r).toEqual({ type: "run.vote_resolved", choice: "extract", extract: 1, stay: 1, silent: 0 }); // 1 of 2 is not more than half
  });

  it("unknown players are ignored", () => {
    const { world } = setup(["p0"]);
    toVoteAfter(world);
    castVote(world, "ghost", "stay");
    expect([...world.players.values()].map((p) => p.vote)).toEqual([VOTE_NONE]);
  });
});

describe("Story 6.11: live, changeable votes and the 15 s server clock (F2, F4, D2, D3)", () => {
  it("a vote can be changed until the vote ends; the last one counts", () => {
    const { world, events } = setup(["p0"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    expect(world.players.get("p0")?.vote).toBe(VOTE_STAY);
    castVote(world, "p0", "extract");
    castVote(world, "p0", "stay");
    castVote(world, "p0", "extract");
    expect(world.players.get("p0")?.vote).toBe(VOTE_EXTRACT);
    run(world, HOLD_TICKS + 1);
    expect((ofType(events, "run.vote_resolved")[0] as { choice: string }).choice).toBe("extract");
  });

  it("nobody votes: exactly 300 ticks, then Extract", () => {
    const { world } = setup();
    toVoteAfter(world);
    run(world, VOTE_TICKS - 1);
    expect(world.run.phase).toBe("vote");
    expect(world.run.voteTicksLeft).toBe(1);
    run(world, 1);
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
  });

  it("everyone voted: the vote ends allVotedHoldS (20 ticks) later, never later than the timer", () => {
    const { world } = setup();
    toVoteAfter(world);
    run(world, 50);
    castVote(world, "p0", "stay");
    run(world, 30);
    expect(world.run.voteTicksLeft).toBe(VOTE_TICKS - 80); // one vote: the clock runs on
    castVote(world, "p1", "stay");
    run(world, HOLD_TICKS - 1);
    expect(world.run.phase).toBe("vote");
    run(world, 1);
    expect(world.run.phase).toBe("build");
    // Late: all voted with 5 ticks left → it still ends on the timer (min).
    const b = setup();
    toVoteAfter(b.world);
    run(b.world, VOTE_TICKS - 5);
    castVote(b.world, "p0", "extract");
    castVote(b.world, "p1", "extract");
    run(b.world, 5);
    expect(b.world.run.phase).toBe("results");
  });

  it("two votes on the tick the timer hits 0: one result (beat the rule 8)", () => {
    const { world, events } = setup();
    toVoteAfter(world);
    run(world, VOTE_TICKS - 1);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    run(world, 3);
    expect(ofType(events, "run.vote_resolved")).toEqual([{ type: "run.vote_resolved", choice: "stay", extract: 0, stay: 2, silent: 0 }]);
  });
});

describe("Story 6.11: nothing can hurt you during the vote (F5, D4)", () => {
  it("review L3 (beat the rule 6): a grenade in flight, molotov fire and an acid puddle on the clearing tick are gone at the vote; nothing bursts or burns in it", () => {
    const { world, players, events } = setup(["p0"]);
    startBuild(world);
    while (world.waves.number < 9) {
      startWave(world);
      skipWave(world);
    }
    startWave(world);
    const p = players[0]!;
    const throws = throwStatsOf(balance, "grenades");
    if (!throws) throw new Error("no grenade stats");
    expect(throwConsumable(world, p, consumableIndex(balance, "grenades"), throws, 1, 0, 1)).toBe(true);
    igniteMolotov(world, consumableIndex(balance, "molotovs"), p.x + 3, p.y, "p0");
    spawnArea(world.areas, balance.zombies.spitCaps.maxLivePuddles, AREA_KIND.ACID, 1, p.x - 3, p.y, 1.5, 200, world.tick);
    expect(world.grenades.count).toBe(1);
    expect(world.molotovs.areas.count).toBe(1);
    expect(world.areas.count).toBe(1);
    skipWave(world); // the wave is cleared on this tick: the vote opens
    expect(world.run.phase).toBe("vote");
    expect(world.grenades.count).toBe(0);
    expect(world.molotovs.areas.count).toBe(0);
    expect(world.areas.count).toBe(0);
    const hp = p.hp;
    run(world, 120);
    expect(p.hp).toBe(hp);
    expect(ofType(events, "explosion.happened")).toEqual([]);
  });

  it("zombies, downed timers, movement and shots are frozen; the tick still advances", () => {
    const world = createWorld({ balance, seed: 7 }); // real zombie AI
    world.debug.bossWaves = [];
    const p0 = addPlayer(world, "p0", 20, 16);
    const p1 = addPlayer(world, "p1", 40, 16);
    toVoteAfter(world);
    const zid = spawnZombie(world, "walker", 22, 16); // next to p0
    downPlayer(world, p1);
    const downedLeft = p1.downedTicksLeft;
    const hp = p0.hp;
    const at = { x: p0.x, y: p0.y };
    const zx = world.zombies.x[zid];
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, fire: true });
    const tick = world.tick;
    run(world, 200);
    expect(world.tick).toBe(tick + 200);
    expect(p0.hp).toBe(hp);
    expect({ x: p0.x, y: p0.y }).toEqual(at);
    expect(world.zombies.x[zid]).toBe(zx);
    expect(p1.downedTicksLeft).toBe(downedLeft);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.run.phase).toBe("vote");
  });
});

describe("Story 6.11: the result always leads somewhere (F7, brief 28)", () => {
  it("Extract → run.extracted { wave, endless: false } then Results \"extracted\" on the same tick", () => {
    const { world, events } = setup(["p0"]);
    toVoteAfter(world);
    castVote(world, "p0", "extract");
    run(world, HOLD_TICKS + 1);
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
    expect(world.run.voteTicksLeft).toBe(0);
    expect(ofType(events, "run.extracted")).toEqual([{ type: "run.extracted", wave: 10, endless: false }]);
    run(world, 100);
    expect(world.run.phase).toBe("results"); // nothing moves on
  });

  it("Stay → a normal build phase for wave 11: endless on, downed players back, earnings at the vote recorded", () => {
    const { world, players, events } = setup(["p0", "p1"]);
    toVoteAfter(world);
    downPlayer(world, players[1]!);
    run(world, 1); // the dev skip's wave bonus is paid on this step
    players[0]!.earned = 1234;
    players[1]!.earned = 999;
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    run(world, HOLD_TICKS + 1);
    expect(world.run.phase).toBe("build");
    expect(world.run.endless).toBe(true);
    expect(world.run.buildTicksLeft).toBeGreaterThan(ticksFor(balance.waves.buildPhaseS) - 5);
    expect(players[1]!.status).toBe("alive");
    expect(players.map((p) => p.earnedAtEvac)).toEqual([1234, 999]);
    expect(ofType(events, "build.started").at(-1)).toEqual({ type: "build.started", wave: 11 });
    expect(ofType(events, "run.extracted")).toEqual([]);
  });

  it("endRun from the vote is allowed (the room drops a run); ending set", () => {
    const { world } = setup(["p0"]);
    toVoteAfter(world);
    endRun(world);
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("wiped");
  });

  it("same seed + the same votes → the same snapshotWorld (vote state replays)", () => {
    const go = () => {
      const { world } = setup(["p0", "p1"]);
      toVoteAfter(world);
      run(world, 10);
      castVote(world, "p0", "stay");
      run(world, 3);
      return snapshotWorld(world);
    };
    const a = go();
    expect(a.run.phase).toBe("vote");
    expect(go()).toEqual(a);
  });
});

describe("Story 6.12: endless — the next votes and the lost ending (F4, F7)", () => {
  it("Stay at 10 → waves 11–14 build/wave, the vote after 15; Extract there → endless: true; earnedAtEvac kept from the first Stay", () => {
    const { world, players, events } = setup(["p0"]);
    toVoteAfter(world, 10);
    run(world, 1); // the dev skip's wave bonus is paid on this step
    players[0]!.earned = 500;
    castVote(world, "p0", "stay");
    run(world, HOLD_TICKS + 1);
    toVoteAfter(world, 15);
    players[0]!.earned = 900;
    castVote(world, "p0", "stay");
    run(world, HOLD_TICKS + 1);
    expect(players[0]!.earnedAtEvac).toBe(500); // the FIRST Stay only
    toVoteAfter(world, 20);
    castVote(world, "p0", "extract");
    run(world, HOLD_TICKS + 1);
    expect(world.run.ending).toBe("extracted");
    expect(ofType(events, "run.extracted")).toEqual([{ type: "run.extracted", wave: 20, endless: true }]);
    expect(ofType(events, "run.vote_opened").map((e) => (e as { wave: number }).wave)).toEqual([10, 15, 20]);
  });

  it("a wipe after Stay ends the run \"lost\"; before any vote it stays \"wiped\"", () => {
    const { world, players } = setup(["p0"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    run(world, HOLD_TICKS + 1);
    startWave(world);
    downPlayer(world, players[0]!);
    run(world, 2);
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("lost");
    const b = setup(["p0"]);
    startBuild(b.world);
    startWave(b.world);
    downPlayer(b.world, b.players[0]!);
    run(b.world, 2);
    expect(b.world.run.ending).toBe("wiped");
  });
});

describe("Story 8.12: only connected, standing players vote (reverses 8.1 review M2)", () => {
  type Seat = EvacChoice | null | "held" | "downed-extract" | "downed-stay" | "out-extract";
  /** One full vote through the real run: each seat votes, then is held / downed / out as named; returns the tally event. */
  function vote(seats: readonly Seat[], endEarly = false) {
    const ids = seats.map((_, i) => `p${i}`);
    const { world, players, events } = setup(ids);
    toVoteAfter(world);
    seats.forEach((s, i) => {
      const id = ids[i] as string;
      const p = players[i]!;
      if (s === "stay" || s === "extract") castVote(world, id, s);
      else if (s === "held") holdPlayer(world, id);
      else if (s === "downed-extract" || s === "downed-stay") {
        castVote(world, id, s === "downed-stay" ? "stay" : "extract"); // voted while standing, then went down
        downPlayer(world, p);
      } else if (s === "out-extract") {
        castVote(world, id, "extract");
        p.status = "out"; // dead (spectating)
      }
    });
    run(world, endEarly ? HOLD_TICKS + 1 : VOTE_TICKS + 1);
    const resolved = ofType(events, "run.vote_resolved") as Extract<SimEvent, { type: "run.vote_resolved" }>[];
    expect(resolved.length, JSON.stringify(seats)).toBe(1);
    return { world, r: resolved[0]! };
  }

  it("the AC 1 table: held, downed and out seats leave the count; a tie is Extract", () => {
    const table: [readonly Seat[], EvacChoice, number][] = [
      // seats, result, players counted
      [["stay", "stay", "extract", "held"], "stay", 3],
      [["stay", "stay", "held", "held"], "stay", 2],
      [["stay", "extract", "extract", "held"], "extract", 3],
      [["stay", "stay", "extract", "extract"], "extract", 4],
      [["stay", "stay", null], "stay", 3],
      [["stay", "stay", "extract", "downed-extract"], "stay", 3],
      [["stay", "extract", "downed-stay", "downed-stay"], "extract", 2],
      [["stay", "stay", "extract", "out-extract"], "stay", 3],
      [["stay", "held", "downed-extract", null], "extract", 2], // 1 of 2: not more than half
    ];
    for (const [seats, want, counted] of table) {
      const { world, r } = vote(seats);
      expect(r.choice, JSON.stringify(seats)).toBe(want);
      expect(r.stay + r.extract + r.silent, JSON.stringify(seats)).toBe(counted);
      expect(world.run.phase, JSON.stringify(seats)).toBe(want === "stay" ? "build" : "results");
    }
  });

  it("AC 2: the vote ends early once every counted player voted (held and downed seats skipped)", () => {
    const { world } = vote(["stay", "stay", "held", "downed-extract"], true);
    expect(world.run.endless).toBe(true);
    expect(world.run.phase).toBe("build");
  });

  it("AC 2 (review L2): a silent DOWNED player doesn't hold the early end — 2 Stay + 1 downed silent ends after the hold beat", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    downPlayer(world, players[2]!); // never votes
    run(world, HOLD_TICKS - 1);
    expect(world.run.phase).toBe("vote");
    run(world, 1);
    expect(world.run.phase).toBe("build"); // without the countsInVote skip in everyoneVoted it waits the full timer
  });

  it("AC 2: a silent standing player still holds the timer open", () => {
    const { world } = setup(["p0", "p1", "p2"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    holdPlayer(world, "p2");
    run(world, HOLD_TICKS + 5);
    expect(world.run.phase).toBe("vote");
    expect(world.run.voteTicksLeft).toBe(VOTE_TICKS - HOLD_TICKS - 5);
  });

  it("AC 3: a seat that returns mid-vote counts again from that tick, silent (= Extract) until it votes", () => {
    // a: 2 seats, 1 Stay + 1 held (its earlier Stay cleared by the hold) → ends early, Stay.
    // b: the same, but the seat returns 5 ticks into the hold beat: silent, 1 of 2 → Extract (the beat isn't re-extended, D2).
    // c: 3 seats, 1 Stay + 1 Extract + 1 held; the seat returns and votes Stay → 2 of 3 → Stay.
    const a = setup(["p0", "p1"]);
    toVoteAfter(a.world);
    castVote(a.world, "p0", "stay");
    castVote(a.world, "p1", "stay"); // cleared by the hold (pressed while gone)
    holdPlayer(a.world, "p1");
    expect(countVotes(a.world)).toEqual({ extract: 0, stay: 1, silent: 0 });
    run(a.world, HOLD_TICKS + 1);
    expect(a.world.run.phase).toBe("build"); // ended early (everyone who counts voted) → Stay
    // The same, with the seat back inside the hold beat:

    const b = setup(["p0", "p1"]);
    toVoteAfter(b.world);
    castVote(b.world, "p0", "stay");
    castVote(b.world, "p1", "stay");
    holdPlayer(b.world, "p1");
    run(b.world, 5);
    expect(returnPlayer(b.world, "p1")).toBe(true);
    expect(b.world.players.get("p1")?.vote).toBe(VOTE_NONE); // starts silent
    expect(countVotes(b.world)).toEqual({ extract: 0, stay: 1, silent: 1 });
    // 5 ticks ago everyone who counted (p0) had voted, so the 1 s hold beat started; a return never re-extends it
    // (6.11 F4: the timer only shortens, decision 8.12 D2), but the silent returner still counts at the resolve.
    expect(b.world.run.voteTicksLeft).toBe(HOLD_TICKS - 5);
    run(b.world, HOLD_TICKS - 5);
    const r = ofType(b.events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(r).toEqual({ type: "run.vote_resolved", choice: "extract", extract: 0, stay: 1, silent: 1 }); // 1 of 2

    // The returner votes Stay: counts at resolve.
    const c = setup(["p0", "p1", "p2"]);
    toVoteAfter(c.world);
    castVote(c.world, "p0", "stay");
    castVote(c.world, "p1", "extract");
    holdPlayer(c.world, "p2");
    run(c.world, 10);
    returnPlayer(c.world, "p2");
    castVote(c.world, "p2", "stay");
    run(c.world, HOLD_TICKS + 1);
    const rc = ofType(c.events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(rc).toEqual({ type: "run.vote_resolved", choice: "stay", extract: 1, stay: 2, silent: 0 });
  });

  it("the threshold recomputes when someone drops mid-vote: 2 Stay + 2 Extract (tie, Extract) → one Extract voter drops → Stay", () => {
    const { world, events } = setup(["p0", "p1", "p2", "p3"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    castVote(world, "p2", "extract");
    run(world, 10);
    expect(world.run.phase).toBe("vote"); // p3 silent
    holdPlayer(world, "p3"); // the silent one drops: now everyone who counts has voted, 2 of 3 Stay
    run(world, HOLD_TICKS + 1);
    const r = ofType(events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(r).toEqual({ type: "run.vote_resolved", choice: "stay", extract: 1, stay: 2, silent: 0 });
  });

  it("guard for the future (status is frozen during the vote today: no down or revive runs in phase vote): a player standing again before the resolve counts with the choice they made", () => {
    const { world, players, events } = setup(["p0", "p1", "p2"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "extract");
    castVote(world, "p2", "extract");
    downPlayer(world, players[2]!);
    expect(countVotes(world)).toEqual({ extract: 1, stay: 1, silent: 0 });
    players[2]!.status = "alive"; // revived (the revive path is downed.test.ts's)
    run(world, HOLD_TICKS + 1);
    const r = ofType(events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(r).toEqual({ type: "run.vote_resolved", choice: "extract", extract: 2, stay: 1, silent: 0 });
  });

  it("AC 4: nobody counts (every seat held) → the timer runs out → Extract", () => {
    const { world, events } = setup(["p0", "p1"]);
    toVoteAfter(world);
    castVote(world, "p0", "stay");
    holdPlayer(world, "p0");
    holdPlayer(world, "p1");
    run(world, VOTE_TICKS - 1);
    expect(world.run.phase).toBe("vote"); // no early end with nobody counting
    run(world, 2);
    const r = ofType(events, "run.vote_resolved")[0] as Extract<SimEvent, { type: "run.vote_resolved" }>;
    expect(r).toEqual({ type: "run.vote_resolved", choice: "extract", extract: 0, stay: 0, silent: 0 });
    expect(world.run.ending).toBe("extracted");
  });

  it("AC 4: nobody counts (one held, one downed who voted Stay) → Extract", () => {
    const { world, r } = vote(["held", "downed-stay"]);
    expect(r).toEqual({ type: "run.vote_resolved", choice: "extract", extract: 0, stay: 0, silent: 0 });
    expect(world.run.ending).toBe("extracted");
  });
});
