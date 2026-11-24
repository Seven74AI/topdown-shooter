import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, relocateBuilding, removeBuilding, startBuild, startWave, type Building } from "@topdown/shared";
import { PendingMoves } from "./pendingMove";
import { REFUSE_ANIM_MS } from "./pendingPlacements";

/** Story 5.22 (AC 13, D6): my moves in flight, matched by the World's spot, refused by id or after the timeout. */
const balance = loadBalance();
const box = { minX: 10, minY: 10, maxX: 12, maxY: 10.5 };

function setup() {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(world, "p0", 30, 16);
  startBuild(world);
  const p = world.players.get("p0");
  if (p) p.wallet = 1000;
  const r = placeBuilding(world, "p0", { type: "wood_barricade", gx: 40, gy: 20, rot: 0 });
  if (!r.ok) throw new Error(r.error);
  return { world, b: r.value as Building, pm: new PendingMoves() };
}

describe("PendingMoves (Story 5.22)", () => {
  it("waits until the World shows the building at the target, then goes (no toast)", () => {
    const { world, b, pm } = setup();
    expect(pm.add(b.id, 44, 24, 1, box, "build", world.waves.number)).toBe(1); // its seq
    expect([pm.waiting(b.id), pm.count]).toEqual([true, 1]);
    expect(pm.add(b.id, 46, 24, 1, box, "build", world.waves.number)).toBe(0); // one per building
    expect(pm.update(world, 0, 2000)).toBe(0);
    expect(pm.waiting(b.id)).toBe(true);
    relocateBuilding(world, b, 44, 24, 1);
    expect(pm.update(world, 16, 2000)).toBe(0);
    expect([pm.waiting(b.id), pm.entries.some((e) => e.live)]).toEqual([false, false]);
  });

  it("a refusal by id turns that box red (5.18 look), frees it after the animation; another building's box is untouched", () => {
    const { world, b, pm } = setup();
    const s1 = pm.add(b.id, 44, 24, 1, box, "build", world.waves.number);
    pm.add(99, 1, 1, 0, box, "build", world.waves.number);
    expect(pm.refuse(b.id, s1 + 7, 100)).toBe(false); // another move's seq
    expect(pm.refuse(b.id, s1, 100)).toBe(true);
    expect(pm.refuse(b.id, s1, 100)).toBe(false); // already answered
    const e = pm.entries.find((x) => x.id === b.id);
    expect([e?.live, e?.counted, e?.refusedMs]).toEqual([true, false, 100]);
    expect(pm.waiting(99)).toBe(true);
    pm.update(world, 100 + REFUSE_ANIM_MS, 2000);
    expect(pm.waiting(99)).toBe(false); // id 99 isn't in the World: gone, freed by the update
    expect(pm.entries.some((x) => x.live)).toBe(false);
  });

  it("no answer within the timeout (running time, capped per frame): red, and counted once for the toast; a hidden tab's long gap doesn't time out early", () => {
    const { world, b, pm } = setup();
    pm.update(world, 0, 2000);
    pm.add(b.id, 44, 24, 1, box, "build", world.waves.number);
    expect(pm.update(world, 60_000, 2000)).toBe(0); // one long gap = at most 250 ms of running time
    let t = 60_000;
    let timed = 0;
    for (let i = 0; i < 200 && timed === 0; i++) {
      t += 16;
      timed = pm.update(world, t, 2000);
    }
    expect(timed).toBe(1);
    expect(pm.waiting(b.id)).toBe(false);
    expect(pm.update(world, t + 16, 2000)).toBe(0); // never twice
  });

  it("a building that's gone (destroyed, sold) just ends its box; a new phase or wave clears everything", () => {
    const { world, b, pm } = setup();
    pm.add(b.id, 44, 24, 1, box, "build", world.waves.number);
    removeBuilding(world, b.id);
    pm.update(world, 0, 2000);
    expect(pm.count).toBe(0);
    const { world: w2, b: b2, pm: pm2 } = setup();
    pm2.add(b2.id, 44, 24, 1, box, "build", w2.waves.number);
    startWave(w2);
    expect(pm2.update(w2, 0, 2000)).toBe(0);
    expect(pm2.entries.some((e) => e.live)).toBe(false);
  });

  it("review L3: a late refusal of an older, timed-out move never shakes the newer move of the same building", () => {
    const { world, b, pm } = setup();
    pm.update(world, 0, 2000);
    const s1 = pm.add(b.id, 44, 24, 1, box, "build", world.waves.number);
    let t = 0;
    for (let i = 0; i < 200 && pm.waiting(b.id); i++) {
      t += 16;
      pm.update(world, t, 2000);
    }
    expect(pm.waiting(b.id)).toBe(false); // move 1 timed out
    const s2 = pm.add(b.id, 46, 24, 1, box, "build", world.waves.number);
    expect(s2).not.toBe(s1);
    expect(pm.refuse(b.id, s1, t + 16)).toBe(false); // move 1's refusal arrives late
    expect(pm.waiting(b.id)).toBe(true); // move 2 still waits
    expect(pm.refuse(b.id, s2, t + 32)).toBe(true);
  });

  it("review L4: a rotation-only move (same corner, new rot) waits until the World shows the new rotation", () => {
    const { world, b, pm } = setup();
    pm.add(b.id, b.gx, b.gy, 1, box, "build", world.waves.number);
    pm.update(world, 0, 2000);
    expect(pm.waiting(b.id)).toBe(true); // same gx / gy, still rot 0
    relocateBuilding(world, b, b.gx, b.gy, 1);
    pm.update(world, 16, 2000);
    expect(pm.waiting(b.id)).toBe(false);
  });

  it("re-review nit: the seq wraps 65535 → 1 (never 0, which means 'not sent')", () => {
    const { world, b, pm } = setup();
    (pm as unknown as { nextSeq: number }).nextSeq = 65535;
    expect(pm.add(b.id, 44, 24, 1, box, "build", world.waves.number)).toBe(65535);
    expect(pm.refuse(b.id, 65535, 0)).toBe(true);
    pm.update(world, REFUSE_ANIM_MS + 1, 2000);
    expect(pm.add(b.id, 46, 24, 1, box, "build", world.waves.number)).toBe(1);
  });
});
