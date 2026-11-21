import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "./player";

const balance = loadBalance();
const move = (moveX: number, moveY: number, extra: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  moveX,
  moveY,
  ...extra,
});

function setup(x = 24, y = 16) {
  const world = createWorld({ balance, seed: 1 });
  const p = addPlayer(world, "local", x, y);
  return { world, p };
}

const stepFor = (world: ReturnType<typeof setup>["world"], seconds: number) => {
  for (let i = 0; i < Math.round(seconds / TICK_DT_S); i++) step(world, TICK_DT_S);
};

describe("player movement", () => {
  it("creates players from balance", () => {
    const { p } = setup();
    expect(p.hp).toBe(100);
    expect(p.maxHp).toBe(100);
    expect(p.radiusM).toBe(0.4);
    expect(p.status).toBe("alive");
  });

  it("moves at 4.5 m/s with a full stick", () => {
    const { world, p } = setup();
    setInput(world, "local", move(1, 0));
    stepFor(world, 1);
    expect(p.x).toBeCloseTo(24 + 4.5, 6);
    expect(p.y).toBeCloseTo(16, 6);
  });

  it("scales speed linearly with the stick value", () => {
    const { world, p } = setup();
    setInput(world, "local", move(0, 0.5));
    stepFor(world, 1);
    expect(p.y).toBeCloseTo(16 + 2.25, 6);
  });

  it("does not move with a neutral stick (dead zone applied on the client)", () => {
    const { world, p } = setup();
    setInput(world, "local", move(0, 0));
    stepFor(world, 1);
    expect(p.x).toBe(24);
    expect(p.y).toBe(16);
  });

  it("clamps an over-long diagonal vector to full speed", () => {
    const { world, p } = setup();
    setInput(world, "local", move(1, 1));
    stepFor(world, 1);
    expect(Math.hypot(p.x - 24, p.y - 16)).toBeCloseTo(4.5, 6);
  });

  it("stops at every map edge, radius away from it", () => {
    const cases: [number, number, number, number][] = [
      [-1, 0, 0.4, 16],
      [1, 0, 47.6, 16],
      [0, -1, 24, 0.4],
      [0, 1, 24, 31.6],
    ];
    for (const [mx, my, ex, ey] of cases) {
      const { world, p } = setup();
      setInput(world, "local", move(mx, my));
      stepFor(world, 15);
      expect(p.x).toBeCloseTo(ex, 6);
      expect(p.y).toBeCloseTo(ey, 6);
    }
  });

  it("keeps the previous position for interpolation", () => {
    const { world, p } = setup();
    setInput(world, "local", move(1, 0));
    step(world, TICK_DT_S);
    const before = p.x;
    step(world, TICK_DT_S);
    expect(p.prevX).toBe(before);
    expect(p.x).toBeCloseTo(before + 4.5 * TICK_DT_S, 9);
  });

  it("faces the aim direction, or the move direction when not aiming", () => {
    const { world, p } = setup();
    setInput(world, "local", move(0, 1));
    step(world, TICK_DT_S);
    expect([p.facingX, p.facingY]).toEqual([0, 1]);
    setInput(world, "local", move(0, 1, { aimX: -0.5, aimY: 0 }));
    step(world, TICK_DT_S);
    expect([p.facingX, p.facingY]).toEqual([-1, 0]);
  });

  it("refuses a duplicate player id", () => {
    const { world } = setup();
    expect(() => addPlayer(world, "local", 1, 1)).toThrow();
  });
});
