import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { addPlayer, removePlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import {
  castVote,
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

  it("a downed player votes too (F1)", () => {
    const { world, players } = setup(["p0", "p1"]);
    toVoteAfter(world);
    downPlayer(world, players[1]!);
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    run(world, HOLD_TICKS + 1);
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
