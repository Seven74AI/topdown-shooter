import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { NEUTRAL_INPUT, applyZombieDamage, downPlayer, loadBalance, quantizeHeading, removeBuilding, setLoadout, slowPlayer, spawnZombie } from "@topdown/shared";
import { RunController } from "../../run/RunController";
import { PlayerState, RunState } from "./RunState";
import { resetRunFields, syncState } from "./syncState";

const balance = loadBalance();

function setup() {
  const controller = new RunController({
    balance,
    seed: 7,
    players: [
      { playerId: "p0", slot: 0 },
      { playerId: "p1", slot: 1 },
    ],
    pauseWaves: true,
  });
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  state.players.set("p0", new PlayerState({ slot: 0, name: "Ana", ready: true }));
  state.players.set("p1", new PlayerState({ slot: 1, name: "Bo", ready: true }));
  return { controller, state, encoder: new Encoder(state) };
}

describe("syncState", () => {
  it("copies World values into the schema", () => {
    const { controller, state } = setup();
    const p0 = controller.world.players.get("p0");
    if (!p0) throw new Error("no p0");
    setLoadout(balance, p0.loadout, ["smg", "machete"]);
    for (let seq = 1; seq <= 10; seq++) {
      controller.queueInput("p0", { ...NEUTRAL_INPUT, seq, moveX: 1, aimX: 0, aimY: 1, fire: true });
      controller.tick();
    }
    p0.hp = 37.4;
    syncState(state, controller);
    const s = state.players.get("p0");
    expect(s?.x).toBe(Math.fround(p0.x));
    expect(s?.y).toBe(Math.fround(p0.y));
    expect(s?.heading).toBe(quantizeHeading(p0.facingX, p0.facingY));
    expect(s?.heading).toBe(64);
    expect(s?.hp).toBe(38);
    expect(s?.maxHp).toBe(100);
    expect(s?.status).toBe("alive");
    expect(s?.ackSeq).toBe(10);
    expect(s?.weapon0).toBe("smg");
    expect(s?.weapon1).toBe("machete");
    expect(s?.ammo0).toBe(p0.loadout.slots[0].ammo);
    expect(s?.ammo0).toBeLessThan(40);
    expect(s?.active).toBe(0);
    expect(state.players.get("p1")?.weapon1).toBe("");
    expect(state.tick).toBe(10);
    expect(state.wave).toBe(controller.world.waves.number);
    expect(state.aliveCount).toBe(2);
  });

  it("assigns nothing when nothing changed", () => {
    const { controller, state, encoder } = setup();
    controller.tick();
    syncState(state, controller);
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller); // same tick, same World
    expect(encoder.hasChanges).toBe(false);
    controller.tick(); // idle players, paused waves: only `tick` changes
    syncState(state, controller);
    const bytes = encoder.encode().length;
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(8);
  });

  it("counts only alive players", () => {
    const { controller, state } = setup();
    const p1 = controller.world.players.get("p1");
    if (p1) p1.status = "downed";
    syncState(state, controller);
    expect(state.aliveCount).toBe(1);
    expect(state.players.get("p1")?.status).toBe("downed");
  });

  it("copies the downed countdown, revive progress (0–255) and kills (Story 2.8)", () => {
    const { controller, state } = setup();
    const w = controller.world;
    const p0 = w.players.get("p0");
    const p1 = w.players.get("p1");
    if (!p0 || !p1) throw new Error("no players");
    downPlayer(w, p0);
    p1.x = p0.x + 1; // within reach: the revive runs, the countdown pauses
    p1.y = p0.y;
    for (let i = 0; i < 30; i++) controller.tick();
    syncState(state, controller);
    const s0 = state.players.get("p0");
    expect(s0?.status).toBe("downed");
    expect(s0?.downedTicksLeft).toBe(400);
    expect(s0?.reviveProgress).toBe(128); // 30 / 60 ticks
    expect(s0?.kills).toBe(0);
    expect(state.aliveCount).toBe(1);
  });

  it("copies wallet and earned (Story 3.2), and only when they change", () => {
    const { controller, state, encoder } = setup();
    syncState(state, controller);
    expect(state.players.get("p0")?.wallet).toBe(100);
    expect(state.players.get("p0")?.earned).toBe(0);
    const w = controller.world;
    const id = spawnZombie(w, "walker", 40, 28);
    applyZombieDamage(w, id, 1, 1, 0, 0, "p0", "pistol");
    applyZombieDamage(w, id, 100, 1, 0, 0, "p1", "pistol");
    controller.tick(); // the economy pays the kill and the assist
    syncState(state, controller);
    expect(state.players.get("p1")).toMatchObject({ wallet: 102, earned: 2 });
    expect(state.players.get("p0")).toMatchObject({ wallet: 101, earned: 1 });
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false);
  });

  it("Story 3.4: a placed building is sent once (~40 B), idle buildings cost nothing, HP only on change, removal deletes it", () => {
    const { controller, state, encoder } = setup();
    controller.tick();
    syncState(state, controller);
    encoder.encode();
    encoder.discardChanges();
    const w = controller.world;
    w.run.phase = "build"; // RunController started in a build phase; setup's state says "wave"
    const r = controller.placeBuilding("p0", { type: "wood_barricade", gx: 30, gy: 8, rot: 1 });
    expect(r.ok).toBe(true);
    controller.tick(); // the wallet change and the building go out with this tick
    syncState(state, controller);
    expect([...state.buildings.keys()]).toEqual(["1"]);
    expect(state.buildings.get("1")?.toJSON()).toEqual({ type: "wood_barricade", owner: "p0", gx: 30, gy: 8, rot: 1, hp: 200 });
    const placedBytes = encoder.encode().length;
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const idleBytes = encoder.encode().length; // only `tick`, as without buildings
    encoder.discardChanges();
    console.info(`[bandwidth] building placed: ${placedBytes} B patch (incl. tick + wallet); idle tick with 1 building: ${idleBytes} B`);
    expect(placedBytes).toBeLessThan(60);
    expect(idleBytes).toBeLessThan(8);
    const b = w.buildings.list[0];
    if (b) b.hp = 150.2; // Story 3.5 damage
    syncState(state, controller);
    expect(state.buildings.get("1")?.hp).toBe(151);
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false);
    removeBuilding(w, 1);
    syncState(state, controller);
    expect(state.buildings.size).toBe(0);
    controller.placeBuilding("p1", { type: "wood_barricade", gx: 10, gy: 8, rot: 0 });
    syncState(state, controller);
    resetRunFields(state);
    expect(state.buildings.size).toBe(0);
    syncState(state, controller); // a new sync after the reset adds it again (fresh bookkeeping)
    expect([...state.buildings.keys()]).toEqual(["2"]);
  });

  it("copies the bite slow (Story 3.9), counted down by the World", () => {
    const { controller, state } = setup();
    const p0 = controller.world.players.get("p0");
    if (!p0) throw new Error("no p0");
    slowPlayer(p0, 30, 20);
    let seq = 0;
    // The slow counts applied seqs (3.9 review: a starved tick doesn't count it): send one per tick.
    const tick = () => {
      controller.queueInput("p0", { ...NEUTRAL_INPUT, seq: ++seq });
      controller.tick();
    };
    tick(); // one movement tick slowed
    syncState(state, controller);
    expect(state.players.get("p0")?.slowTicks).toBe(19);
    expect(state.players.get("p0")?.slowPct).toBe(30);
    controller.tick(); // starved: the slow waits for the next seq
    syncState(state, controller);
    expect(state.players.get("p0")?.slowTicks).toBe(19);
    for (let i = 0; i < 19; i++) tick();
    syncState(state, controller);
    expect(state.players.get("p0")?.slowTicks).toBe(0);
    expect(state.players.get("p0")?.slowPct).toBe(0);
  });

  it("resetRunFields puts every fight field and Ready back, keeping slot and name", () => {
    const { controller, state } = setup();
    controller.tick();
    syncState(state, controller);
    const s0 = state.players.get("p0");
    if (!s0) throw new Error("no p0");
    s0.kills = 5;
    s0.wallet = 321;
    s0.earned = 221;
    s0.status = "out";
    s0.slowTicks = 12;
    s0.slowPct = 30;
    state.resultWave = 3;
    resetRunFields(state);
    expect(s0.toJSON()).toEqual(new PlayerState({ slot: 0, name: "Ana", ready: false }).toJSON());
    expect(state.resultWave).toBe(0);
    expect(state.tick).toBe(0);
  });
});
