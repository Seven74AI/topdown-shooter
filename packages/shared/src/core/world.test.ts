import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { NEUTRAL_INPUT } from "../net/input";
import { SYSTEM_ORDER, type SystemFn, type SystemName, type Systems } from "./systems";
import { createWorld, setInput, step } from "./world";

const balance = loadBalance();

describe("World", () => {
  it("advances the tick by 1 per step", () => {
    const world = createWorld({ balance, seed: 1 });
    expect(world.tick).toBe(0);
    step(world, TICK_DT_S);
    step(world, 0.05);
    expect(world.tick).toBe(2);
  });

  it("runs systems in the fixed architecture order", () => {
    const calls: SystemName[] = [];
    const systems = Object.fromEntries(
      SYSTEM_ORDER.map((name) => [name, (() => calls.push(name)) as SystemFn]),
    ) as Systems;
    const world = createWorld({ balance, seed: 1, systems });
    step(world, TICK_DT_S);
    expect(calls).toEqual([...SYSTEM_ORDER]);
    expect(SYSTEM_ORDER).toEqual([
      "input", "player", "buildings", "combat", "zombies", "boss",
      "waves", "specialEvents", "economy", "decayTimers",
    ]);
  });

  it("refuses a step size other than the fixed 50 ms", () => {
    const world = createWorld({ balance, seed: 1 });
    expect(() => step(world, 0.016)).toThrow(/fixed step/);
    expect(world.tick).toBe(0);
  });

  it("flushes events last, after every system has run", () => {
    const order: string[] = [];
    const world = createWorld({
      balance,
      seed: 1,
      systems: {
        combat: (w) => {
          order.push("combat");
          w.events.emit({ type: "test.ping", n: 1 });
        },
        decayTimers: (w) => {
          order.push("decayTimers");
          w.events.emit({ type: "test.ping", n: 2 });
        },
      },
    });
    world.events.subscribe((e) => order.push(`event:${e.type === "test.ping" ? e.n : "?"}`));
    step(world, TICK_DT_S);
    expect(order).toEqual(["combat", "decayTimers", "event:1", "event:2"]);
  });

  it("applies the latest input of each player for the tick", () => {
    const world = createWorld({ balance, seed: 1 });
    setInput(world, "local", { ...NEUTRAL_INPUT, seq: 1, moveX: 1 });
    setInput(world, "local", { ...NEUTRAL_INPUT, seq: 2, moveX: -1 });
    expect(world.inputs.size).toBe(0);
    step(world, TICK_DT_S);
    expect(world.inputs.get("local")?.seq).toBe(2);
    // A player who sends nothing keeps their last input.
    step(world, TICK_DT_S);
    expect(world.inputs.get("local")?.seq).toBe(2);
  });

  it("applies edge flags (swap, consumable) only once per input seq", () => {
    const world = createWorld({ balance, seed: 1 });
    setInput(world, "local", { ...NEUTRAL_INPUT, seq: 5, swap: true, consumable: true, moveX: 1 });
    step(world, TICK_DT_S);
    expect(world.inputs.get("local")?.swap).toBe(true);
    expect(world.inputs.get("local")?.consumable).toBe(true);
    step(world, TICK_DT_S); // same sample repeated (dropped packet): no second swap
    expect(world.inputs.get("local")?.swap).toBe(false);
    expect(world.inputs.get("local")?.consumable).toBe(false);
    expect(world.inputs.get("local")?.moveX).toBe(1); // continuous fields are kept
    setInput(world, "local", { ...NEUTRAL_INPUT, seq: 6, swap: true });
    step(world, TICK_DT_S);
    expect(world.inputs.get("local")?.swap).toBe(true);
  });

  it("stores the seed as uint32", () => {
    expect(createWorld({ balance, seed: -1 }).seed).toBe(4294967295);
  });
});
