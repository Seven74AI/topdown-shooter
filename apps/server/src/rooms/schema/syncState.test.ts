import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { NEUTRAL_INPUT, loadBalance, quantizeHeading, setLoadout } from "@topdown/shared";
import { RunController } from "../../run/RunController";
import { PlayerState, RunState } from "./RunState";
import { syncState } from "./syncState";

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
    if (p1) p1.status = "dead";
    syncState(state, controller);
    expect(state.aliveCount).toBe(1);
    expect(state.players.get("p1")?.status).toBe("dead");
  });
});
