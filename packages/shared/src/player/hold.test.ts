import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { castVote, countVotes, openEvacVote, resolveEvacVote, startBuild, startWave } from "../run/runStateMachine";
import { playersInRun } from "../events/common";
import { ticksFor } from "../core/time";
import { waveSize } from "../waves/waveDirector";
import { bossMaxHp } from "../boss/bossState";
import { spawnZombie } from "../zombies/zombiePool";
import { createExplosionSpec, explode } from "../combat/explosion";
import { earn } from "../economy/economy";
import { createHeadlessWorld, replayRun, applyCommand, createInputLog, type ReplayCommand } from "../replay/inputLog";
import { placeBoss, slamOnly } from "../boss/testBoss";
import { downPlayer } from "./downed";
import { holdPlayer, isHeld, releaseHeldPlayer, restoreSeat, returnPlayer } from "./hold";
import { addPlayer, type PlayerState } from "./player";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

function setup(ids: readonly string[] = ["p0", "p1"], systems: object | null = NO_WAVES): { world: World; players: PlayerState[]; events: SimEvent[] } {
  const world = createWorld({ balance, seed: 11, ...(systems ? { systems } : {}) });
  const players = ids.map((id, i) => addPlayer(world, id, 10 + i * 10, 16));
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
/** Puts the run in a wave without the wave director (one mechanic at a time). */
const inWave = (world: World): void => {
  world.run.phase = "wave";
};

/**
 * AC 11 / F2: what a hold + return does to EVERY PlayerState field. A field added to PlayerState
 * without a line here fails "covers every field" (decide: kept exactly, or reset and why).
 * "kept" = the value is exactly the one at the hold; "placed" = moved by F4; anything else names
 * the value after the return.
 */
const FIELD_RULES: Record<keyof PlayerState, "kept" | "placed" | "reset"> = {
  id: "kept",
  x: "placed",
  y: "placed",
  prevX: "placed",
  prevY: "placed",
  facingX: "kept",
  facingY: "kept",
  hp: "kept",
  maxHp: "kept",
  radiusM: "kept",
  status: "kept", // downed → out is F1's own test
  loadout: "kept", // reloadTicks → 0 (its own test)
  shotAdvanceS: "kept",
  rewindMaxTicks: "kept",
  weaponsPaused: "kept",
  downedTicksLeft: "kept",
  reviveTicks: "reset",
  reviverId: "reset",
  reviveNeedTicks: "reset",
  buildReady: "reset", // a Ready pressed and then gone is not a Ready (F7)
  wallet: "kept",
  earned: "kept",
  vote: "reset", // 6.11 D1: a held player's vote counts as silent
  earnedAtEvac: "kept",
  slowTicksLeft: "kept",
  slowPct: "kept",
  fireTicks: "kept",
  acidTicks: "kept",
  knockTicks: "reset",
  knockDx: "reset",
  knockDy: "reset",
  knockStepMm: "reset",
  flameSlot: "kept", // reclaimed on return (the same slot when free)
  flaming: "reset",
  flameClock: "kept",
  gear: "kept",
  consumable: "kept",
  consumableCount: "kept",
  consumableCooldownTicks: "kept",
  lastAimX: "kept",
  lastAimY: "kept",
  lastAimM: "kept",
  lastAimTicks: "kept",
  protectTicks: "reset", // set by the mid-wave return (its own test)
  protectedReturnWave: "kept", // B15: set by a protected mid-wave return (its own test)
  wavesIn: "kept", // Story 7.2: the run record survives a hold (S2)
  endlessWavesIn: "kept",
  bossesIn: "kept",
  endlessBossesIn: "kept",
  waveMask: "kept", // Story 7.11: the milestone counters ride with the held seat (NP 21)
  kills: "kept",
  revives: "kept",
  downs10: "kept",
  barricades: "kept",
  barricadesPending: "kept",
};

/** Gives every field a non-default value so "kept" really means kept. */
function scramble(world: World, p: PlayerState): void {
  p.facingX = 0;
  p.facingY = 1;
  p.hp = 37;
  p.maxHp = 125;
  p.shotAdvanceS = 0.05;
  p.rewindMaxTicks = 6;
  p.wallet = 777;
  p.earned = 1234;
  p.earnedAtEvac = 99;
  p.wavesIn = 4; // Story 7.2
  p.endlessWavesIn = 2;
  p.bossesIn = 1;
  p.endlessBossesIn = 1;
  p.waveMask = 0b11111; // Story 7.11
  p.kills = 321;
  p.revives = 3;
  p.downs10 = 1;
  p.barricades = 7;
  p.barricadesPending.push(42);
  p.slowTicksLeft = 5;
  p.slowPct = 30;
  p.fireTicks = 3;
  p.acidTicks = 4;
  p.gear = 0b101;
  p.consumable = "medkit";
  p.consumableCount = 2;
  p.consumableCooldownTicks = 7;
  p.lastAimX = 0.6;
  p.lastAimY = 0.8;
  p.lastAimM = 5;
  p.lastAimTicks = 9;
  p.flameClock[2] = 6;
  p.loadout.slots[0].ammo = 3;
  p.loadout.slots[0].cooldownS = 0.1;
  p.loadout.slots[0].level = 3;
  p.loadout.slots[1] = { weapon: "shotgun", ammo: 2, reloadTicks: 0, cooldownS: 0, level: 2 };
  p.loadout.active = 1;
  p.reviveTicks = 4;
  p.reviverId = "p0";
  p.reviveNeedTicks = 60;
  p.buildReady = true;
  p.vote = 1;
  p.knockTicks = 2;
  p.knockDx = 50;
  p.knockDy = -50;
  p.knockStepMm = 40;
  p.flaming = true;
  void world;
}

describe("Story 8.1 hold and return: every PlayerState field (F2)", () => {
  it("covers every field (a new PlayerState field fails here until it gets a hold rule)", () => {
    const { players } = setup();
    expect(Object.keys(players[1] as PlayerState).sort()).toEqual(Object.keys(FIELD_RULES).sort());
  });

  it("a build-phase hold + return keeps every 'kept' field exactly, at the same spot", () => {
    const { world, players } = setup();
    const p = players[1] as PlayerState;
    scramble(world, p);
    const before = JSON.parse(JSON.stringify(p)) as PlayerState;
    expect(holdPlayer(world, "p1")).toBe(true);
    run(world, 30); // time passes for the others
    expect(returnPlayer(world, "p1")).toBe(true);
    for (const [k, rule] of Object.entries(FIELD_RULES)) {
      const key = k as keyof PlayerState;
      if (rule === "kept" || rule === "placed") expect([key, p[key]]).toEqual([key, before[key]]); // build phase: where they were
    }
    expect(p.reviveTicks).toBe(0);
    expect(p.reviverId).toBeNull();
    expect(p.buildReady).toBe(false);
    expect(p.vote).toBe(0);
    expect(p.knockTicks).toBe(0);
    expect(p.flaming).toBe(false);
    expect(p.protectTicks).toBe(0); // no protection in a build phase
    expect(world.players.get("p1")).toBe(p); // the very same object back
    expect(world.heldPlayers.size).toBe(0);
  });

  it("a reload in progress starts over; ammo stays as it was (no free reload)", () => {
    const { world, players } = setup();
    const p = players[1] as PlayerState;
    p.loadout.slots[0].ammo = 2;
    p.loadout.slots[0].reloadTicks = 5;
    holdPlayer(world, "p1");
    returnPlayer(world, "p1");
    expect(p.loadout.slots[0].reloadTicks).toBe(0);
    expect(p.loadout.slots[0].ammo).toBe(2);
  });
});

describe("Story 8.1 F1: dropping is never a free revive", () => {
  it("downed at the hold → out, and still out after a mid-wave return", () => {
    const { world, players } = setup();
    inWave(world);
    const p = players[1] as PlayerState;
    downPlayer(world, p);
    expect(p.status).toBe("downed");
    holdPlayer(world, "p1");
    expect(p.status).toBe("out");
    returnPlayer(world, "p1");
    expect(p.status).toBe("out");
    expect(p.protectTicks).toBe(0);
  });

  it("an out player held across a build start comes back standing like every out player", () => {
    const { world, players, events } = setup();
    inWave(world);
    const p = players[1] as PlayerState;
    downPlayer(world, p);
    holdPlayer(world, "p1");
    world.run.phase = "build"; // the build start happened while held (wave → build)
    returnPlayer(world, "p1");
    expect(p.status).toBe("alive");
    expect(p.hp).toBe(Math.min(p.maxHp, p.maxHp * balance.player.buildHealFrac));
    run(world, 1); // events go out with the next step
    expect(events.some((e) => e.type === "player.returned" && e.playerId === "p1")).toBe(true);
  });
});

describe("Story 8.1 F3: a held teammate can't be hurt, isn't a target, doesn't save the team", () => {
  it("zombies ignore a held player and chase the one present", () => {
    const { world, players } = setup();
    inWave(world);
    const [a, b] = players as [PlayerState, PlayerState];
    const z = spawnZombie(world, "walker", b.x + 1, b.y);
    holdPlayer(world, "p1");
    const hp = b.hp;
    run(world, 40);
    expect(b.hp).toBe(hp);
    // The zombie walked toward p0 (to the left), not stood on the held spot.
    expect(world.zombies.x[z] as number).toBeLessThan(b.x + 1);
    expect(a.status).toBe("alive");
  });

  it("a Bloater-sized blast on the held spot hurts nobody (and does hurt a present player: liveness)", () => {
    const { world, players } = setup();
    inWave(world);
    const [a, b] = players as [PlayerState, PlayerState];
    holdPlayer(world, "p1");
    const spec = createExplosionSpec();
    spec.x = b.x;
    spec.y = b.y;
    spec.radiusM = 3;
    spec.playerDamage = 30;
    spec.kind = "bloater";
    explode(world, spec);
    expect(b.hp).toBe(b.maxHp);
    spec.x = a.x;
    spec.y = a.y;
    explode(world, spec);
    expect(a.hp).toBeLessThan(a.maxHp);
  });

  it("a Behemoth slam over the held spot hurts nobody held (the present player is hit: liveness)", () => {
    const { world, players } = setup(["p0", "p1"]);
    const [a, b] = players as [PlayerState, PlayerState];
    b.x = a.x + 0.5; // both inside the slam radius
    b.y = a.y;
    b.prevX = b.x;
    b.prevY = b.y;
    holdPlayer(world, "p1");
    placeBoss(world, a.x + 3, a.y);
    slamOnly(world);
    world.boss.cooldown.slam = 0;
    const damaged: string[] = [];
    world.events.subscribe((e) => {
      if (e.type === "player.damaged") damaged.push(e.playerId);
    });
    run(world, 80);
    expect(damaged).toContain("p0");
    expect(damaged).not.toContain("p1");
    expect(b.hp).toBe(b.maxHp);
  });

  it("the wipe check ignores a held player: all present players down → team.wiped", () => {
    const { world, players, events } = setup();
    inWave(world);
    holdPlayer(world, "p1");
    downPlayer(world, players[0] as PlayerState);
    run(world, 1);
    expect(events.some((e) => e.type === "team.wiped")).toBe(true);
  });
});

describe("Story 8.1 F4: a mid-wave return is safe, not an escape", () => {
  it("appears next to the lowest-slot standing teammate with 2 s of protection; nothing hurts it, it can't shoot", () => {
    const { world, players } = setup(["p0", "p1"]);
    inWave(world);
    const [a, b] = players as [PlayerState, PlayerState];
    b.x = 40;
    b.y = 30;
    holdPlayer(world, "p1");
    run(world, balance.player.returnMinHoldTicks); // a real hold (B15: ≥ 3 s)
    returnPlayer(world, "p1");
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    expect(d).toBeLessThan(balance.player.spawnOffsetM * balance.player.returnSearchRings + 0.01);
    expect(b.protectTicks).toBe(balance.player.returnProtectTicks);
    expect(balance.player.returnProtectTicks).toBe(40); // decision 8.1 D3: 2 s
    const hp = b.hp;
    spawnZombie(world, "walker", b.x + 0.7, b.y);
    const ammo = b.loadout.slots[0].ammo;
    for (let t = 0; t < 39; t++) {
      setInput(world, "p1", { ...NEUTRAL_INPUT, seq: t + 1, aimX: 1, aimY: 0, fire: true });
      step(world, TICK_DT_S);
    }
    expect(b.hp).toBe(hp);
    expect(b.loadout.slots[0].ammo).toBe(ammo); // no shot while protected
    expect(b.protectTicks).toBe(1);
    run(world, 1);
    expect(b.protectTicks).toBe(0);
  });

  it("decision 8.1 B18: solo (the World froze, so no tick passed while held): returns where it vanished, UNprotected — the room's 3-2-1 replaces protection", () => {
    const { world, players } = setup(["p0"]);
    inWave(world);
    const p = players[0] as PlayerState;
    p.x = 33;
    holdPlayer(world, "p0");
    returnPlayer(world, "p0"); // no world.tick advanced: a frozen World (RunRoom.reconnect.test › solo freeze shows the 3-2-1)
    expect(p.x).toBe(33);
    expect(p.protectTicks).toBe(0);
  });
});

describe("Story 8.1 F5: my turret keeps working for me, for the hold", () => {
  it("pay to a held owner lands in the held wallet; after the hold is released it pays nobody", () => {
    const { world, players } = setup();
    const b = players[1] as PlayerState;
    const w0 = b.wallet;
    holdPlayer(world, "p1");
    earn(world, "p1", 10, "kill");
    expect(b.wallet).toBe(w0 + 10);
    expect(b.earned).toBe(10);
    const seat = releaseHeldPlayer(world, "p1");
    expect(seat?.player).toBe(b);
    earn(world, "p1", 10, "kill");
    expect(b.wallet).toBe(w0 + 10);
    expect(isHeld(world, "p1")).toBe(false);
  });
});

describe("Story 8.1 F8: a remembered seat comes back with its own stuff", () => {
  it("restoreSeat puts the very same state back (wallet, weapons) in a build phase", () => {
    const { world, players } = setup();
    const b = players[1] as PlayerState;
    b.wallet = 555;
    holdPlayer(world, "p1");
    const seat = releaseHeldPlayer(world, "p1");
    expect(world.players.has("p1")).toBe(false);
    expect(restoreSeat(world, seat?.player as PlayerState, seat?.buildIdx ?? -1)).toBe(true);
    expect(world.players.get("p1")).toBe(b);
    expect(b.wallet).toBe(555);
  });
});

describe("Story 8.1 brief 5: hold and return replay to the same digest", () => {
  it("a log with a mid-wave hold and return replays to the same snapshotWorld digest; without them it diverges", () => {
    const seed = 4242;
    const { world } = createHeadlessWorld(balance, seed, 2);
    const log = createInputLog(seed, 2);
    const cmds: ReplayCommand[] = log.commands;
    const apply = (c: ReplayCommand): void => {
      cmds.push(c);
      applyCommand(world, c);
    };
    let seq = 0;
    let held = false;
    let returned = false;
    while (world.tick < 900) {
      seq++;
      for (const playerId of ["p0", "p1"]) {
        if (playerId === "p1" && held && !returned) continue;
        apply({ tick: world.tick, kind: "input", playerId, input: { ...NEUTRAL_INPUT, seq, moveX: playerId === "p0" ? 0.3 : -0.3, aimX: 1, fire: true } });
      }
      if (world.tick === 20) apply({ tick: world.tick, kind: "ready", playerId: "p0", ready: true });
      if (world.tick === 20) apply({ tick: world.tick, kind: "ready", playerId: "p1", ready: true });
      if (world.run.phase === "wave" && !held && world.tick > 300) {
        apply({ tick: world.tick, kind: "hold", playerId: "p1" });
        held = true;
      } else if (held && !returned && world.tick > 500) {
        apply({ tick: world.tick, kind: "return", playerId: "p1" });
        returned = true;
      }
      step(world, TICK_DT_S);
    }
    log.endTick = world.tick;
    expect(held && returned).toBe(true); // liveness: the hold really happened mid-wave
    expect(world.heldPlayers.size).toBe(0);
    const replayed = replayRun(balance, log);
    expect(worldDigest(replayed)).toBe(worldDigest(world));
    const without = { ...log, commands: log.commands.filter((c) => c.kind !== "hold" && c.kind !== "return") };
    expect(worldDigest(replayRun(balance, without))).not.toBe(worldDigest(world));
  });

  it("snapshotWorld lists held players (and only when someone is held)", () => {
    const { world } = setup();
    expect("heldPlayers" in snapshotWorld(world)).toBe(false);
    holdPlayer(world, "p1");
    const snap = snapshotWorld(world) as { heldPlayers?: unknown[] };
    expect(snap.heldPlayers?.length).toBe(1);
  });

  it("startWave with a held player: the held body is not in the wave", () => {
    const { world } = setup(["p0", "p1"], null);
    startBuild(world);
    holdPlayer(world, "p1");
    startWave(world);
    expect(world.players.has("p1")).toBe(false);
  });
});

describe("Story 8.1 review H1: a build start counts as missed only if one really happened while held (sweep)", () => {
  /** Puts the run in `phase` with `waves.number` = n (no wave director: one mechanic). */
  const at = (world: World, phase: "build" | "wave" | "vote", n: number): void => {
    world.run.phase = phase;
    world.waves.number = n;
  };
  const cases: { from: ["build" | "wave" | "vote", number]; to: ["build" | "wave" | "vote", number]; missed: boolean }[] = [
    { from: ["build", 2], to: ["build", 2], missed: false }, // same build
    { from: ["build", 2], to: ["wave", 3], missed: false }, // H1: dropped in the build, back in the wave it led into
    { from: ["build", 2], to: ["build", 3], missed: true }, // the next build
    { from: ["wave", 3], to: ["wave", 3], missed: false },
    { from: ["wave", 3], to: ["build", 3], missed: true },
    { from: ["wave", 3], to: ["vote", 3], missed: false },
    { from: ["vote", 3], to: ["build", 3], missed: true },
    { from: ["vote", 3], to: ["wave", 4], missed: true },
    { from: ["wave", 3], to: ["wave", 4], missed: true },
  ];
  for (const c of cases) {
    it(`held in ${c.from[0]} (wave ${c.from[1]}), back in ${c.to[0]} (wave ${c.to[1]}): ${c.missed ? "build-start heal" : "HP kept"}`, () => {
      const { world, players } = setup();
      const p = players[1] as PlayerState;
      p.hp = 20;
      at(world, c.from[0], c.from[1]);
      holdPlayer(world, "p1");
      at(world, c.to[0], c.to[1]);
      returnPlayer(world, "p1");
      expect(p.hp).toBe(c.missed ? 20 + p.maxHp * balance.player.buildHealFrac : 20);
    });
  }
});

describe("Story 8.1 review M1 / decision 8.1 B15: the return is no escape and no invulnerability", () => {
  it("5 hold/return cycles in one wave (3 s+ each): only the first teleports and protects; the rest land in place, unprotected", () => {
    const { world, players } = setup(["p0", "p1"]);
    inWave(world);
    const b = players[1] as PlayerState;
    const results: { protectedTicks: number; movedM: number }[] = [];
    for (let k = 0; k < 5; k++) {
      b.x = 40;
      b.y = 30;
      b.prevX = b.x;
      b.prevY = b.y;
      holdPlayer(world, "p1");
      world.tick += balance.player.returnMinHoldTicks;
      returnPlayer(world, "p1");
      results.push({ protectedTicks: b.protectTicks, movedM: Math.hypot(b.x - 40, b.y - 30) });
      b.protectTicks = 0;
    }
    expect(results[0]?.protectedTicks).toBe(balance.player.returnProtectTicks);
    expect(results[0]?.movedM).toBeGreaterThan(5);
    for (const r of results.slice(1)) expect(r).toEqual({ protectedTicks: 0, movedM: 0 });
  });

  it("a hold shorter than 3 s (a reload: back in 150 ms) returns in place, unprotected; the next wave allows one protected return again", () => {
    const { world, players } = setup(["p0", "p1"]);
    inWave(world);
    const b = players[1] as PlayerState;
    b.x = 40;
    b.y = 30;
    holdPlayer(world, "p1");
    world.tick += 3; // 150 ms
    returnPlayer(world, "p1");
    expect([b.x, b.y, b.protectTicks]).toEqual([40, 30, 0]);
    holdPlayer(world, "p1");
    world.tick += balance.player.returnMinHoldTicks - 1; // 1 tick short of 3 s
    returnPlayer(world, "p1");
    expect(b.protectTicks).toBe(0);
    world.waves.number += 1; // the next wave
    holdPlayer(world, "p1");
    world.tick += balance.player.returnMinHoldTicks;
    returnPlayer(world, "p1");
    expect(b.protectTicks).toBe(balance.player.returnProtectTicks);
  });
});

describe("Story 8.1 review H3: held seats count where a run-long number is fixed", () => {
  it("a wave begun with 3 of 4 seats held is sized for 4 (no wave-size cheese by reloading at the end of a build)", () => {
    const { world } = setup(["p0", "p1", "p2", "p3"], null);
    startBuild(world);
    for (const id of ["p1", "p2", "p3"]) holdPlayer(world, id);
    startWave(world);
    expect(world.waves.size).toBe(waveSize(balance, world.waves.number, 4));
    expect(world.waves.size).toBeGreaterThan(waveSize(balance, world.waves.number, 1)); // liveness: the count matters
  });

  it("the Behemoth arriving with 3 of 4 seats held gets 4-player HP (no boss-HP cheese at the warning)", () => {
    const { world } = setup(["p0", "p1", "p2", "p3"], null);
    world.debug.bossWaves = [1];
    startBuild(world);
    startWave(world);
    for (const id of ["p1", "p2", "p3"]) holdPlayer(world, id);
    for (let t = 0; t < 400 && world.boss.maxHp === 0; t++) step(world, TICK_DT_S);
    expect(world.boss.maxHp).toBe(bossMaxHp(balance, 4, 1, 1));
    expect(bossMaxHp(balance, 4, 1, 1)).toBeGreaterThan(bossMaxHp(balance, 1, 1, 1));
  });
});

describe("Story 8.1 review M2: a held seat is a silent vote (6.11 D1: silent = Extract)", () => {
  it("4 seats, 2 Stay + 2 held → Extract (not Stay); the vote doesn't end early while a seat is held", () => {
    const { world } = setup(["p0", "p1", "p2", "p3"]);
    world.run.phase = "vote";
    castVote(world, "p0", "stay");
    castVote(world, "p1", "stay");
    holdPlayer(world, "p2");
    holdPlayer(world, "p3");
    expect(countVotes(world)).toMatchObject({ stay: 2, silent: 2 });
    resolveEvacVote(world);
    expect(world.run.ending).toBe("extracted");
  });

  it("3 Stay of 4 with 1 held → Stay, and the held seat's earnedAtEvac is set too", () => {
    const { world, players } = setup(["p0", "p1", "p2", "p3"]);
    world.run.phase = "vote";
    for (const id of ["p0", "p1", "p2"]) castVote(world, id, "stay");
    const held = players[3] as PlayerState;
    held.earned = 555;
    holdPlayer(world, "p3");
    resolveEvacVote(world);
    expect(world.run.endless).toBe(true);
    expect(held.earnedAtEvac).toBe(555);
  });
});

describe("Story 8.1 RR1-N1/N3: the held-seat rules really wired", () => {
  it("N1: all present voted but a seat is held → the vote is not shortened (still open after allVotedHoldS); without the hold it would be", () => {
    for (const held of [true, false]) {
      const { world } = setup(["p0", "p1", "p2"], null); // the run system (in the `waves` slot) counts the vote down
      startBuild(world);
      startWave(world);
      openEvacVote(world);
      if (held) holdPlayer(world, "p2");
      castVote(world, "p0", "stay");
      castVote(world, "p1", "stay");
      if (!held) castVote(world, "p2", "stay");
      run(world, ticksFor(balance.waves.evac.allVotedHoldS) + 2);
      expect([held, world.run.phase]).toEqual([held, held ? "vote" : "build"]);
    }
  });

  it("N3: playersInRun (the stampede's size, D11) counts held seats", () => {
    const { world } = setup(["p0", "p1", "p2"]);
    holdPlayer(world, "p2");
    expect(playersInRun(world)).toBe(3);
  });
});
