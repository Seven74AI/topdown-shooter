import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import { createWorld, type World } from "../core/world";
import { addBuildingAt, buildingStats, removeBuilding } from "../buildings/buildings";
import { updateEconomy } from "../economy/economy";
import { addPlayer } from "../player/player";
import { holdPlayer } from "../player/hold";
import { downPlayer } from "../player/downed";
import { damagePlayerBy } from "../combat/damage";
import { countWipedWave } from "./runRecord";
import { hadWave } from "./milestoneRecord";

/** Story 7.11 (AC 3, M-F1, M-F2): the per-seat milestone counters, from World events only. */
const balance = loadBalance();
function setup(): World {
  const w = createWorld({ balance, seed: 1, loot: { off: true }, systems: { waves: () => {}, zombies: () => {} } });
  addPlayer(w, "p0", 10, 10);
  addPlayer(w, "p1", 12, 10);
  w.run.phase = "wave";
  w.waves.number = 1;
  return w;
}
const run = (w: World, ...events: SimEvent[]): void => {
  for (const e of events) w.events.emit(e);
  updateEconomy(w, 0.05);
  w.events.flush();
};
const p = (w: World, id: string) => w.players.get(id)!;
let nextId = 100;
function place(w: World, owner: string, type = "wood_barricade"): number {
  const id = nextId++;
  const stats = buildingStats(balance, type)!;
  addBuildingAt(w, { id, type, ownerId: owner, gx: 4 + (id % 40) * 4, gy: 60, rot: 0, hp: stats.hp });
  run(w, { type: "building.placed", buildingId: id, buildingType: type, ownerId: owner, gx: 0, gy: 0, rot: 0 });
  return id;
}

describe("Story 7.11: milestone counters", () => {
  it("kills: own kills and finishing the Behemoth count; a turret's or mine's kill doesn't (D6)", () => {
    const w = setup();
    run(w, { type: "zombie.killed", zombieId: 1, killerId: "p0", x: 0, y: 0, weapon: "pistol" });
    run(w, { type: "zombie.killed", zombieId: 2, killerId: "p0", x: 0, y: 0, weapon: "", buildingId: 3 });
    run(w, { type: "boss.killed", killerId: "p0", weapon: "pistol", x: 0, y: 0, number: 1 });
    expect(p(w, "p0").kills).toBe(2);
    expect(p(w, "p1").kills).toBe(0);
  });

  it("revives go to the reviver; downs count in waves 1–10 only (D7)", () => {
    const w = setup();
    run(w, { type: "player.revived", playerId: "p1", reviverId: "p0" });
    run(w, { type: "player.downed", playerId: "p1" });
    w.waves.number = 11;
    run(w, { type: "player.downed", playerId: "p1" });
    expect(p(w, "p0").revives).toBe(1);
    expect(p(w, "p1").downs10).toBe(1);
  });

  it("review M2 (B31): a revive counts in phase wave only, and not of a down the reviver caused (friendly fire)", () => {
    const w = setup();
    addPlayer(w, "p2", 14, 10);
    const revive = (by: string) => run(w, { type: "player.revived", playerId: "p1", reviverId: by });
    const standUp = () => Object.assign(p(w, "p1"), { status: "alive", hp: 100, protectTicks: 0 });
    // build phase: no zombies, no risk → nothing, whoever downed them
    w.run.phase = "build";
    standUp();
    downPlayer(w, p(w, "p1"));
    revive("p0");
    expect(p(w, "p0").revives).toBe(0);
    // wave, the reviver's own grenade did it → nothing; a teammate reviving that down → counts
    w.run.phase = "wave";
    standUp();
    expect(damagePlayerBy(w, p(w, "p1"), 100_000, "explosion", "p0")).toBeGreaterThan(0);
    expect(p(w, "p1").status).toBe("downed");
    expect(p(w, "p1").downedBy).toBe("p0");
    revive("p0");
    expect(p(w, "p0").revives).toBe(0);
    revive("p2");
    expect(p(w, "p2").revives).toBe(1);
    // wave, a zombie's down: counts
    standUp();
    downPlayer(w, p(w, "p1"));
    expect(p(w, "p1").downedBy).toBeNull();
    revive("p0");
    expect(p(w, "p0").revives).toBe(1);
  });

  it("review L2: a down in the build phase is no down for M9 (friendly fire between waves)", () => {
    const w = setup();
    w.run.phase = "build";
    run(w, { type: "player.downed", playerId: "p1" });
    expect(p(w, "p1").downs10).toBe(0);
    w.run.phase = "wave";
    run(w, { type: "player.downed", playerId: "p1" });
    expect(p(w, "p1").downs10).toBe(1);
  });

  it("M-F2: barricades count only when still standing at the next wave start; 100 place / take-back cycles → 0", () => {
    const w = setup();
    w.run.phase = "build";
    for (let i = 0; i < 100; i++) removeBuilding(w, place(w, "p0"));
    place(w, "p0"); // kept
    place(w, "p0", "spike_trap"); // not a barricade
    const gone = place(w, "p1");
    removeBuilding(w, gone);
    expect(p(w, "p0").barricades).toBe(0); // nothing counts before the wave starts
    run(w, { type: "wave.started", number: 2, size: 10 });
    expect(p(w, "p0").barricades).toBe(1);
    expect(p(w, "p1").barricades).toBe(0);
    run(w, { type: "wave.started", number: 3, size: 10 }); // counted once, not again every wave
    expect(p(w, "p0").barricades).toBe(1);
  });

  it("wave mask: waves that ended while in (held seats too); the wave a team wipe falls in is paid but not survived", () => {
    const w = setup();
    for (let n = 1; n <= 4; n++) run(w, { type: "wave.ended", number: n });
    holdPlayer(w, "p1");
    run(w, { type: "wave.ended", number: 5 });
    expect(hadWave(p(w, "p0").waveMask, 5)).toBe(true);
    expect(hadWave(w.heldPlayers.get("p1")!.player.waveMask, 5)).toBe(true); // M-F1 / NP 21: held keeps counting
    w.waves.number = 6;
    const wavesBefore = p(w, "p0").wavesIn;
    countWipedWave(w);
    expect(p(w, "p0").wavesIn).toBe(wavesBefore + 1); // 7.2 D8: paid
    expect(hadWave(p(w, "p0").waveMask, 6)).toBe(false); // 7.11: not survived
    expect(hadWave(p(w, "p0").waveMask, 5)).toBe(true);
  });
});
