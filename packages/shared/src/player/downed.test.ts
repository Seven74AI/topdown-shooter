import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { skipWave, startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { downPlayer, returnOutPlayers } from "./downed";
import { spotBlocked } from "./freeSpot";
import { addPlayer, removePlayer, type PlayerState } from "./player";
import { spectateTarget } from "./spectate";

const balance = loadBalance();
/** One mechanic at a time (Epic 1 lesson): no wave director unless the test is about the return. */
const NO_WAVES = { waves: () => {} };
const DOWNED_TICKS = ticksFor(balance.player.downedS);
const REVIVE_TICKS = ticksFor(balance.player.reviveS);

/** `systems: null` runs every real system (the wave director too). */
function setup(ids: readonly string[] = ["p0", "p1"], systems: object | null = NO_WAVES) {
  const world = createWorld({ balance, seed: 7, ...(systems ? { systems } : {}) });
  const players = ids.map((id, i) => addPlayer(world, id, 10 + i * 10, 16));
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const ofType = (events: readonly SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type);
/** Puts `p` at `distM` to the right of `of` (centre to centre). */
const placeNear = (p: PlayerState, of: PlayerState, distM: number) => {
  p.x = of.x + distM;
  p.y = of.y;
  p.prevX = p.x;
  p.prevY = p.y;
};

describe("balance (Story 2.8)", () => {
  it("has the downed numbers, converted to ticks: 400 down, 60 revive", () => {
    expect(balance.player).toMatchObject({ downedS: 20, reviveS: 3, reviveRadiusM: 1.2, reviveHpFrac: 0.3, buildHealFrac: 0.5 });
    expect(DOWNED_TICKS).toBe(400);
    expect(REVIVE_TICKS).toBe(60);
  });
});

describe("going down", () => {
  it("0 HP from a zombie gives downed, 0 HP, a 400-tick countdown and player.downed once", () => {
    const { world, players, events } = setup();
    const [a] = players as [PlayerState];
    a.hp = 5;
    spawnZombie(world, "walker", a.x + 0.74, a.y);
    run(world, 30);
    expect(a.status).toBe("downed");
    expect(a.hp).toBe(0);
    expect(ofType(events, "player.downed")).toEqual([{ type: "player.downed", playerId: "p0" }]);
    expect(a.downedTicksLeft).toBeGreaterThan(DOWNED_TICKS - 30);
    expect(a.reviveTicks).toBe(0);
    expect(a.reviverId).toBeNull();
  });

  it("a downed player is never attacked: the zombie walks to the standing one", () => {
    const { world, players, events } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    const id = spawnZombie(world, "walker", a.x + 0.74, a.y);
    run(world, 40);
    expect(ofType(events, "player.damaged")).toEqual([]);
    expect(world.zombies.x[id]).toBeGreaterThan(a.x + 0.74 + 2); // toward b at x 20
    expect(b.status).toBe("alive");
  });

  it("a downed player's input doesn't move them, fire or swap", () => {
    const { world, players, events } = setup();
    const [a] = players as [PlayerState];
    downPlayer(world, a);
    const x = a.x;
    for (let seq = 1; seq <= 20; seq++) {
      const input: PlayerInput = { ...NEUTRAL_INPUT, seq, moveX: 1, aimX: 1, fire: true, swap: seq === 1 };
      setInput(world, "p0", input);
      step(world, TICK_DT_S);
    }
    expect(a.x).toBe(x);
    expect(ofType(events, "weapon.fired")).toEqual([]);
    expect(ofType(events, "weapon.swap_started")).toEqual([]);
  });
});

describe("downed countdown", () => {
  it("with no reviver the player is out exactly 400 ticks after going down (not at 399)", () => {
    const { world, players, events } = setup();
    const [a] = players as [PlayerState];
    world.waves.number = 2;
    downPlayer(world, a); // the zombie hit lands inside a tick; the countdown runs from the next one
    run(world, DOWNED_TICKS - 1);
    expect(a.status).toBe("downed");
    expect(a.downedTicksLeft).toBe(1);
    expect(ofType(events, "player.out")).toEqual([]);
    run(world, 1);
    expect(a.status).toBe("out");
    expect(ofType(events, "player.out")).toEqual([{ type: "player.out", playerId: "p0" }]);
  });
});

describe("revive", () => {
  it("a teammate at 1.1 m for 60 ticks revives with 30 HP and player.revived", () => {
    const { world, players, events } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    placeNear(b, a, 1.1);
    run(world, REVIVE_TICKS - 1);
    expect(a.status).toBe("downed");
    expect(a.reviveTicks).toBe(REVIVE_TICKS - 1);
    expect(a.reviverId).toBe("p1");
    run(world, 1);
    expect(a.status).toBe("alive");
    expect(a.hp).toBe(30);
    expect(a.reviveTicks).toBe(0);
    expect(a.reviverId).toBeNull();
    expect(ofType(events, "player.revived")).toEqual([{ type: "player.revived", playerId: "p0", reviverId: "p1" }]);
  });

  it("the reviver going down mid-revive resets the progress (review gap)", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b] = players as [PlayerState, PlayerState, PlayerState];
    downPlayer(world, a);
    placeNear(b, a, 1.1);
    run(world, 30);
    expect(a.reviveTicks).toBe(30);
    downPlayer(world, b);
    run(world, 1);
    expect(a.reviveTicks).toBe(0);
    expect(a.reviverId).toBeNull();
    expect(a.status).toBe("downed");
  });

  it("the reviver leaving the run mid-revive resets the progress (review gap)", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b] = players as [PlayerState, PlayerState, PlayerState];
    downPlayer(world, a);
    placeNear(b, a, 1.1);
    run(world, 30);
    removePlayer(world, "p1");
    run(world, 1);
    expect(a.reviveTicks).toBe(0);
    expect(a.reviverId).toBeNull();
  });

  it("stepping to 1.3 m at tick 59 resets the progress; coming back restarts it from 0", () => {
    const { world, players, events } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    placeNear(b, a, 1.1);
    run(world, REVIVE_TICKS - 1);
    placeNear(b, a, 1.3);
    run(world, 1);
    expect(a.reviveTicks).toBe(0);
    expect(a.reviverId).toBeNull();
    placeNear(b, a, 1.1);
    run(world, REVIVE_TICKS - 1);
    expect(a.status).toBe("downed");
    run(world, 1);
    expect(a.status).toBe("alive");
    expect(ofType(events, "player.revived")).toHaveLength(1);
  });

  it("the countdown doesn't move during the revive, and runs again when the reviver leaves", () => {
    const { world, players } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    run(world, 100); // nobody near: 300 left
    expect(a.downedTicksLeft).toBe(DOWNED_TICKS - 100);
    placeNear(b, a, 1.0);
    run(world, 50);
    expect(a.downedTicksLeft).toBe(DOWNED_TICKS - 100);
    placeNear(b, a, 5);
    run(world, 10);
    expect(a.downedTicksLeft).toBe(DOWNED_TICKS - 110);
  });

  it("a revive in progress can't let the countdown run out: a player 1 tick from out is still revived", () => {
    const { world, players } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    run(world, DOWNED_TICKS - 1);
    placeNear(b, a, 1.0);
    run(world, REVIVE_TICKS);
    expect(a.status).toBe("alive");
  });

  it("two revivers count as one (still 60 ticks), and the nearest is the reviver", () => {
    const { world, players, events } = setup(["p0", "p1", "p2"]);
    const [a, b, c] = players as [PlayerState, PlayerState, PlayerState];
    downPlayer(world, a);
    placeNear(b, a, 1.0);
    placeNear(c, a, -0.8);
    run(world, REVIVE_TICKS - 1);
    expect(a.status).toBe("downed");
    expect(a.reviverId).toBe("p2");
    run(world, 1);
    expect(ofType(events, "player.revived")).toEqual([{ type: "player.revived", playerId: "p0", reviverId: "p2" }]);
  });

  it("a downed teammate can't revive", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    downPlayer(world, b);
    placeNear(b, a, 0.5);
    run(world, REVIVE_TICKS + 5);
    expect(a.status).toBe("downed");
    expect(a.reviveTicks).toBe(0);
  });
});

describe("out and return", () => {
  /** Wave state written by hand: the director is off, so only the return rule acts. */
  function goOut(world: World, p: PlayerState) {
    downPlayer(world, p);
    run(world, DOWNED_TICKS);
    expect(p.status).toBe("out");
  }

  it("Story 3.1: out during a wave they stay out for the rest of it (no return at a later wave)", () => {
    const { world, players } = setup(["p0", "p1"]);
    const [a] = players as [PlayerState];
    world.waves.number = 2;
    goOut(world, a);
    world.waves.number = 3; // even a later wave number: only a build start returns them
    run(world, 50);
    expect(a.status).toBe("out");
  });

  it("at the build start an out player returns next to the lowest-slot standing teammate, with 50 HP", () => {
    const { world, players, events } = setup(["p0", "p1", "p2"]);
    const [a, b, c] = players as [PlayerState, PlayerState, PlayerState];
    b.x = 30;
    b.y = 20;
    goOut(world, a);
    returnOutPlayers(world);
    expect(a.status).toBe("alive");
    expect(a.hp).toBe(50);
    expect(a.x).toBeCloseTo(b.x + balance.player.spawnOffsetM, 9);
    expect(a.y).toBe(b.y);
    expect(a.prevX).toBe(a.x);
    expect(a.prevY).toBe(a.y);
    expect(a.downedTicksLeft).toBe(0);
    world.events.flush(); // emitted outside a step
    expect(ofType(events, "player.returned")).toEqual([{ type: "player.returned", playerId: "p0", x: a.x, y: a.y }]);
    expect(c.status).toBe("alive");
  });

  it("a downed player returns too (countdown and revive progress reset), and standing players are healed by 50, capped", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b, c] = players as [PlayerState, PlayerState, PlayerState];
    downPlayer(world, a);
    run(world, 10);
    b.hp = 30;
    c.hp = 80;
    returnOutPlayers(world);
    expect(a).toMatchObject({ status: "alive", hp: 50, downedTicksLeft: 0, reviveTicks: 0, reviverId: null });
    expect(b.hp).toBe(80);
    expect(c.hp).toBe(100);
  });

  it("near the map corner the return spot is a free one inside the map (retro A12)", () => {
    const { world, players } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    b.x = world.map.widthM - 0.5;
    b.y = world.map.heightM - 0.1;
    goOut(world, a);
    returnOutPlayers(world);
    // +x is off the map, −x and +y overlap the bottom edge: the fourth candidate, −y.
    expect(a.x).toBe(b.x);
    expect(a.y).toBeCloseTo(b.y - balance.player.spawnOffsetM, 9);
    expect(spotBlocked(world, a.x, a.y, a.radiusM, a)).toBe(false);
  });

  it("skips a spot a zombie stands on, and a spot a teammate stands on (retro A12)", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b, c] = players as [PlayerState, PlayerState, PlayerState];
    b.x = 20;
    b.y = 16;
    c.x = b.x + balance.player.spawnOffsetM; // on the +x spot
    c.y = b.y;
    goOut(world, a); // zombies come after: they'd chase during the countdown
    spawnZombie(world, "walker", b.x - balance.player.spawnOffsetM, b.y); // on the −x spot
    returnOutPlayers(world);
    expect(a.x).toBeCloseTo(b.x, 9); // the third candidate: +y
    expect(a.y).toBeCloseTo(b.y + balance.player.spawnOffsetM, 9);
  });

  it("goes to the next ring when the whole first ring is taken, and falls back to the 2.8 spot when every ring is", () => {
    const { world, players } = setup(["p0", "p1"]);
    const [a, b] = players as [PlayerState, PlayerState];
    b.x = 24;
    b.y = 16;
    const off = balance.player.spawnOffsetM;
    const ring = (k: number) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]] as const) {
        spawnZombie(world, "walker", b.x + dx * off * k, b.y + dy * off * k);
      }
    };
    goOut(world, a);
    ring(1);
    returnOutPlayers(world);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(off * 2, 9);
    expect(spotBlocked(world, a.x, a.y, a.radiusM, a)).toBe(false);
    const w2 = setup(["p0", "p1"]);
    const [a2, b2] = w2.players as [PlayerState, PlayerState];
    b2.x = 24;
    b2.y = 16;
    goOut(w2.world, a2);
    for (let k = 1; k <= balance.player.returnSearchRings; k++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]] as const) {
        spawnZombie(w2.world, "walker", b2.x + dx * off * k, b2.y + dy * off * k);
      }
    }
    returnOutPlayers(w2.world);
    expect(a2.x).toBeCloseTo(b2.x + off, 9); // fallback: the 2.8 rule
    expect(a2.y).toBe(b2.y);
  });

  it("with the real run state machine: out in wave 1, back when the build after it starts", () => {
    const { world, players, events } = setup(["p0", "p1"], null);
    const [a] = players as [PlayerState];
    world.debug.godMode = true; // the standing player never goes down; downPlayer bypasses it
    startBuild(world);
    startWave(world);
    run(world, 5);
    goOut(world, a);
    expect(world.run.phase).toBe("wave");
    skipWave(world); // wave 1 ends → the build phase starts at once
    expect(world.run.phase).toBe("build");
    expect(a.status).toBe("alive");
    expect(a.hp).toBe(50);
    world.events.flush(); // emitted outside a step
    expect(ofType(events, "build.started").at(-1)).toMatchObject({ wave: 2 });
  });

  it("an out player is hidden from zombies, and spectates the lowest-slot standing teammate", () => {
    const { world, players } = setup(["p0", "p1", "p2"]);
    const [a, b, c] = players as [PlayerState, PlayerState, PlayerState];
    goOut(world, c);
    expect(spectateTarget(world, "p2")).toBe(a);
    downPlayer(world, a);
    expect(spectateTarget(world, "p2")).toBe(b);
    expect(spectateTarget(world, "p1")).toBeNull();
  });
});

describe("team wipe", () => {
  it("all downed gives team.wiped once, with the wave", () => {
    const { world, players, events } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    world.waves.number = 4;
    downPlayer(world, a);
    expect(ofType(events, "team.wiped")).toEqual([]);
    expect(world.teamWiped).toBe(false);
    downPlayer(world, b);
    run(world, 1);
    expect(world.teamWiped).toBe(true);
    expect(ofType(events, "team.wiped")).toEqual([{ type: "team.wiped", wave: 4 }]);
  });

  it("downed plus out gives a wipe", () => {
    const { world, players, events } = setup();
    const [a, b] = players as [PlayerState, PlayerState];
    downPlayer(world, a);
    run(world, DOWNED_TICKS);
    expect(a.status).toBe("out");
    expect(world.teamWiped).toBe(false);
    downPlayer(world, b);
    run(world, 1);
    expect(ofType(events, "team.wiped")).toHaveLength(1);
  });

  it("one standing gives no wipe", () => {
    const { world, players, events } = setup(["p0", "p1", "p2"]);
    downPlayer(world, players[0] as PlayerState);
    downPlayer(world, players[1] as PlayerState);
    run(world, DOWNED_TICKS + 10);
    expect(world.teamWiped).toBe(false);
    expect(ofType(events, "team.wiped")).toEqual([]);
  });

  it("after a wipe, more ticks emit nothing new and the countdowns stop", () => {
    const { world, players, events } = setup();
    downPlayer(world, players[0] as PlayerState);
    downPlayer(world, players[1] as PlayerState);
    run(world, 1);
    const n = events.length;
    const before = snapshotWorld(world).players;
    run(world, DOWNED_TICKS + 100);
    expect(events.length).toBe(n);
    expect(snapshotWorld(world).players.map(([, p]) => p.downedTicksLeft)).toEqual(before.map(([, p]) => p.downedTicksLeft));
  });

  it("solo: going down wipes on the same tick", () => {
    const { world, players, events } = setup(["local"]);
    const [p] = players as [PlayerState];
    p.hp = 5;
    spawnZombie(world, "walker", p.x + 0.74, p.y);
    let wipedAt = -1;
    let downedAt = -1;
    world.events.subscribe((e) => {
      if (e.type === "team.wiped") wipedAt = world.tick;
      if (e.type === "player.downed") downedAt = world.tick;
    });
    run(world, 30);
    expect(downedAt).toBeGreaterThan(0);
    expect(wipedAt).toBe(downedAt);
    expect(ofType(events, "team.wiped")).toHaveLength(1);
  });

  it("the last standing player leaving with the rest downed is a wipe on the next tick", () => {
    const { world, players, events } = setup();
    downPlayer(world, players[0] as PlayerState);
    removePlayer(world, "p1");
    run(world, 1);
    expect(ofType(events, "team.wiped")).toHaveLength(1);
  });

  it("an empty world never wipes", () => {
    const { world, events } = setup([]);
    run(world, 5);
    expect(ofType(events, "team.wiped")).toEqual([]);
  });

  it("is deterministic: the same seed and inputs give the same snapshot", () => {
    const go = () => {
      const { world, players } = setup(["p0", "p1", "p2"], null);
      downPlayer(world, players[0] as PlayerState);
      placeNear(players[1] as PlayerState, players[0] as PlayerState, 1.0);
      run(world, 300);
      return snapshotWorld(world);
    };
    expect(go()).toEqual(go());
  });

  it("an out player's old position doesn't block a free spot; a standing one does (3.1 review)", () => {
    const { world, players } = setup(["p0", "p1"]);
    const [a, b] = players as [PlayerState, PlayerState];
    b.x = a.x + 3;
    b.y = a.y;
    b.status = "out";
    expect(spotBlocked(world, b.x, b.y, a.radiusM, a)).toBe(false);
    b.status = "alive";
    expect(spotBlocked(world, b.x, b.y, a.radiusM, a)).toBe(true);
  });
});
