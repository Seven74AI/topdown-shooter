import { DOWNTOWN_MAP, TICK_DT_S, addPlayer, castVote, createWorld, loadBalance, skipWave, startBuild, startWave, step, teamSpawnPoint, type PlayerState, type World } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import { RunBank } from "../meta/banking";
import { seatRow } from "../meta/runResult";

/**
 * Story 10.7 AC 7 (X8, designer Q4 = B): fly-out kills are not counted. A run driven into `extract` (12.2) and to its
 * end: every number the run stats record per player (waves in, bought weapons, own kills) equals the value at the tick
 * `extract` began — through the room's own path (`RunBank.bankRunEnd` → `resultSeats`), with the fly-out horde really there.
 */
const balance = loadBalance();

function toExtract(n: number): { world: World; players: PlayerState[] } {
  const world = createWorld({ balance, seed: 21, map: DOWNTOWN_MAP });
  world.debug.bossWaves = [];
  const at = { x: 0, y: 0 };
  const players: PlayerState[] = [];
  for (let i = 0; i < n; i++) {
    teamSpawnPoint(world, i, at);
    players.push(addPlayer(world, `p${i}`, at.x, at.y));
  }
  startBuild(world);
  while (world.run.phase === "build" || world.run.phase === "wave") {
    if (world.run.phase === "build") startWave(world);
    skipWave(world);
  }
  expect(world.run.phase).toBe("vote");
  for (const id of world.players.keys()) castVote(world, id, "extract");
  for (let t = 0; t < 2000 && world.run.phase === "vote"; t++) step(world, TICK_DT_S);
  expect(world.run.phase).toBe("extract");
  return { world, players };
}

describe("Story 10.7 AC 7 (X8): nothing recorded moves during extract", () => {
  it("waves in, loadout and kills at the end = at extract start; the fly-out horde spawned; the stats rows come from the bank", () => {
    const { world, players } = toExtract(3);
    players[0]!.kills = 17;
    players[1]!.weaponsBought.push("smg");
    const atStart = players.map((p, i) => seatRow(p, `p${i}#0`, i, null));
    expect(atStart[0]).toMatchObject({ wavesIn: 10, kills: 17 }); // something was really recorded
    let maxZombies = 0;
    for (let t = 0; t < 4000 && world.run.phase === "extract"; t++) {
      step(world, TICK_DT_S);
      maxZombies = Math.max(maxZombies, world.zombies.aliveCount);
    }
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
    expect(world.extract.hordeSpawned).toBeGreaterThan(0); // the fly-out horde was there
    expect(maxZombies).toBeGreaterThan(0);
    expect(players.map((p, i) => seatRow(p, `p${i}#0`, i, null))).toEqual(atStart);
    const bank = new RunBank(1, { repo: () => null, log: { info: () => {}, error: () => {} }, deliver: () => {} });
    void bank.bankRunEnd(world, players.map((p, i) => ({ playerId: p.id, accountId: null, seatId: `p${i}#0`, slot: i })), []);
    expect(bank.resultSeats()).toEqual(atStart);
  });
});
