import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { NEUTRAL_INPUT, knockPlayer, applyZombieDamage, changeDecayStage, downPlayer, loadBalance, quantizeHeading, removeBuilding, setForcedBlackout, setLoadout, slowPlayer, spawnZombie } from "@topdown/shared";
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
    const S = balance.economy.startingWallet; // Story 5.13: 200
    expect(state.players.get("p0")?.wallet).toBe(S);
    expect(state.players.get("p0")?.earned).toBe(0);
    const w = controller.world;
    const id = spawnZombie(w, "walker", 40, 28);
    applyZombieDamage(w, id, 1, 1, 0, 0, "p0", "pistol");
    applyZombieDamage(w, id, 100, 1, 0, 0, "p1", "pistol");
    controller.tick(); // the economy pays the kill and the assist
    syncState(state, controller);
    expect(state.players.get("p1")).toMatchObject({ wallet: S + 2, earned: 2 });
    expect(state.players.get("p0")).toMatchObject({ wallet: S + 1, earned: 1 });
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
    const r = controller.placeBuilding("p0", { type: "wood_barricade", gx: 18, gy: 28, rot: 1 }); // Story 4.2: clear of street_car_west (x 4–8.5)
    expect(r.ok).toBe(true);
    controller.tick(); // the wallet change and the building go out with this tick
    syncState(state, controller);
    expect([...state.buildings.keys()]).toEqual(["1"]);
    expect(state.buildings.get("1")?.toJSON()).toEqual({ type: "wood_barricade", owner: "p0", gx: 18, gy: 28, rot: 1, hp: 200, trap: 0 });
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
    controller.placeBuilding("p1", { type: "wood_barricade", gx: 8, gy: 34, rot: 0 }); // Story 4.6: above curb_car_west_far (y 18–20)
    syncState(state, controller);
    resetRunFields(state);
    expect(state.buildings.size).toBe(0);
    syncState(state, controller); // a new sync after the reset adds it again (fresh bookkeeping)
    expect([...state.buildings.keys()]).toEqual(["2"]);
  });

  it("Story 5.9: an upgrade retypes the same schema entry (a type + HP patch, ~20 B), no remove/add", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    w.run.phase = "build";
    const me = w.players.get("p0");
    if (me) me.wallet = 500;
    expect(controller.placeBuilding("p0", { type: "wood_barricade", gx: 18, gy: 28, rot: 1 }).ok).toBe(true);
    controller.tick();
    syncState(state, controller);
    const entry = state.buildings.get("1");
    encoder.encode();
    encoder.discardChanges();
    expect(controller.upgradeBuilding("p0", 1).ok).toBe(true);
    syncState(state, controller);
    expect(state.buildings.get("1")).toBe(entry); // the same entry
    expect(state.buildings.get("1")?.toJSON()).toEqual({ type: "reinforced_barricade", owner: "p0", gx: 18, gy: 28, rot: 1, hp: 350, trap: 0 });
    const bytes = encoder.encode().length;
    encoder.discardChanges();
    console.info(`[bandwidth] building upgraded: ${bytes} B patch (incl. wallet)`);
    expect(bytes).toBeLessThan(40);
  });

  it("Story 5.14: a bear trap's jaws go out on change only (a 1-field patch), never per tick", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    w.run.phase = "build";
    expect(controller.placeBuilding("p0", { type: "bear_trap", gx: 18, gy: 28, rot: 0 }).ok).toBe(true);
    controller.tick();
    syncState(state, controller);
    expect(state.buildings.get("1")?.trap).toBe(0);
    encoder.encode();
    encoder.discardChanges();
    const b = w.buildings.list[0];
    if (!b) throw new Error("no trap");
    b.trapState = 1; // what updateBearTraps does on a snap (with version +1)
    w.buildings.version++;
    syncState(state, controller);
    expect(state.buildings.get("1")?.trap).toBe(1);
    const bytes = encoder.encode().length;
    encoder.discardChanges();
    console.info(`[bandwidth] bear trap snapped: ${bytes} B patch`);
    expect(bytes).toBeLessThan(12);
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false); // holding costs nothing per tick
    b.trapState = 2;
    w.buildings.version++;
    syncState(state, controller);
    expect(state.buildings.get("1")?.trap).toBe(2);
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

  it("Story 5.7: copies a Brute's knockback (ticks, int8 direction, mm per tick), counted down; reset clears it", () => {
    const { controller, state, encoder } = setup();
    const p0 = controller.world.players.get("p0");
    const brute = balance.zombies.types.brute;
    if (!p0 || !brute) throw new Error("setup");
    syncState(state, controller);
    encoder.encode();
    encoder.discardChanges();
    knockPlayer(p0, p0.x - 0.6, p0.y + 0.8, brute); // knocked toward (+0.6, −0.8)
    syncState(state, controller);
    const s = state.players.get("p0");
    expect([s?.knockTicks, s?.knockDx, s?.knockDy, s?.knockStepMm]).toEqual([4, 76, -102, 375]);
    const bytes = encoder.encode().length;
    encoder.discardChanges();
    console.info(`[bandwidth] Brute knockback: ${bytes} B patch at the hit`);
    expect(bytes).toBeLessThan(20);
    let seq = 0;
    for (let i = 0; i < 4; i++) {
      controller.queueInput("p0", { ...NEUTRAL_INPUT, seq: ++seq });
      controller.tick();
    }
    syncState(state, controller);
    expect(s?.knockTicks).toBe(0);
    resetRunFields(state);
    expect([s?.knockTicks, s?.knockDx, s?.knockDy, s?.knockStepMm]).toEqual([0, 0, 0, 0]);
  });

  it("Story 5.1: levels are synced (0 = empty slot), written only on change, and reset", () => {
    const { controller, state, encoder } = setup();
    const p0 = controller.world.players.get("p0");
    if (!p0) throw new Error("no p0");
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ level0: 1, level1: 0 }); // Pistol at I, no second weapon
    setLoadout(balance, p0.loadout, ["pistol", "smg"], [2, 3]);
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ level0: 2, level1: 3 });
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false); // a level costs nothing per tick
    (p0.loadout.slots[1] as { level: number }).level = 4;
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(true);
    const bytes = encoder.encode().length;
    expect(bytes).toBeLessThan(12); // one uint8 field patch
    expect(state.players.get("p0")?.level1).toBe(4);
    resetRunFields(state);
    expect(state.players.get("p0")).toMatchObject({ level0: 0, level1: 0 });
  });

  it("Story 5.11: gear (with maxHp/hp) written on change only (one small patch), reset on lobby return", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    const p0 = w.players.get("p0");
    if (!p0) throw new Error("no p0");
    syncState(state, controller);
    expect(state.players.get("p0")?.gear).toBe(0);
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false); // 0 B/s while nothing is bought
    p0.gear = 4;
    syncState(state, controller);
    expect(encoder.encode().length).toBeLessThan(12); // one uint8 field patch
    encoder.discardChanges();
    p0.gear = 5;
    p0.maxHp = 125;
    p0.hp = 125;
    syncState(state, controller);
    const bytes = encoder.encode().length;
    expect(bytes).toBeLessThan(20); // gear + maxHp + hp: an armor purchase
    expect(state.players.get("p0")).toMatchObject({ gear: 5, maxHp: 125, hp: 125 });
    resetRunFields(state);
    expect(state.players.get("p0")?.gear).toBe(0);
  });

  it("Story 5.12 (review L2): the consumable slot is written on change only (a use drops the count), reset on lobby return", () => {
    const { controller, state, encoder } = setup();
    const p0 = controller.world.players.get("p0");
    if (!p0) throw new Error("no p0");
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ consumable: 255, consumableCount: 0 });
    encoder.encode();
    encoder.discardChanges();
    syncState(state, controller);
    expect(encoder.hasChanges).toBe(false); // 0 B/s with an untouched slot
    p0.consumable = "grenades";
    p0.consumableCount = 3;
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ consumable: 1, consumableCount: 3 });
    expect(encoder.encode().length).toBeLessThan(16); // two uint8 fields
    encoder.discardChanges();
    p0.consumableCount = 2; // a use
    syncState(state, controller);
    expect(state.players.get("p0")?.consumableCount).toBe(2);
    expect(encoder.encode().length).toBeLessThan(12);
    encoder.discardChanges();
    p0.consumable = null; // the last one
    p0.consumableCount = 0;
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ consumable: 255, consumableCount: 0 });
    p0.consumable = "medkit";
    p0.consumableCount = 1;
    syncState(state, controller);
    resetRunFields(state);
    expect(state.players.get("p0")).toMatchObject({ consumable: 255, consumableCount: 0 });
  });

  it("Story 5.11: revive progress uses the current reviver's need (kit owner: 15 of 30 ticks = 50 %)", () => {
    const { controller, state } = setup();
    const w = controller.world;
    const p0 = w.players.get("p0");
    const p1 = w.players.get("p1");
    if (!p0 || !p1) throw new Error("no players");
    p1.gear = 8; // revive_kit
    downPlayer(w, p0);
    p1.x = p0.x + 1;
    p1.y = p0.y;
    for (let i = 0; i < 15; i++) controller.tick();
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ reviveProgress: 128, reviveNeed: 30 }); // review L2: the need is synced
    resetRunFields(state); // re-review: a lobby return mid-revive clears the need
    expect(state.players.get("p0")).toMatchObject({ reviveProgress: 0, reviveNeed: 0 });
    syncState(state, controller); // still reviving: written again
    expect(state.players.get("p0")?.reviveNeed).toBe(30);
    p1.x = p0.x + 30; // the reviver walks away: no revive, need 0
    controller.tick();
    syncState(state, controller);
    expect(state.players.get("p0")).toMatchObject({ reviveProgress: 0, reviveNeed: 0 });
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

  it("Story 4.4: writes the run seed and resetRunFields clears it", () => {
    const { controller, state } = setup();
    syncState(state, controller);
    expect(state.runSeed).toBe(7);
    controller.tick();
    syncState(state, controller);
    expect(state.runSeed).toBe(7);
    resetRunFields(state);
    expect(state.runSeed).toBe(0);
  });

  it("Story 4.5: the decay stage and variants are written only when they change (bytes on change, none per tick); reset clears them", () => {
    const { controller, state, encoder } = setup();
    syncState(state, controller);
    expect(state.decayStage).toBe(1);
    expect(state.decayVariants).toBe(controller.world.decay.variants);
    expect(state.decayVariants).not.toBe(0); // Downtown always picks one car and one fire
    encoder.encode();
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const idle = encoder.encode().length; // only `tick`
    encoder.discardChanges();
    expect(changeDecayStage(controller.world, 2)).toBe(true);
    controller.tick();
    syncState(state, controller);
    expect(state.decayStage).toBe(2);
    const change = encoder.encode().length;
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const after = encoder.encode().length;
    encoder.discardChanges();
    // Bandwidth (brief line 14): the stage costs its field once, on the change tick; nothing after.
    const decayBytes = change - idle;
    expect(decayBytes).toBeGreaterThan(0);
    expect(decayBytes).toBeLessThanOrEqual(4);
    expect(after).toBe(idle);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[bandwidth] decay stage patch: +${decayBytes} B on the change tick (idle patch ${idle} B); variants once per run`);
    resetRunFields(state);
    expect([state.decayStage, state.decayVariants]).toEqual([0, 0]);
  });

  it("Story 4.8: decayFiresOut is written only when a fire goes out (one field, once); reset clears it", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    expect(changeDecayStage(w, 3)).toBe(true);
    controller.tick();
    syncState(state, controller);
    expect(w.decay.fires).toHaveLength(2);
    expect(state.decayFiresOut).toBe(0);
    encoder.encode();
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const idle = encoder.encode().length; // burning, nobody inside: only `tick`
    encoder.discardChanges();
    w.decay.firesOut = 0b101; // as the DecaySystem writes it at a build start
    controller.tick();
    syncState(state, controller);
    expect(state.decayFiresOut).toBe(0b101);
    const change = encoder.encode().length;
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const after = encoder.encode().length;
    encoder.discardChanges();
    expect(change - idle).toBeGreaterThan(0);
    expect(change - idle).toBeLessThanOrEqual(6);
    expect(after).toBe(idle);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[bandwidth] fires-out patch: +${change - idle} B once per expiry (idle patch ${idle} B)`);
    resetRunFields(state);
    expect(state.decayFiresOut).toBe(0);
  });

  it("Story 6.3: blackoutPct and halfDark are written on change only (≤ 3 B on the change tick, none per tick); reset clears them", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    syncState(state, controller);
    expect([state.blackoutPct, state.halfDark]).toEqual([0, false]);
    encoder.encode();
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const idle = encoder.encode().length;
    encoder.discardChanges();
    setForcedBlackout(w, 5);
    controller.tick();
    syncState(state, controller);
    expect(state.blackoutPct).toBe(5);
    const change = encoder.encode().length;
    encoder.discardChanges();
    controller.tick();
    syncState(state, controller);
    const after = encoder.encode().length;
    encoder.discardChanges();
    expect(change - idle).toBeGreaterThan(0);
    expect(change - idle).toBeLessThanOrEqual(3);
    expect(after).toBe(idle);
    w.lights.halfDark = true; // as refreshBlackout writes it in a build phase at stage 5 (6.4)
    controller.tick();
    syncState(state, controller);
    const halfChange = encoder.encode().length;
    encoder.discardChanges();
    expect(state.halfDark).toBe(true);
    expect(halfChange - idle).toBeLessThanOrEqual(3);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[bandwidth] blackout patch: +${change - idle} B on a level change, +${halfChange - idle} B on half dark (idle patch ${idle} B)`);
    resetRunFields(state);
    expect([state.blackoutPct, state.halfDark]).toEqual([0, false]);
  });
});

describe("Story 6.5 syncState: the boss record", () => {
  it("syncs every boss field on change, the target as its slot, and resets with the run", () => {
    const { controller, state, encoder } = setup();
    const w = controller.world;
    syncState(state, controller);
    expect(state.boss.state).toBe(0);
    encoder.encode(); // settle the first full patch
    encoder.discardChanges();
    const b = w.boss;
    b.state = 2;
    b.x = 12.5;
    b.y = 3.25;
    b.facing = Math.PI / 2;
    b.hp = 4799.2;
    b.maxHp = 4800;
    b.number = 1;
    b.look = 2;
    b.targetId = "p1";
    b.attack.id = 3;
    b.attack.kind = 1;
    b.attack.startTick = 100;
    b.attack.hitTick = 124;
    b.attack.cx = 12.5;
    b.attack.cy = 3.25;
    b.attack.radiusM = 4.5;
    syncState(state, controller);
    expect({ ...state.boss.toJSON() }).toEqual({
      state: 2,
      x: 12.5,
      y: 3.25,
      heading: quantizeHeading(0, 1),
      hp: 4800,
      maxHp: 4800,
      number: 1,
      look: 2,
      target: 1,
      enraged: false,
      atkId: 3,
      atkKind: 1,
      atkStart: 100,
      atkHit: 124,
      atkX: 12.5,
      atkY: 3.25,
      atkR: 4.5,
    });
    encoder.encode();
    encoder.discardChanges();
    // Nothing changed: no bytes for the boss.
    syncState(state, controller);
    const patch = encoder.encode();
    expect(patch.length).toBeLessThan(20); // the tick only
    resetRunFields(state);
    expect(state.boss.state).toBe(0);
    expect(state.boss.target).toBe(255);
  });
});
