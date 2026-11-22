import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import waves from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import buildings from "../config/balance/buildings.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { DEG_TO_RAD } from "../math/vec";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { activeSlot, setLoadout } from "./loadout";
import { isMelee, weaponStats } from "./weapons";

/** These tests cover one mechanic: keep the wave director from spawning extra zombies. */
const NO_WAVES = { waves: () => {} };

const balance = loadBalance({ weapons, zombies, waves, player, controls, economy, bots, buildings } as RawBalanceFiles);
const machete = weaponStats(balance, "machete");
const walkerR = balance.zombies.types.walker?.radiusM ?? 0;

const PX = 10;
const PY = 16;
const aimRight = (extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, aimX: 1, aimY: 0, fire: true, ...extra });

function setup(loadout: [string, string | null] = ["machete", null]) {
  const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
  const p = addPlayer(world, "local", PX, PY);
  p.hp = 1e9;
  setLoadout(balance, p.loadout, loadout);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const count = (events: SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type).length;
/** Spawns a Walker at `deg` (0 = +x) and `dist` from the player's center. */
const walkerAt = (world: World, deg: number, dist: number) =>
  spawnZombie(world, "walker", PX + Math.cos(deg * DEG_TO_RAD) * dist, PY + Math.sin(deg * DEG_TO_RAD) * dist);
const hitIds = (events: SimEvent[]) => events.flatMap((e) => (e.type === "zombie.hit" ? [e.zombieId] : []));
const byNumber = (a: number, b: number) => a - b;

describe("Machete melee (FR14, FR19)", () => {
  it("uses the GDD balance (12 dmg, 2.5/s, 1.8 m, 110°)", () => {
    expect(isMelee(machete)).toBe(true);
    expect(machete).toMatchObject({ damage: 12, rateHz: 2.5, rangeM: 1.8, arcDeg: 110 });
  });

  it("swings on the first aimed tick, emits melee.swung and spawns no projectile", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "melee.swung")).toEqual([
      { type: "melee.swung", playerId: "local", weapon: "machete", x: PX, y: PY, dirX: 1, dirY: 0, arcDeg: 110, rangeM: 1.8 },
    ]);
    expect(count(events, "weapon.fired")).toBe(0);
    expect(world.projectiles.aliveCount).toBe(0);
  });

  it("measures reach to the zombie's edge (±0.01 m)", () => {
    const a = setup();
    const near = walkerAt(a.world, 0, machete.rangeM + walkerR - 0.01);
    setInput(a.world, "local", aimRight());
    step(a.world, TICK_DT_S);
    expect(hitIds(a.events)).toEqual([near]);

    const b = setup();
    walkerAt(b.world, 0, machete.rangeM + walkerR + 0.01);
    setInput(b.world, "local", aimRight());
    step(b.world, TICK_DT_S);
    expect(hitIds(b.events)).toEqual([]);
  });

  it("hits bodies crossing the arc edge, misses zombies outside and behind", () => {
    const { world, events } = setup();
    const at56 = walkerAt(world, 56, 1.5);
    const at60 = walkerAt(world, -60, 1.2); // body crosses the −55° edge
    walkerAt(world, 85, 1.2); // clearly outside
    walkerAt(world, 180, 1.0); // behind
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    expect(hitIds(events).sort(byNumber)).toEqual([at56, at60].sort(byNumber));
  });

  it("hits all 8 zombies in the arc with one swing, 12 damage each, pushing each away", () => {
    const { world, events } = setup();
    const ids: number[] = [];
    const before = new Map<number, [number, number]>();
    for (let i = 0; i < 8; i++) {
      const id = walkerAt(world, -50 + (100 / 7) * i, i % 2 === 0 ? 0.9 : 1.6);
      ids.push(id);
      before.set(id, [world.zombies.x[id] as number, world.zombies.y[id] as number]);
    }
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    const hits = events.flatMap((e) => (e.type === "zombie.hit" ? [e] : []));
    expect(count(events, "melee.swung")).toBe(1);
    expect(hits).toHaveLength(8);
    expect(hits.map((e) => e.zombieId).sort(byNumber)).toEqual([...ids].sort(byNumber));
    for (const e of hits) {
      expect(e.damage).toBe(12);
      const [x0, y0] = before.get(e.zombieId) ?? [0, 0];
      expect(Math.hypot(e.x - x0, e.y - y0)).toBeCloseTo(machete.hitPushbackM, 5);
      expect(Math.hypot(e.x - PX, e.y - PY)).toBeGreaterThan(Math.hypot(x0 - PX, y0 - PY));
    }
    // Walkers have 10 HP: every one dies, through the shared kill path.
    expect(count(events, "zombie.killed")).toBe(8);
  });

  it("damages a tougher zombie by exactly 12", () => {
    const { world } = setup();
    const id = walkerAt(world, 0, 1.0);
    world.zombies.hp[id] = 100;
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    expect(world.zombies.hp[id]).toBe(88);
  });

  it("swings 2.5 times per second: 5 swings in 2 s", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight());
    run(world, 40);
    expect(count(events, "melee.swung")).toBe(5);
  });

  it("keeps the exact 2.5/s rate over a long window (25 swings in 10 s)", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight());
    run(world, 200);
    expect(count(events, "melee.swung")).toBe(25);
  });

  it("does not let an idle player save up swings", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight({ fire: false }));
    run(world, 100);
    setInput(world, "local", aimRight());
    run(world, 8); // swing at the first tick, the next one 8 ticks later
    expect(count(events, "melee.swung")).toBe(1);
  });

  it("uses no ammo and never reloads", () => {
    const { world, p, events } = setup();
    const ammo = activeSlot(p.loadout).ammo;
    setInput(world, "local", aimRight());
    run(world, 200);
    expect(activeSlot(p.loadout).ammo).toBe(ammo);
    expect(activeSlot(p.loadout).reloadTicks).toBe(0);
    expect(count(events, "weapon.reload_started")).toBe(0);
  });

  it("does not swing below the dead zone (fire = false)", () => {
    const { world, events } = setup();
    walkerAt(world, 0, 1.0);
    setInput(world, "local", aimRight({ fire: false }));
    run(world, 40);
    expect(count(events, "melee.swung")).toBe(0);
    expect(count(events, "zombie.hit")).toBe(0);
  });

  it("swings along the raw stick direction on touch (no aim assist)", () => {
    const { world, events } = setup();
    // A zombie 6° off the aim, inside the 8° assist cone.
    const aimDeg = 53.13;
    walkerAt(world, aimDeg + 6, 1.2);
    setInput(world, "local", aimRight({ aimX: 0.3, aimY: 0.4, isMouse: false })); // partial deflection
    step(world, TICK_DT_S);
    const swing = events.find((e) => e.type === "melee.swung");
    if (swing?.type !== "melee.swung") throw new Error("no swing");
    expect(swing.dirX).toBeCloseTo(0.6, 9);
    expect(swing.dirY).toBeCloseTo(0.8, 9);
    expect(count(events, "zombie.hit")).toBe(1);
  });

  it("swings after a swap from a gun, and the gun keeps its magazine", () => {
    const { world, p, events } = setup(["pistol", "machete"]);
    setInput(world, "local", { ...NEUTRAL_INPUT, swap: true, seq: 1 });
    step(world, TICK_DT_S);
    setInput(world, "local", aimRight({ seq: 2 }));
    run(world, 10);
    expect(p.loadout.active).toBe(1);
    expect(count(events, "melee.swung")).toBeGreaterThan(0);
    expect(count(events, "weapon.fired")).toBe(0);
    expect(p.loadout.slots[0]?.ammo).toBe(12);
  });

  it("pushes a zombie standing exactly on the player's center along the aim (no NaN)", () => {
    const { world } = setup();
    const id = spawnZombie(world, "walker", PX, PY);
    world.zombies.hp[id] = 1000;
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    expect(Number.isFinite(world.zombies.x[id] as number)).toBe(true);
    expect(world.zombies.hp[id]).toBe(1000 - 12);
  });

  it("does not hit a zombie another player killed earlier the same tick", () => {
    const { world, events } = setup();
    const p2 = addPlayer(world, "p2", PX, PY + 0.2);
    p2.hp = 1e9;
    setLoadout(balance, p2.loadout, ["machete", null]);
    const id = walkerAt(world, 0, 1);
    setInput(world, "local", aimRight());
    setInput(world, "p2", aimRight());
    step(world, TICK_DT_S);
    expect(hitIds(events).filter((z) => z === id)).toHaveLength(1);
    expect(count(events, "zombie.killed")).toBe(1);
  });
});

