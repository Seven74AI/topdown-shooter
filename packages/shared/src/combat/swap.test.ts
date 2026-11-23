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
import shop from "../config/balance/shop.json" with { type: "json" };
import decay from "../config/balance/decay.json" with { type: "json" };
import combat from "../config/balance/combat.json" with { type: "json" };
import gear from "../config/balance/gear.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { activeSlot, setLoadout } from "./loadout";

/** These tests cover one mechanic: keep the wave director from spawning extra zombies. */
const NO_WAVES = { waves: () => {} };

function exactBalance() {
  const w = JSON.parse(JSON.stringify(weapons));
  for (const k of Object.keys(w)) if (w[k].kind === "gun") w[k].spreadDeg = 0;
  return loadBalance({ weapons: w, zombies, waves, player, controls, economy, bots, buildings, shop, decay, combat, gear } as RawBalanceFiles);
}

let seq = 0;
const input = (extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: ++seq, ...extra });

function setup(loadout: [string, string | null] = ["pistol", "smg"]) {
  const balance = exactBalance();
  const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
  const p = addPlayer(world, "local", 10, 16);
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

describe("two weapon slots and swap (FR5, FR12)", () => {
  it("sets a loadout with full magazines, slot 0 active", () => {
    const { p } = setup(["smg", "hunting_rifle"]);
    expect(p.loadout.slots[0]).toMatchObject({ weapon: "smg", ammo: 40 });
    expect(p.loadout.slots[1]).toMatchObject({ weapon: "hunting_rifle", ammo: 5 });
    expect(p.loadout.active).toBe(0);
  });

  it("swaps after exactly 0.3 s (6 ticks), firing neither weapon meanwhile", () => {
    const { world, p, events } = setup();
    setInput(world, "local", input({ swap: true, aimX: 1, fire: true }));
    step(world, TICK_DT_S); // swap starts this tick
    setInput(world, "local", input({ aimX: 1, fire: true }));
    run(world, 5);
    expect(p.loadout.active).toBe(0);
    expect(count(events, "weapon.fired")).toBe(0);
    step(world, TICK_DT_S);
    expect(p.loadout.active).toBe(1);
    expect(events.find((e) => e.type === "weapon.swapped")).toMatchObject({ active: 1, weapon: "smg" });
    expect(count(events, "weapon.fired")).toBe(1); // the SMG fires on the tick the swap ends
  });

  it("keeps ammo per slot across swaps", () => {
    const { world, p } = setup();
    activeSlot(p.loadout).ammo = 7;
    // A swap is the tap tick plus 6 ticks (0.3 s).
    setInput(world, "local", input({ swap: true }));
    run(world, 7);
    setInput(world, "local", input({ swap: true }));
    run(world, 7);
    expect(p.loadout.active).toBe(0);
    expect(activeSlot(p.loadout).ammo).toBe(7);
  });

  it("cancels a reload when swapping away, and restarts it in full on return", () => {
    const { world, p, events } = setup();
    activeSlot(p.loadout).ammo = 1;
    setInput(world, "local", input({ aimX: 1, fire: true }));
    step(world, TICK_DT_S); // last round → reload starts (20 ticks)
    run(world, 5);
    setInput(world, "local", input({ swap: true }));
    run(world, 7); // now on the SMG; the pistol reload was cancelled
    expect(p.loadout.active).toBe(1);
    expect(p.loadout.slots[0]?.reloadTicks).toBe(0);
    expect(p.loadout.slots[0]?.ammo).toBe(0);
    setInput(world, "local", input({ swap: true }));
    run(world, 7); // back on the empty pistol: a full reload starts on the swap's last tick
    expect(p.loadout.active).toBe(0);
    // The full 20-tick reload starts on the swap's last tick and counts from the next tick.
    expect(p.loadout.slots[0]?.reloadTicks).toBe(20);
    expect(count(events, "weapon.reload_started")).toBe(2);
  });

  it("ignores swap taps with one weapon or during a swap", () => {
    const one = setup(["pistol", null]);
    setInput(one.world, "local", input({ swap: true }));
    run(one.world, 10);
    expect(one.p.loadout.active).toBe(0);
    expect(count(one.events, "weapon.swap_started")).toBe(0);

    const two = setup();
    setInput(two.world, "local", input({ swap: true }));
    step(two.world, TICK_DT_S);
    setInput(two.world, "local", input({ swap: true })); // a second tap mid-swap
    run(two.world, 10);
    expect(two.p.loadout.active).toBe(1);
    expect(count(two.events, "weapon.swap_started")).toBe(1);
  });

  it("cancels a swap when the player dies", () => {
    const { world, p, events } = setup();
    setInput(world, "local", input({ swap: true }));
    step(world, TICK_DT_S);
    p.status = "downed";
    run(world, 10);
    expect(p.loadout.active).toBe(0);
    expect(p.loadout.swapTicks).toBe(0);
    expect(count(events, "weapon.swapped")).toBe(0);
  });

  it("keeps cooling down the weapon not in hand", () => {
    const { world, p } = setup(["hunting_rifle", "smg"]);
    setInput(world, "local", input({ aimX: 1, fire: true }));
    step(world, TICK_DT_S); // rifle shot: cooldown 1/1.2 s
    setInput(world, "local", input({ swap: true }));
    run(world, 20); // swap to the SMG and wait 1 s
    expect(p.loadout.slots[0]?.cooldownS).toBe(0);
  });

  it("fires the SMG at 12 shots/s, magazine 40", () => {
    const { world, events } = setup(["smg", null]);
    setInput(world, "local", input({ aimX: 1, fire: true }));
    run(world, 20);
    expect(count(events, "weapon.fired")).toBe(12);
  });

  it("Hunting Rifle pierces exactly 5 zombies in a line and kills them in one hit", () => {
    const { world, events } = setup(["hunting_rifle", null]);
    const ids = [12, 13, 14, 15, 16, 17].map((x) => spawnZombie(world, "walker", x, 16));
    setInput(world, "local", input({ aimX: 1, fire: true }));
    step(world, TICK_DT_S);
    setInput(world, "local", input());
    run(world, 3);
    const killed = events.filter((e) => e.type === "zombie.killed").map((e) => (e.type === "zombie.killed" ? e.zombieId : -1));
    expect(killed.sort()).toEqual(ids.slice(0, 5).sort());
    expect(world.zombies.hp[ids[5] as number]).toBe(10);
  });
});
