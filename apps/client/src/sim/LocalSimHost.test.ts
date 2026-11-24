import { describe, expect, it } from "vitest";
import { addPlayer, loadBalance, setLoadout, startWave, ticksFor, type SimEvent } from "@topdown/shared";
import { LOCAL_PLAYER_ID, LocalSimHost, MAX_CATCHUP_STEPS } from "./LocalSimHost";

const balance = loadBalance();
const FRAME_60HZ = 1 / 60;

describe("LocalSimHost build phase (Story 3.1)", () => {
  it("starts in the first build phase, delivers build.started with the first step, and Ready skips the rest", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16); // the scene adds the player right after
    expect(host.world.run.phase).toBe("build");
    host.update(0.05);
    expect(host.drainEvents().map((e) => e.type)).toContain("build.started");
    expect(host.world.run.buildTicksLeft).toBe(ticksFor(balance.waves.buildPhaseS) - 1);
    host.setBuildReady(true);
    host.update(0.05);
    expect(host.world.run.phase).toBe("wave");
    expect(host.world.waves.number).toBe(1);
  });

  it("the in-run menu's pause freezes the build countdown", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    host.update(0.05);
    const left = host.world.run.buildTicksLeft;
    host.paused = true;
    for (let i = 0; i < 100; i++) host.update(0.05);
    expect(host.world.run.buildTicksLeft).toBe(left);
  });
});

describe("LocalSimHost", () => {
  it("steps exactly 20 times in 1 s of 60 Hz frames", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    for (let i = 0; i < 60; i++) host.update(FRAME_60HZ);
    // Float accumulation can leave the 20th step a hair short; allow one extra tiny frame.
    host.update(1e-9);
    expect(host.world.tick).toBe(20);
  });

  it("caps catch-up after a long frame and drops the rest", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(2);
    expect(host.world.tick).toBe(MAX_CATCHUP_STEPS);
    expect(host.alpha).toBeGreaterThanOrEqual(0);
    expect(host.alpha).toBeLessThan(1);
    host.update(FRAME_60HZ);
    expect(host.world.tick).toBeLessThanOrEqual(MAX_CATCHUP_STEPS + 1);
  });

  it("doesn't step while paused, and resumes without a catch-up burst or an alpha jump (Story 2.11)", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(0.07); // 1 step, 0.02 s left over
    expect(host.world.tick).toBe(1);
    const alpha = host.alpha;
    host.paused = true;
    for (let i = 0; i < 600; i++) host.update(FRAME_60HZ); // 10 s in the menu
    host.update(2); // and one long frame (a hidden tab while paused)
    expect(host.world.tick).toBe(1);
    expect(host.stats.lastUpdateSteps).toBe(0);
    expect(host.alpha).toBe(alpha); // frozen: the drawn positions don't snap
    host.paused = false;
    host.update(FRAME_60HZ); // 0.02 + 0.0167 < 0.05: still no step
    expect(host.world.tick).toBe(1);
    host.update(FRAME_60HZ);
    expect(host.world.tick).toBe(2); // exactly one step, never a burst
  });

  it("times each step of the last update (stats for the perf overlay)", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(0.12); // 2 steps, 0.02 s left over
    expect(host.stats.lastUpdateSteps).toBe(2);
    expect(Number.isFinite(host.stats.stepMs[0] as number) && (host.stats.stepMs[0] as number) >= 0).toBe(true);
    expect(Number.isFinite(host.stats.stepMs[1] as number) && (host.stats.stepMs[1] as number) >= 0).toBe(true);
    host.update(0.01);
    expect(host.stats.lastUpdateSteps).toBe(0);
    host.update(0);
    expect(host.stats.lastUpdateSteps).toBe(0);
    expect(host.stats.totalSteps).toBe(2);
  });

  it("keeps alpha in [0, 1) across uneven frames", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    for (const dt of [0.001, 0.033, 0.017, 0.049, 0.051, 0.1, 0.0167]) {
      host.update(dt);
      expect(host.alpha).toBeGreaterThanOrEqual(0);
      expect(host.alpha).toBeLessThan(1);
    }
  });

  it("ignores zero, negative and NaN frame times", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(0);
    host.update(-1);
    host.update(Number.NaN);
    expect(host.world.tick).toBe(0);
    expect(host.alpha).toBe(0);
  });

  it("hands out events from all steps of a frame once, in order", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    // Emit one event per tick from outside a system: it is delivered at the next step's flush.
    const emitNext = () => host.world.events.emit({ type: "test.ping", n: host.world.tick });
    emitNext();
    host.update(0.05);
    emitNext();
    host.update(0.05);
    const first = host.drainEvents().filter((e) => e.type === "test.ping").map((e) => (e.type === "test.ping" ? e.n : -1)); // build.started (3.1) comes too
    expect(first).toEqual([0, 1]);
    expect(host.drainEvents()).toEqual([]);
  });

  it("delivers a swap tapped between two steps to exactly one step", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    let swapTicks = 0;
    const neutral = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false, viewTick: -1 };
    host.setLocalInput({ ...neutral, swap: true }); // tap on one frame…
    host.update(FRAME_60HZ);
    host.setLocalInput(neutral); // …released on the next, before any step ran
    let lastTick = host.world.tick;
    if (host.world.inputs.get("local")?.swap) swapTicks++;
    for (let i = 0; i < 12; i++) {
      host.update(FRAME_60HZ);
      if (host.world.tick !== lastTick) {
        lastTick = host.world.tick;
        if (host.world.inputs.get("local")?.swap) swapTicks++;
      }
    }
    expect(host.world.tick).toBeGreaterThanOrEqual(3);
    expect(swapTicks).toBe(1);
  });

  it("re-review M: a throw tapped on frame 1 and stepped on frame 3 uses frame 1's throw-encoded aim, fire off (launcher in hand, 6 m)", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    startWave(host.world);
    const p = host.world.players.get(LOCAL_PLAYER_ID)!;
    setLoadout(balance, p.loadout, ["grenade_launcher", "pistol"]);
    p.consumable = "grenades";
    p.consumableCount = 3;
    const GL = balance.weapons.grenade_launcher as { lobRangeM: number };
    const THROW = balance.consumables.items.grenades!.throwRangeM!;
    const neutral = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: true, viewTick: -1 };
    host.drainEvents();
    // frame 1: the tap — InputRouter encodes the throw's range (6 m of 8) and drops fire
    host.setLocalInput({ ...neutral, aimY: 6 / THROW, consumable: true });
    host.update(FRAME_60HZ);
    expect(host.world.tick).toBe(0); // no step yet
    const events: SimEvent[] = [];
    let thrownFire: boolean | undefined;
    // frames 2, 3…: the launcher's encoding of the same 6 m, fire held
    for (let i = 0; i < 3 && thrownFire === undefined; i++) {
      host.setLocalInput({ ...neutral, aimY: 6 / GL.lobRangeM, fire: true });
      host.update(FRAME_60HZ);
      const drained = host.drainEvents();
      events.push(...drained);
      if (drained.some((e) => e.type === "consumable.used")) thrownFire = host.world.inputs.get(LOCAL_PLAYER_ID)?.fire;
    }
    const thrown = events.filter((e): e is Extract<SimEvent, { type: "grenade.launched" }> => e.type === "grenade.launched" && (e.item ?? 0) > 0);
    expect(thrown).toHaveLength(1);
    const t = thrown[0]!;
    expect(Math.hypot(t.tx - t.x, t.ty - t.y)).toBeCloseTo(6, 6);
    expect(thrownFire).toBe(false); // the throw's step fired no launcher round
    expect(events.filter((e) => e.type === "grenade.launched" && !(e.item ?? 0))).toHaveLength(0);
    // the next step is the latest frame's input again (fire on, the launcher's aim)
    host.update(0.05);
    expect(host.world.inputs.get(LOCAL_PLAYER_ID)?.fire).toBe(true);
    expect(host.world.inputs.get(LOCAL_PLAYER_ID)?.aimY).toBeCloseTo(6 / GL.lobRangeM, 12);
  });

  it("clearEdges drops a swap latched before any step (the menu opened in the same step; 2.11 review)", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    const neutral = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false, viewTick: -1 };
    host.setLocalInput({ ...neutral, swap: true, consumable: true });
    host.setLocalInput(neutral);
    host.clearEdges();
    let edges = 0;
    for (let i = 0; i < 12; i++) {
      host.update(FRAME_60HZ);
      const inp = host.world.inputs.get("local");
      if (inp?.swap || inp?.consumable) edges++;
    }
    expect(host.world.tick).toBeGreaterThanOrEqual(3);
    expect(edges).toBe(0);
  });

  it("does not repeat a swap across catch-up steps after a long frame", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    let swaps = 0;
    host.world.events.subscribe(() => {});
    host.setLocalInput({ seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: true, consumable: false, isMouse: false, viewTick: -1 });
    // Count swaps seen per step by stepping one frame at a time after the long frame.
    host.update(0.05);
    if (host.world.inputs.get("local")?.swap) swaps++;
    host.update(0.25); // 5 catch-up steps with the same held input
    if (host.world.inputs.get("local")?.swap) swaps++;
    expect(swaps).toBe(1);
  });

  it("passes the local input to the world each step", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.setLocalInput({ seq: 7, moveX: 1, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false, viewTick: -1 });
    host.update(0.05);
    expect(host.world.inputs.get("local")?.moveX).toBe(1);
    expect(host.world.inputs.get("local")?.seq).toBe(1); // the host stamps one seq per step
  });
});

describe("LocalSimHost shop (Story 3.3)", () => {
  it("buyWeapon runs the shared rules at once and leaves one answer", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    const me = host.world.players.get(LOCAL_PLAYER_ID);
    if (!me) throw new Error("no player");
    host.buyWeapon("smg", null); // 100 < 200
    expect(host.takeShopAnswer()).toEqual({ ok: false, weapon: "smg", error: "insufficient_funds" });
    expect(host.takeShopAnswer()).toBeNull();
    me.wallet = 300;
    host.buyWeapon("smg", null);
    expect(host.takeShopAnswer()).toEqual({ ok: true, weapon: "smg", slot: 1 });
    expect(me.wallet).toBe(100);
    expect(me.loadout.slots[1]?.weapon).toBe("smg");
  });

  it("refused once the wave started", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    host.setBuildReady(true);
    host.update(0.05);
    expect(host.world.run.phase).toBe("wave");
    host.buyWeapon("pistol", 1);
    expect(host.takeShopAnswer()).toMatchObject({ ok: false, error: "not_build" });
  });
});
