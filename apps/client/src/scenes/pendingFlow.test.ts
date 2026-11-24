import { describe, expect, it } from "vitest";
import { addBuildingAt, addPlayer, createWorld, loadBalance, startBuild, type PlaceError, type PlaceRequest } from "@topdown/shared";
import { PendingPlacements } from "./pendingPlacements";
import { NO_ANSWER_TEXT, runPendingFrame, type PendingFlowHost, type PendingFlowScene } from "./pendingFlow";

/** Story 5.18 (review M2): the shared frame order, with a fake host. */
const balance = loadBalance();
const BOX = { minX: 5, minY: 5, maxX: 7, maxY: 5.5 };
const REQ: PlaceRequest = { type: "wood_barricade", gx: 10, gy: 10, rot: 0 };

function rig() {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(world, "p0", 20, 16);
  startBuild(world);
  const log: string[] = [];
  const refusals: PlaceError[] = [];
  const host: PendingFlowHost & { placeRefusalsDropped: number } = {
    world,
    localPlayerId: "p0",
    placeRefusalsDropped: 0,
    placeBuilding: (r) => log.push(`send ${r.gx}`),
    takePlaceRefusal: () => refusals.shift() ?? null,
  };
  const pending = new PendingPlacements();
  const toasts: string[] = [];
  const buzzes: number[] = [];
  let onStep = (): void => {};
  let onBefore = (): void => {};
  const scene: PendingFlowScene = {
    beforeHost: () => {
      log.push(`before count=${pending.count}`);
      onBefore();
    },
    stepHost: () => {
      log.push("host");
      onStep();
    },
    toast: (t) => toasts.push(t),
    refusalText: (e) => `refused ${e}`,
    refused: () => buzzes.push(1), // Story 5.23 (AC 3)
  };
  const dropped = { seen: 0 };
  let now = 0;
  const frame = () => {
    now += 16;
    runPendingFrame(pending, host, now, scene, (r) => host.placeBuilding(r), dropped);
  };
  return {
    world,
    host,
    pending,
    toasts,
    buzzes,
    log,
    refusals,
    frame,
    setStep: (f: () => void) => (onStep = f),
    setBefore: (f: () => void) => (onBefore = f),
  };
}

describe("Story 5.18: runPendingFrame", () => {
  it("order: match → scene step (may add) → send → host step → match again: a building applied by the host step is matched the same frame", () => {
    const r = rig();
    r.setBefore(() => {
      if (r.pending.count === 0 && r.log.length < 3) r.pending.add(REQ, 40, BOX, 0, "build", r.world.waves.number);
    });
    r.setStep(() => {
      if (r.log.includes("send 10")) addBuildingAt(r.world, { id: 1, type: REQ.type, ownerId: "p0", gx: 10, gy: 10, rot: 0, hp: 100 });
    });
    r.frame();
    expect(r.log).toEqual(["before count=0", "send 10", "host"]);
    expect(r.pending.count).toBe(0); // matched after the host step, not a frame later
  });

  it("timeouts toast \"No answer from the server\"; refusals toast and pick the oldest box, a timed-out box's late refusal stays quiet", () => {
    const r = rig();
    r.pending.add(REQ, 40, BOX, 0, "build", r.world.waves.number);
    r.frame(); // sent
    for (let i = 0; i < 130; i++) r.frame();
    expect([r.toasts, r.buzzes.length]).toEqual([[NO_ANSWER_TEXT], 1]); // Story 5.23: a timeout buzzes once
    r.refusals.push("blocked");
    r.frame();
    expect([r.toasts, r.buzzes.length]).toEqual([[NO_ANSWER_TEXT], 1]); // the ghost took it (D7): no second buzz
    r.pending.add({ ...REQ, gx: 20 }, 40, BOX, 0, "build", r.world.waves.number);
    r.frame();
    r.refusals.push("money");
    r.frame();
    expect([r.toasts, r.buzzes.length]).toEqual([[NO_ANSWER_TEXT, "refused money"], 2]);
    expect(r.pending.count).toBe(0);
  });

  it("re-review: a box times out only after the host step, and its building (applied by that step) is matched before the timeout", () => {
    const r = rig();
    r.pending.add(REQ, 40, BOX, 0, "build", r.world.waves.number);
    r.frame(); // sent at the first frame
    while (r.pending.clockMs + 16 < 2000) r.frame();
    expect(r.pending.clockMs).toBeLessThan(2000); // not timed out yet…
    expect(r.pending.clockMs + 16).toBeGreaterThanOrEqual(2000); // …but the next frame's 2 s run out
    r.setStep(() => addBuildingAt(r.world, { id: 1, type: REQ.type, ownerId: "p0", gx: 10, gy: 10, rot: 0, hp: 100 }));
    r.frame(); // the frame its 2 s run out: the host step brings the building
    expect(r.toasts).toEqual([]);
    expect(r.pending.count).toBe(0);
  });

  it("review L1: when the host dropped a refusal, the next ones only toast (no box is guessed)", () => {
    const r = rig();
    r.pending.add(REQ, 40, BOX, 0, "build", r.world.waves.number);
    r.frame(); // sent, awaiting
    r.host.placeRefusalsDropped = 1;
    r.refusals.push("blocked");
    r.frame();
    expect(r.toasts).toEqual(["refused blocked"]);
    expect(r.pending.count).toBe(1); // still pending: it times out instead of taking a refusal that may not be its own
  });
});
