import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import waves from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import { rebuildGrid } from "../core/spatialGrid";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { assistAim } from "./aimAssist";

const DEG = Math.PI / 180;
const O = { x: 10, y: 16 };

function exactBalance() {
  const w = JSON.parse(JSON.stringify(weapons));
  for (const k of Object.keys(w)) if (w[k].kind === "gun") w[k].spreadDeg = 0;
  return loadBalance({ weapons: w, zombies, waves, player, controls } as RawBalanceFiles);
}

function worldWith(...zs: [number, number][]) {
  const world = createWorld({ balance: exactBalance(), seed: 1 });
  const ids = zs.map(([x, y]) => spawnZombie(world, "walker", x, y));
  rebuildGrid(world.zombieGrid, world.zombies.aliveIds, world.zombies.aliveCount, world.zombies.x, world.zombies.y);
  return { world, ids };
}
const at = (deg: number, dist: number): [number, number] => [O.x + Math.cos(deg * DEG) * dist, O.y + Math.sin(deg * DEG) * dist];
const assist = (world: World, rangeM = 9) => {
  const out = { x: 0, y: 0 };
  const target = assistAim(world, O.x, O.y, 1, 0, rangeM, out);
  return { target, out };
};

describe("aim assist (FR4)", () => {
  it("turns the shot straight at a zombie 7.9° off the aim", () => {
    const { world, ids } = worldWith(at(7.9, 5));
    const { target, out } = assist(world);
    expect(target).toBe(ids[0]);
    expect(Math.atan2(out.y, out.x) / DEG).toBeCloseTo(7.9, 3);
  });

  it("leaves the aim unchanged for a zombie 8.1° off", () => {
    const { world } = worldWith(at(8.1, 5));
    const { target, out } = assist(world);
    expect(target).toBe(-1);
    expect(out).toEqual({ x: 1, y: 0 });
  });

  it("picks the nearer zombie by distance, even at a wider angle", () => {
    const { world, ids } = worldWith(at(1, 8), at(7, 4));
    expect(assist(world).target).toBe(ids[1]);
  });

  it("ignores zombies beyond range plus their radius, accepts those whose edge is in range", () => {
    expect(assist(worldWith(at(0, 9.36)).world).target).toBe(-1); // edge at 9.01 m
    expect(assist(worldWith(at(0, 9.3)).world).target).toBeGreaterThanOrEqual(0); // edge at 8.95 m
  });

  it("ignores dead zombies", () => {
    const { world, ids } = worldWith(at(3, 5));
    killZombie(world, ids[0] as number, null, "pistol");
    expect(assist(world).target).toBe(-1);
  });

  it("is applied by touch shots and not by mouse shots, through the full step", () => {
    const fired = (isMouse: boolean) => {
      const world = createWorld({ balance: exactBalance(), seed: 1 });
      addPlayer(world, "local", O.x, O.y).hp = 1e9;
      const [zx, zy] = at(6, 6);
      spawnZombie(world, "walker", zx, zy);
      const shots: SimEvent[] = [];
      world.events.subscribe((e) => e.type === "weapon.fired" && shots.push(e));
      setInput(world, "local", { ...NEUTRAL_INPUT, aimX: 1, aimY: 0, fire: true, isMouse });
      step(world, TICK_DT_S);
      const s = shots[0];
      return s?.type === "weapon.fired" ? Math.atan2(s.dirY, s.dirX) / DEG : NaN;
    };
    expect(fired(false)).toBeGreaterThan(5); // bent toward the zombie at ~6°
    expect(fired(true)).toBeCloseTo(0, 6); // mouse: straight
  });
});
