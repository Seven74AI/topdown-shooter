import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { startBuild, startWave } from "../run/runStateMachine";
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

  it("solo (nobody standing): returns where it vanished, still protected", () => {
    const { world, players } = setup(["p0"]);
    inWave(world);
    const p = players[0] as PlayerState;
    p.x = 33;
    holdPlayer(world, "p0");
    returnPlayer(world, "p0");
    expect(p.x).toBe(33);
    expect(p.protectTicks).toBe(40);
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
    expect(seat).toBe(b);
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
    const seat = releaseHeldPlayer(world, "p1") as PlayerState;
    expect(world.players.has("p1")).toBe(false);
    expect(restoreSeat(world, seat, 0, "build")).toBe(true);
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
