import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { killBoss } from "../boss/death";
import { BOSS_STATE } from "../boss/bossState";
import { downPlayer } from "../player/downed";
import { holdPlayer, returnPlayer } from "../player/hold";
import { addPlayer, removePlayer, type PlayerState } from "../player/player";
import { castVote, resolveEvacVote, skipWave, startBuild, startWave } from "../run/runStateMachine";
import { countBossKilled, countWaveEnded } from "./runRecord";

/**
 * Story 7.2 (AC 1, S2): the per-player run record. Every count is driven through the real run flow (startBuild →
 * startWave → skipWave → a step, so the economy system reads the pending `wave.ended`), never set by hand.
 */
const balance = loadBalance();
const RUN_WAVES = balance.waves.runWaves;

function setup(ids: readonly string[] = ["p0", "p1", "p2"]) {
  const world = createWorld({ balance, seed: 5, systems: { zombies: () => {} } });
  world.debug.bossWaves = []; // the boss only where a test kills it
  const players = ids.map((id, i) => addPlayer(world, id, 20 + i * 3, 16));
  startBuild(world);
  return { world, players };
}
const tick = (world: World) => step(world, TICK_DT_S);
/** Plays (skips) the next wave to its end, then one step so the economy system counts it. */
function clearWave(world: World): void {
  if (world.run.phase === "build") startWave(world);
  skipWave(world);
  tick(world);
}
const record = (p: PlayerState) => [p.wavesIn, p.endlessWavesIn, p.bossesIn, p.endlessBossesIn];

describe("Story 7.2: the run record (S2: I get the waves I was in, downed or out too)", () => {
  it("S2: every ended wave counts once for each player in the run, alive, downed and out", () => {
    const { world, players } = setup();
    for (let w = 1; w <= 2; w++) clearWave(world);
    startWave(world);
    downPlayer(world, players[1]!); // downed at wave 3's end
    players[2]!.status = "out"; // out at wave 3's end
    skipWave(world);
    tick(world);
    expect(world.waves.number).toBe(3);
    expect(players.map((p) => p.wavesIn)).toEqual([3, 3, 3]);
  });

  it("S2: a player downed on wave 3's last tick still has wavesIn 3 (mutation: counting only alive players fails here)", () => {
    const { world, players } = setup(["p0", "p1"]);
    clearWave(world);
    clearWave(world);
    startWave(world);
    downPlayer(world, players[0]!);
    skipWave(world); // the same tick: the wave ends with p0 downed (the build start then stands them up)
    expect(players[0]!.wavesIn).toBe(2); // counted by the economy system at the next step, from the pending wave.ended
    tick(world);
    expect(players[0]!.wavesIn).toBe(3);
  });

  it("D8: a team wipe during wave 5 counts wave 5; a wipe in the build phase after wave 4 adds nothing", () => {
    const a = setup(["p0", "p1"]);
    for (let w = 1; w <= 4; w++) clearWave(a.world);
    startWave(a.world);
    for (const p of a.players) downPlayer(a.world, p);
    expect(a.world.teamWiped).toBe(true);
    tick(a.world);
    expect(a.world.run.phase).toBe("results");
    expect(a.players.map((p) => p.wavesIn)).toEqual([5, 5]);

    const b = setup(["p0", "p1"]);
    for (let w = 1; w <= 4; w++) clearWave(b.world);
    expect(b.world.run.phase).toBe("build");
    for (const p of b.players) downPlayer(b.world, p); // e.g. a fire in the build phase
    tick(b.world);
    expect(b.world.run.phase).toBe("results");
    expect(b.players.map((p) => p.wavesIn)).toEqual([4, 4]);
  });

  it("S3: a player who leaves after wave 4 keeps 4 waves in their state; the team's counters are not touched", () => {
    const { world, players } = setup();
    for (let w = 1; w <= 4; w++) clearWave(world);
    const leaver = players[2]!;
    expect(leaver.wavesIn).toBe(4);
    removePlayer(world, leaver.id);
    clearWave(world);
    expect(leaver.wavesIn).toBe(4); // gone: nothing more counts
    expect(players.slice(0, 2).map((p) => p.wavesIn)).toEqual([5, 5]);
  });

  it("S2 (8.1): a held player across a wave end is counted; after returning the count goes on", () => {
    const { world, players } = setup(["p0", "p1"]);
    clearWave(world);
    startWave(world);
    expect(holdPlayer(world, "p1")).toBe(true);
    skipWave(world);
    tick(world);
    expect(world.heldPlayers.get("p1")?.player.wavesIn).toBe(2);
    expect(returnPlayer(world, "p1")).toBe(true);
    clearWave(world);
    expect(players.map((p) => p.wavesIn)).toEqual([3, 3]);
  });

  it("a late joiner starts at 0 and counts only the waves after joining", () => {
    const { world } = setup(["p0"]);
    clearWave(world);
    clearWave(world);
    const late = addPlayer(world, "p1", 30, 16);
    expect(record(late)).toEqual([0, 0, 0, 0]);
    clearWave(world);
    expect(late.wavesIn).toBe(1);
    expect(world.players.get("p0")!.wavesIn).toBe(3);
  });

  it("S1/S4: the wave-10 Behemoth counts in bossesIn only; endless waves and an endless Behemoth count apart", () => {
    const { world, players } = setup(["p0", "p1"]);
    for (let w = 1; w < RUN_WAVES; w++) clearWave(world);
    startWave(world);
    world.boss.state = BOSS_STATE.WALK;
    killBoss(world, "p0", "pistol");
    holdPlayer(world, "p1"); // held when the wave ends: still counted
    skipWave(world);
    tick(world);
    expect(world.run.phase).toBe("vote");
    returnPlayer(world, "p1");
    expect(players.map(record)).toEqual([
      [RUN_WAVES, 0, 1, 0],
      [RUN_WAVES, 0, 1, 0],
    ]);
    for (const p of players) castVote(world, p.id, "stay");
    resolveEvacVote(world);
    expect(world.run.endless).toBe(true);
    for (let w = RUN_WAVES + 1; w < RUN_WAVES + 5; w++) clearWave(world);
    startWave(world); // wave 15
    world.boss.state = BOSS_STATE.WALK;
    killBoss(world, "p1", "pistol");
    skipWave(world);
    tick(world);
    expect(world.waves.number).toBe(RUN_WAVES + 5);
    expect(players.map(record)).toEqual([
      [RUN_WAVES, 5, 2, 1],
      [RUN_WAVES, 5, 2, 1],
    ]);
  });

  it("S2 (mutation guard): the counters read no status — downed, out and held players all count at the moment of counting", () => {
    const { world, players } = setup(["p0", "p1", "p2", "p3"]);
    startWave(world);
    downPlayer(world, players[0]!);
    players[1]!.status = "out";
    holdPlayer(world, "p3");
    countWaveEnded(world, 1);
    countBossKilled(world);
    expect([players[0]!.status, players[1]!.status]).toEqual(["downed", "out"]);
    expect(players.map(record)).toEqual([
      [1, 0, 1, 0],
      [1, 0, 1, 0],
      [1, 0, 1, 0],
      [1, 0, 1, 0],
    ]);
  });

  it("brief 2: the counters are in snapshotWorld (players and held players), so a replay digest covers them", () => {
    const { world } = setup(["p0", "p1"]);
    clearWave(world);
    holdPlayer(world, "p1");
    const snap = snapshotWorld(world) as unknown as { players: [string, PlayerState][]; heldPlayers: [string, { player: PlayerState }][] };
    expect(snap.players[0]![1].wavesIn).toBe(1);
    expect(snap.heldPlayers[0]![1].player.wavesIn).toBe(1);
    expect(Object.keys(snap.players[0]![1])).toEqual(expect.arrayContaining(["wavesIn", "endlessWavesIn", "bossesIn", "endlessBossesIn"]));
  });
});
