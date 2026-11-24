import { describe, expect, it } from "vitest";
import { BUILD_GRID_M, DOWNTOWN_MAP, addBuildingAt, addPlayer, createWorld, gearBit, inFlashlightCone, flashlightOf, loadBalance, setForcedBlackout, startBuild, type World } from "@topdown/shared";
import { DarknessPlan, FlashLights, STAMP_CONE, STAMP_GLOW, TINT_FIRE, TINT_FLOOD, planDarkness, type DarknessInputs, type DrawnSurvivor } from "./darknessPlan";
import { BEAM_STRENGTH, GLOW_STRENGTH } from "./darknessPlan";
import { CUT_CONE, CUT_GLOW, GLOW_CORE_K, cutAt, softLayerHalves } from "./lightStamps";

/** Story 6.3 (T3): the stamp plan, pure (no Phaser). */
const balance = loadBalance();
const B = balance.decay.blackout;
const NO_WAVES = { waves: () => {} };

function setup(players: [string, number, number][] = [["me", 20, 16]]) {
  const w = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: NO_WAVES });
  for (const [id, x, y] of players) addPlayer(w, id, x, y);
  startBuild(w);
  setForcedBlackout(w, 5);
  return w;
}
const drawn = new Map<string, DrawnSurvivor>();
function inputs(over: Partial<DarknessInputs> = {}): DarknessInputs {
  return { localId: "me", drawnOf: (id) => drawn.get(id), flamingOf: () => "", molotovs: [], flashes: new FlashLights(8), nowS: 0, viewX: 0, viewY: 0, viewW: 48, viewH: 32, ...over };
}
function stamps(p: DarknessPlan) {
  return Array.from({ length: p.count }, (_, i) => ({ kind: p.kind[i], x: p.x[i] as number, y: p.y[i] as number, angle: p.angle[i] as number, r: p.radius[i] as number, cone: p.coneDeg[i], tint: p.tint[i], sparkle: p.sparkle[i] }));
}

describe("Story 6.3 darkness plan", () => {
  it("no stamps when the blackout is off (F9)", () => {
    const w = setup();
    setForcedBlackout(w, -1);
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs());
    expect(p.count).toBe(0);
    expect(p.candidates).toBe(0);
  });

  it("a standing survivor: the 1.6 m glow and the 60° 8 m cone along the drawn facing (a teammate's too)", () => {
    const w = setup([
      ["me", 20, 16],
      ["mate", 24, 16],
    ]);
    drawn.clear();
    drawn.set("mate", { x: 24.2, y: 16.1, facingX: 0, facingY: -1 });
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs());
    const s = stamps(p);
    const mate = s.filter((x) => Math.abs(x.x - 24.2) < 1e-4);
    expect(mate.map((x) => x.kind).sort()).toEqual([STAMP_CONE, STAMP_GLOW]);
    expect(mate.find((x) => x.kind === STAMP_GLOW)?.r).toBeCloseTo(1.6, 5);
    const cone = mate.find((x) => x.kind === STAMP_CONE);
    expect(cone?.angle).toBeCloseTo(-Math.PI / 2, 5); // up, as drawn (not the World's facing)
    expect([cone?.r, cone?.cone]).toEqual([8, 60]);
    expect(cone?.sparkle).toBe(1);
  });

  it("the Tactical flashlight: 80° 12 m; the cone drawn is the shape inFlashlightCone reports (F3)", () => {
    const w = setup();
    const me = w.players.get("me");
    if (!me) throw new Error("me");
    me.gear = gearBit(balance, "tactical_flashlight");
    drawn.clear();
    drawn.set("me", { x: 20, y: 16, facingX: 1, facingY: 0 });
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs());
    const cone = stamps(p).find((x) => x.kind === STAMP_CONE);
    expect([cone?.r, cone?.cone]).toEqual([12, 80]);
    const c = flashlightOf(balance, me.gear);
    expect(c.rangeM).toBe(cone?.r);
    expect(c.coneDeg).toBe(cone?.cone);
    expect(inFlashlightCone(20, 16, 1, 0, c, 20 + 11.9, 16)).toBe(true);
  });

  it("downed: the glow only, no flashlight (D3); out: nothing", () => {
    const w = setup([
      ["me", 20, 16],
      ["down", 26, 16],
      ["gone", 30, 16],
    ]);
    (w.players.get("down") as { status: string }).status = "downed";
    (w.players.get("gone") as { status: string }).status = "out";
    drawn.clear();
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs());
    const s = stamps(p);
    expect(s.filter((x) => x.x === 26).map((x) => x.kind)).toEqual([STAMP_GLOW]);
    expect(s.filter((x) => x.x === 30)).toEqual([]);
  });

  it("a floodlight lights 6 m in a blackout (with sparkles), a burning car 4 m (F7)", () => {
    const w = setup();
    addBuildingAt(w, { id: 900, type: "floodlight", ownerId: "me", gx: 22 / BUILD_GRID_M, gy: 12 / BUILD_GRID_M, rot: 0, hp: 150 });
    w.decay.fires.push({ index: 0, x: 30, y: 20, radiusM: 2 } as never);
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs());
    const s = stamps(p);
    const flood = s.find((x) => x.tint === TINT_FLOOD);
    expect(flood?.r).toBe(6);
    expect(flood?.sparkle).toBe(1);
    const fire = s.find((x) => x.tint === TINT_FIRE && x.x === 30);
    expect(fire?.r).toBe(4);
  });

  it("a muzzle flash lights 3 m and is gone after 0.1 s; a molotov zone lights its own radius", () => {
    const w = setup();
    const f = new FlashLights(8);
    f.add(21, 16, B.muzzleLightM, B.muzzleLightS, 10);
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs({ flashes: f, nowS: 10.05, molotovs: [{ x: 25, y: 18, radiusM: 3 }] }));
    let s = stamps(p);
    expect(s.find((x) => x.x === 21)?.r).toBe(3);
    expect(s.find((x) => x.x === 25)?.r).toBe(3);
    planDarkness(p, w, inputs({ flashes: f, nowS: 10.1001 }));
    s = stamps(p);
    expect(s.find((x) => x.x === 21)).toBeUndefined();
    expect(f.live(10.1001)).toBe(0);
  });

  it("at the cap my own glow and cone are always kept; the rest nearest the camera centre (Beat the rule 6)", () => {
    const w = setup();
    drawn.clear();
    drawn.set("me", { x: 46, y: 30, facingX: 1, facingY: 0 }); // far corner of the view
    const fl = new FlashLights(64);
    for (let i = 0; i < 60; i++) fl.add(10 + (i % 20), 8 + Math.floor(i / 20) * 4, 3, 1, 0);
    const p = new DarknessPlan(B.maxStamps);
    planDarkness(p, w, inputs({ flashes: fl, nowS: 0.5 }));
    expect(p.candidates).toBeGreaterThan(B.maxStamps);
    expect(p.count).toBe(B.maxStamps);
    const s = stamps(p);
    expect(s.filter((x) => x.x === 46 && x.y === 30).map((x) => x.kind).sort()).toEqual([STAMP_CONE, STAMP_GLOW]);
    // the kept flashes are the nearest to the view centre (24, 16)
    const d = (x: { x: number; y: number }) => Math.hypot(x.x - 24, x.y - 16);
    const kept = s.filter((x) => x.r === 3).map(d);
    const maxKept = Math.max(...kept);
    const all = Array.from({ length: 60 }, (_, i) => ({ x: 10 + (i % 20), y: 8 + Math.floor(i / 20) * 4 }));
    const dropped = all.filter((a) => !s.some((x) => x.r === 3 && Math.abs(x.x - a.x) < 1e-4 && Math.abs(x.y - a.y) < 1e-4)).map(d);
    expect(Math.min(...dropped)).toBeGreaterThanOrEqual(maxKept - 1e-6);
  });

  it("a light off the view is skipped; no allocation in the plan arrays across frames", () => {
    const w: World = setup();
    const f = new FlashLights(4);
    f.add(-20, -20, 3, 1, 0);
    const p = new DarknessPlan(B.maxStamps);
    const arr = p.x;
    planDarkness(p, w, inputs({ flashes: f, nowS: 0.1 }));
    expect(stamps(p).some((x) => x.x === -20)).toBe(false);
    planDarkness(p, w, inputs({ flashes: f, nowS: 0.2 }));
    expect(p.x).toBe(arr);
  });

  it("review L1/L2: the cut STRENGTH — a zombie touching you (Brute) is fully cut; a zombie in your beam at 7.9 m or exactly on the edge is near-fully cut", () => {
    const maxRz = Math.max(...Object.values(balance.zombies.types).map((t) => t.radiusM));
    const contact = (maxRz + balance.player.radiusM) / B.glowM;
    expect(contact).toBeLessThanOrEqual(GLOW_CORE_K);
    expect(cutAt(CUT_GLOW, contact) * GLOW_STRENGTH).toBeGreaterThanOrEqual(0.999);
    expect(cutAt(CUT_CONE, 7.9 / 8) * BEAM_STRENGTH).toBeGreaterThanOrEqual(0.8);
    // the soft wedges' innermost half-angle is exactly the cone's: inside the inFlashlightCone edge every layer cuts
    const half = Math.PI / 6;
    const layers = softLayerHalves(half);
    expect(Math.min(...layers)).toBeCloseTo(half, 12);
    expect(Math.max(...layers)).toBeGreaterThan(half);
  });
});
