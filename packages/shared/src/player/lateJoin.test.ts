import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { ticksFor } from "../core/time";
import { NEUTRAL_INPUT } from "../net/input";
import { addBuildTime, setBuildReady, startBuild, startWave } from "../run/runStateMachine";
import { waveSize } from "../waves/waveDirector";
import { addBuildingAt, disownBuildings, ownedCount } from "../buildings/buildings";
import { earn } from "../economy/economy";
import { offerFor } from "../economy/shopCards";
import { createHeadlessWorld, replayRun, applyCommand, createInputLog, type ReplayCommand } from "../replay/inputLog";
import { addPlayer } from "./player";
import { teamSpawnPoint } from "./spawn";
import { addLatePlayer } from "./lateJoin";
import { holdPlayer } from "./hold";

/** Stories 8.2 + 8.3, shared parts: the late joiner's entry (AC 1), +15 s once (AC 3, J5), disowned buildings (H3), replay. */
const balance = loadBalance();
const NO_WAVES = { waves: () => {} };
const EXTRA = ticksFor(balance.economy.lateJoin.extraBuildS);

function buildWorld(systems: object | null = NO_WAVES): World {
  const world = createWorld({ balance, seed: 9, ...(systems ? { systems } : {}) });
  const at = { x: 0, y: 0 };
  teamSpawnPoint(world, 0, at);
  addPlayer(world, "p0", at.x, at.y);
  startBuild(world);
  return world;
}

describe("addLatePlayer (Story 8.2 AC 1, J1, J7)", () => {
  it("enters at the slot's team spawn point with the given wallet, a Pistol and the counters at 0", () => {
    const world = buildWorld();
    world.players.get("p0")!.wavesIn = 4;
    const p = addLatePlayer(world, "p2", 2, 640);
    const at = teamSpawnPoint(world, 2, { x: 0, y: 0 });
    expect(p).not.toBeNull();
    expect({ x: p?.x, y: p?.y }).toEqual(at);
    expect(p?.wallet).toBe(640);
    expect(p?.earned).toBe(0);
    expect(p?.loadout.slots[0]?.weapon).toBe("pistol");
    expect([p?.wavesIn, p?.bossesIn, p?.endlessWavesIn, p?.endlessBossesIn]).toEqual([0, 0, 0, 0]); // J7
    expect(p?.buildReady).toBe(false);
  });

  it("a blocked spawn point → the first free spot round it", () => {
    const world = buildWorld();
    const at = teamSpawnPoint(world, 1, { x: 0, y: 0 });
    addPlayer(world, "p3", at.x, at.y); // a body on the spot
    const p = addLatePlayer(world, "p1", 1, 200);
    expect(Math.hypot((p?.x ?? 0) - at.x, (p?.y ?? 0) - at.y)).toBeGreaterThan(0.5);
  });

  it("only in a build phase, never for an id already in the run (present or held)", () => {
    const world = buildWorld();
    startWave(world);
    expect(addLatePlayer(world, "p1", 1, 200)).toBeNull();
    const w2 = buildWorld();
    expect(addLatePlayer(w2, "p0", 0, 200)).toBeNull();
    addPlayer(w2, "p1", 1, 1);
    holdPlayer(w2, "p1");
    expect(addLatePlayer(w2, "p1", 1, 999)).toBeNull();
    expect(w2.heldPlayers.get("p1")?.player.wallet).not.toBe(999);
  });

  it("its card offer is drawn on demand from its own stream (shop:<slot>:<n>), the same as a lobby start's", () => {
    const a = buildWorld();
    addLatePlayer(a, "p1", 1, 200);
    const late = offerFor(a, "p1");
    const b = createHeadlessWorld(balance, 9, 2).world; // a lobby start with 2 players, same seed
    const lobby = offerFor(b, "p1");
    expect(late?.cards).toEqual(lobby?.cards);
    expect(late?.cards.length).toBeGreaterThan(0);
  });

  it("J6: the next wave is sized for who is here (a lobby start with that many players)", () => {
    const world = buildWorld(null);
    addLatePlayer(world, "p1", 1, 200);
    startWave(world);
    expect(world.waves.size).toBe(waveSize(balance, 1, 2));
    expect(waveSize(balance, 1, 2)).not.toBe(waveSize(balance, 1, 1));
  });
});

describe("addBuildTime (Story 8.2 AC 3, J5, decision E8-J4)", () => {
  it("the first late join of a build adds +15 s; a second adds nothing; the next build can be extended again", () => {
    const world = buildWorld(null);
    const t0 = world.run.buildTicksLeft;
    addLatePlayer(world, "p1", 1, 200);
    expect(world.run.buildTicksLeft).toBe(t0 + EXTRA);
    expect(EXTRA).toBe(300);
    addLatePlayer(world, "p2", 2, 200);
    expect(world.run.buildTicksLeft).toBe(t0 + EXTRA);
    expect(addBuildTime(world, EXTRA)).toBe(false);
    startWave(world);
    expect(addBuildTime(world, EXTRA)).toBe(false); // never in a wave
    world.zombies.aliveCount = 0;
    world.run.phase = "wave";
    startBuild(world);
    expect(world.run.joinExtendedBuild).toBe(false);
    expect(addBuildTime(world, EXTRA)).toBe(true);
  });

  it("the joiner is not Ready, so the others' Ready no longer starts the wave early by itself", () => {
    const world = buildWorld(null);
    setBuildReady(world, "p0", true);
    addLatePlayer(world, "p1", 1, 200);
    step(world, TICK_DT_S);
    expect(world.run.phase).toBe("build");
    setBuildReady(world, "p1", true);
    step(world, TICK_DT_S);
    expect(world.run.phase).toBe("wave");
  });

  it("snapshotWorld shows the flag only once set (older digests unchanged)", () => {
    const world = buildWorld();
    expect("joinExtendedBuild" in (snapshotWorld(world) as { run: object }).run).toBe(false);
    addBuildTime(world, EXTRA);
    expect((snapshotWorld(world) as { run: { joinExtendedBuild?: boolean } }).run.joinExtendedBuild).toBe(true);
  });
});

describe("disownBuildings (Story 8.3 H3, decision E8-H3)", () => {
  it("clears the owner: the cap counts nothing, kills pay nobody, the buildings stay", () => {
    const world = buildWorld();
    addPlayer(world, "p1", 30, 30);
    addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p1", gx: 10, gy: 10, rot: 0, hp: 200 });
    addBuildingAt(world, { id: 2, type: "wood_barricade", ownerId: "p0", gx: 20, gy: 10, rot: 0, hp: 200 });
    const v = world.buildings.version;
    expect(disownBuildings(world, "p1")).toBe(1);
    expect(world.buildings.version).toBe(v + 1);
    expect(world.buildings.list.map((b) => b.ownerId)).toEqual(["", "p0"]);
    expect(ownedCount(world, "p1")).toBe(0);
    const before = [...world.players.values()].map((p) => p.wallet);
    earn(world, "", 50, "kill"); // a disowned building's kill pays its owner "": nobody
    expect([...world.players.values()].map((p) => p.wallet)).toEqual(before);
    expect(disownBuildings(world, "")).toBe(0);
  });
});

describe("Stories 8.2/8.3 brief 5: a mid-run join and a remove replay to the same digest", () => {
  it("a log with a build-phase join, its inputs and a later remove replays to the same digest; without the join it diverges", () => {
    const seed = 777;
    const { world } = createHeadlessWorld(balance, seed, 1);
    const log = createInputLog(seed, 1);
    const cmds: ReplayCommand[] = log.commands;
    const apply = (c: ReplayCommand): void => {
      cmds.push(c);
      applyCommand(world, c);
    };
    let seq = 0;
    let joined = false;
    let removed = false;
    let p1Wave = false;
    while (world.tick < 1400) {
      seq++;
      apply({ tick: world.tick, kind: "input", playerId: "p0", input: { ...NEUTRAL_INPUT, seq, moveX: 0.2, aimX: 1, fire: true } });
      if (joined && !removed) apply({ tick: world.tick, kind: "input", playerId: "p1", input: { ...NEUTRAL_INPUT, seq, moveX: -0.2, aimX: -1, fire: true } });
      if (world.tick === 40 && !joined) {
        apply({ tick: world.tick, kind: "join", playerId: "p1", slot: 1, wallet: 640 });
        joined = true;
      }
      if (joined && world.run.phase === "wave") p1Wave = true;
      if (p1Wave && !removed && world.run.phase === "build") {
        apply({ tick: world.tick, kind: "remove", playerId: "p1" });
        removed = true;
      }
      if (world.tick === 60) apply({ tick: world.tick, kind: "ready", playerId: "p0", ready: true });
      if (world.tick === 60 && joined) apply({ tick: world.tick, kind: "ready", playerId: "p1", ready: true });
      step(world, TICK_DT_S);
    }
    log.endTick = world.tick;
    expect(joined && p1Wave).toBe(true); // liveness: the joiner played a wave
    expect(world.waves.number).toBeGreaterThanOrEqual(1);
    const replayed = replayRun(balance, log);
    expect(worldDigest(replayed)).toBe(worldDigest(world));
    const without = { ...log, commands: log.commands.filter((c) => c.kind !== "join" && c.playerId !== "p1") };
    expect(worldDigest(replayRun(balance, without))).not.toBe(worldDigest(world));
  });
});
