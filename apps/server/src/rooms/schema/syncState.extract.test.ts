import { describe, expect, it } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { loadBalance, skipWave, startBuild, startWave } from "@topdown/shared";
import { RunController } from "../../run/RunController";
import { PlayerState, RunState } from "./RunState";
import { resetRunFields, syncState } from "./syncState";

/**
 * Story 12.2 (AC 15, 18; X7): E8-A2's copy chain for the extraction's synced fields — `phase` ("extract"), each player's
 * `boarded` and `liftedAtTick` — "sent → changed → synced", through the real writer, with every patch decoded into a
 * client copy of the state (the wire, not only the server's schema object).
 */
const balance = loadBalance();

function setup() {
  const controller = new RunController({ balance, seed: 7, players: [{ playerId: "p0", slot: 0 }, { playerId: "p1", slot: 1 }] });
  const w = controller.world;
  w.debug.bossWaves = [];
  if (w.run.phase === "lobby") startBuild(w); // the controller may already be in the first build
  while (w.run.phase === "build" || w.run.phase === "wave") {
    if (w.run.phase === "build") startWave(w);
    skipWave(w);
  }
  expect(w.run.phase).toBe("vote");
  const state = new RunState({ phase: "vote", hostSlot: 0 });
  state.players.set("p0", new PlayerState({ slot: 0, name: "Ana", ready: true }));
  state.players.set("p1", new PlayerState({ slot: 1, name: "Bo", ready: true }));
  const encoder = new Encoder(state);
  syncState(state, controller);
  const client = new RunState();
  const decoder = new Decoder(client);
  decoder.decode(encoder.encodeAll()); // sent: the vote's state
  encoder.discardChanges();
  const tick = (): void => {
    controller.tick();
    syncState(state, controller);
    decoder.decode(encoder.encode());
    encoder.discardChanges();
  };
  return { controller, w, state, client, tick };
}

describe("E8-A2 syncState: the extraction's fields reach the wire", () => {
  it("phase: vote → extract → results, each on the tick it changes", () => {
    const { controller, w, client, tick } = setup();
    expect(client.phase).toBe("vote");
    controller.castVote("p0", "extract");
    controller.castVote("p1", "extract");
    let n = 0;
    while (w.run.phase === "vote" && n++ < 400) tick();
    expect(w.run.phase).toBe("extract");
    expect(client.phase).toBe("extract");
    while (w.run.phase === "extract" && n++ < 2000) tick();
    expect(w.run.phase).toBe("results");
    expect(client.phase).toBe("results");
  });

  it("boarded: false when sent; true on the client the tick each player boards; reset by Back to lobby", () => {
    const { controller, w, state, client, tick } = setup();
    expect([client.players.get("p0")?.boarded, client.players.get("p1")?.boarded]).toEqual([false, false]);
    controller.castVote("p0", "extract");
    controller.castVote("p1", "extract");
    const seen = new Map<string, number>();
    for (let n = 0; n < 600 && w.extract.liftedAtTick < 0; n++) {
      tick();
      for (const id of ["p0", "p1"]) {
        const boarded = w.extract.boarded.has(id);
        expect(client.players.get(id)?.boarded, `${id} at tick ${w.tick}`).toBe(boarded);
        if (boarded && !seen.has(id)) seen.set(id, w.tick);
      }
    }
    expect([...seen.keys()].sort()).toEqual(["p0", "p1"]); // something really happened
    resetRunFields(state);
    expect(state.players.get("p0")?.boarded).toBe(false);
  });

  it("liftedAtTick: −1 when sent; the lift-off tick on the client the tick it happens; −1 again after Back to lobby", () => {
    const { controller, w, state, client, tick } = setup();
    expect(client.liftedAtTick).toBe(-1);
    controller.castVote("p0", "extract");
    controller.castVote("p1", "extract");
    for (let n = 0; n < 600 && w.extract.liftedAtTick < 0; n++) {
      tick();
      expect(client.liftedAtTick).toBe(w.extract.liftedAtTick); // −1 until the lift-off tick's own patch
    }
    expect(w.extract.liftedAtTick).toBeGreaterThan(0);
    expect(client.liftedAtTick).toBe(w.extract.liftedAtTick);
    tick();
    expect(client.liftedAtTick).toBe(w.extract.liftedAtTick); // no change after
    resetRunFields(state);
    expect(state.liftedAtTick).toBe(-1);
  });

  it("AC 3: inputs queued during the extract never reach the World", () => {
    const { controller, w, tick } = setup();
    controller.castVote("p0", "extract");
    controller.castVote("p1", "extract");
    for (let n = 0; n < 400 && w.run.phase === "vote"; n++) tick();
    expect(w.run.phase).toBe("extract");
    controller.queueInput("p0", { seq: 1, moveX: -1, moveY: 0, aimX: 1, aimY: 0, fire: true, swap: false, consumable: false, isMouse: false, viewTick: -1 });
    controller.tick();
    expect(w.pendingInputs.has("p0")).toBe(false);
  });
});
