import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, withOverrides, type RawBalanceFiles } from "./balance";
import weapons from "./balance/weapons.json" with { type: "json" };
import zombies from "./balance/zombies.json" with { type: "json" };
import waves from "./balance/waves.json" with { type: "json" };
import player from "./balance/player.json" with { type: "json" };
import controls from "./balance/controls.json" with { type: "json" };
import bots from "./balance/bots.json" with { type: "json" };
import buildings from "./balance/buildings.json" with { type: "json" };
import shop from "./balance/shop.json" with { type: "json" };
import decay from "./balance/decay.json" with { type: "json" };
import economy from "./balance/economy.json" with { type: "json" };

const raw = (): RawBalanceFiles => JSON.parse(JSON.stringify({ weapons, zombies, waves, player, controls, economy, bots, buildings, shop, decay })) as RawBalanceFiles;

describe("loadBalance", () => {
  it("loads the bundled files into a typed object", () => {
    const b = loadBalance();
    const pistol = b.weapons.pistol;
    expect(pistol?.kind).toBe("gun");
    expect(pistol?.damage).toBe(5);
    expect(b.zombies.types.walker?.hp).toBe(10);
    expect(b.waves.maxAlive).toBe(150);
  });

  it("applies schema defaults", () => {
    expect(loadBalance().weapons.pistol?.knockbackM).toBe(0);
  });

  it("shotgun and assault rifle match the GDD table (Story 5.3)", () => {
    const b = loadBalance();
    expect(b.weapons.shotgun).toMatchObject({ kind: "gun", damage: 4, pellets: 8, rateHz: 1.2, rangeM: 5, spreadDeg: 30, knockbackM: 0.5, hitPushbackM: 0, magazine: 6, reloadS: 2.5, price: 250, pierce: 1, projectileSpeedMps: 60 });
    expect(b.weapons.assault_rifle).toMatchObject({ kind: "gun", damage: 7, pellets: 1, rateHz: 8, rangeM: 11, spreadDeg: 4, magazine: 30, reloadS: 2.0, price: 450, pierce: 1, projectileSpeedMps: 60, hitPushbackM: 0.15, knockbackM: 0 });
    // Appended at the end: the wire's weapon indices of the older weapons never move.
    expect(Object.keys(b.weapons).slice(0, 4)).toEqual(["pistol", "smg", "hunting_rifle", "machete"]);
  });

  it("fire axe and chainsaw match the GDD table (Story 5.2)", () => {
    const b = loadBalance();
    expect(b.weapons.fire_axe).toMatchObject({ kind: "melee", name: "Fire Axe", damage: 30, rateHz: 1.1, rangeM: 2.2, arcDeg: 140, knockbackM: 1.5, hitPushbackM: 0, screenShake: true, price: 300, wielderSlowPct: 0, quietHits: false });
    expect(b.weapons.chainsaw).toMatchObject({ kind: "melee", name: "Chainsaw", damage: 6, rateHz: 10, rangeM: 1.5, arcDeg: 60, knockbackM: 0, hitPushbackM: 0.05, screenShake: false, price: 600, wielderSlowPct: 20, quietHits: true });
    expect(b.weapons.machete).toMatchObject({ knockbackM: 0, wielderSlowPct: 0, quietHits: false }); // unchanged
    // Appended after Round A's ids: the wire's weapon index of every older weapon stays.
    expect(Object.keys(b.weapons)).toEqual(["pistol", "smg", "hunting_rifle", "machete", "shotgun", "assault_rifle", "fire_axe", "chainsaw"]);
    expect(b.shop.weapons.slice(-2)).toEqual(["fire_axe", "chainsaw"]);
    for (const t of Object.values(b.zombies.types)) expect(t.knockbackTakenPct).toBe(100);
    expect(b.controls.fx).toMatchObject({ maxSwingArcs: 8, maxChainsawSparks: 32 });
  });

  it("refuses a fractional or too large wielderSlowPct and a fractional knockbackTakenPct (Story 5.2)", () => {
    const files = raw();
    ((files.weapons as Record<string, Record<string, number>>).chainsaw as Record<string, number>).wielderSlowPct = 20.5;
    expect(() => loadBalance(files)).toThrow(/weapons\.json: chainsaw\.wielderSlowPct/);
    ((files.weapons as Record<string, Record<string, number>>).chainsaw as Record<string, number>).wielderSlowPct = 95;
    expect(() => loadBalance(files)).toThrow(/weapons\.json: chainsaw\.wielderSlowPct/);
    const f2 = raw();
    ((f2.zombies as { types: Record<string, Record<string, number>> }).types.walker as Record<string, number>).knockbackTakenPct = 20.5;
    expect(() => loadBalance(f2)).toThrow(/zombies\.json: types\.walker\.knockbackTakenPct/);
  });

  it("pellets defaults to 1 for the old guns (Story 5.3)", () => {
    const b = loadBalance();
    for (const id of ["pistol", "smg", "hunting_rifle"]) expect((b.weapons[id] as { pellets: number }).pellets).toBe(1);
  });

  it("refuses pellets 0, pellets 17, and pellets 8 with hitPushbackM > 0 (Story 5.3)", () => {
    const set = (patch: Record<string, number>) => {
      const files = raw();
      Object.assign((files.weapons as Record<string, Record<string, number>>).shotgun as Record<string, number>, patch);
      return files;
    };
    expect(() => loadBalance(set({ pellets: 0 }))).toThrow(/weapons\.json: shotgun\.pellets/);
    expect(() => loadBalance(set({ pellets: 17 }))).toThrow(/weapons\.json: shotgun\.pellets/);
    expect(() => loadBalance(set({ hitPushbackM: 0.15 }))).toThrow(/weapons\.json: shotgun\.hitPushbackM: a pellet gun/);
    expect(() => loadBalance(set({ pellets: 1, hitPushbackM: 0.15 }))).not.toThrow();
  });

  it("names the file and key when a value is invalid", () => {
    const files = raw();
    (files.weapons as { pistol: { damage: number } }).pistol.damage = -5;
    expect(() => loadBalance(files)).toThrow(BalanceError);
    expect(() => loadBalance(files)).toThrow(/weapons\.json: pistol\.damage: /);
  });

  it("validates player and controls", () => {
    const b = loadBalance();
    expect(b.player.speedMps).toBe(4.5);
    expect(b.controls.moveDeadZone).toBe(0.1);
    const p = raw();
    (p.player as { radiusM: number }).radiusM = 0;
    expect(() => loadBalance(p)).toThrow(/player\.json: radiusM: /);
    const c = raw();
    (c.controls as { aimDeadZone: number }).aimDeadZone = 1.5;
    expect(() => loadBalance(c)).toThrow(/controls\.json: aimDeadZone: /);
  });

  it("rejects a run whose last wave overflows the per-type counts (3.10 review)", () => {
    const files = raw();
    (files.waves as { zombiesPerWave: number; runWaves: number }).zombiesPerWave = 300;
    (files.waves as { zombiesPerWave: number; runWaves: number }).runWaves = 255;
    expect(() => loadBalance(files)).toThrow(/waves\.json: the last wave would hold 76500 zombies/);
  });

  it("rejects unknown keys (typos fail loudly)", () => {
    const files = raw();
    (files.waves as Record<string, unknown>).maxAlve = 150;
    expect(() => loadBalance(files)).toThrow(/waves\.json/);
  });

  it("reports a missing file", () => {
    const files = raw() as Partial<RawBalanceFiles>;
    delete files.zombies;
    expect(() => loadBalance(files as RawBalanceFiles)).toThrow(/zombies\.json: file missing/);
  });

  it("has a version that is stable for equal data and changes with any number", () => {
    expect(loadBalance(raw()).version).toBe(loadBalance(raw()).version);
    expect(loadBalance().version).toMatch(/^[0-9a-f]{8}$/);
    const files = raw();
    (files.waves as { maxAlive: number }).maxAlive = 151;
    expect(loadBalance(files).version).not.toBe(loadBalance(raw()).version);
  });

  it("is deeply frozen", () => {
    const b = loadBalance();
    expect(Object.isFrozen(b)).toBe(true);
    expect(Object.isFrozen(b.weapons)).toBe(true);
    expect(Object.isFrozen(b.zombies.types.walker)).toBe(true);
  });

  it("applies overrides to a copy, ignores unknown keys, and still validates", () => {
    const base = bundledBalanceFiles();
    const tuned = loadBalance(withOverrides(base, [["controls", "aimDeadZone", 0.25], ["weapons", "machete.arcDeg", 130], ["weapons", "machete.nope", 1]]));
    expect(tuned.controls.aimDeadZone).toBe(0.25);
    expect(tuned.weapons.machete && "arcDeg" in tuned.weapons.machete ? tuned.weapons.machete.arcDeg : 0).toBe(130);
    expect((base.controls as { aimDeadZone: number }).aimDeadZone).toBe(0.3); // the input is untouched
    expect(() => loadBalance(withOverrides(base, [["controls", "aimDeadZone", 5]]))).toThrow(/controls\.json: aimDeadZone/);
  });
});


describe("Story 5.9: building tiers, traps and mines", () => {
  type T = Record<string, Record<string, unknown>>;
  const types = (files: RawBalanceFiles): T => (files.buildings as { types: T }).types;

  it("the ladder 40 → 90 → 160, 200 → 350 → 600", () => {
    const t = loadBalance().buildings.types;
    expect([t.wood_barricade?.price, t.reinforced_barricade?.price, t.metal_barricade?.price]).toEqual([40, 90, 160]);
    expect([t.wood_barricade?.hp, t.reinforced_barricade?.hp, t.metal_barricade?.hp]).toEqual([200, 350, 600]);
    expect(t.wood_barricade?.upgradesTo).toEqual({ type: "reinforced_barricade", price: 50 });
    expect(t.reinforced_barricade?.upgradesTo).toEqual({ type: "metal_barricade", price: 70 });
    expect(t.metal_barricade?.upgradesTo).toBeUndefined();
    expect(t.spike_trap?.trap).toEqual({ damagePerS: 4, pulseS: 0.5, slowPct: 40, wearPerHit: 1 });
    expect(t.mine?.mine).toEqual({ triggerRadiusM: 1, blastRadiusM: 2.5, damage: 80, playerShare: 0.5 });
    expect([t.spike_trap?.solid, t.mine?.solid]).toEqual([false, false]);
  });

  it("old types: solid, for sale, no trap/mine", () => {
    const t = loadBalance().buildings.types;
    for (const id of ["wood_barricade", "auto_turret"]) {
      expect(t[id]?.solid).toBe(true);
      expect(t[id]?.forSale).toBe(true);
      expect(t[id]?.trap).toBeUndefined();
      expect(t[id]?.mine).toBeUndefined();
    }
  });

  it("refuses an upgrade to an unknown/for-sale type, a footprint change, a cycle, a price that isn't the sum", () => {
    const bad = (edit: (t: T) => void, re: RegExp): void => {
      const files = raw();
      edit(types(files));
      expect(() => loadBalance(files)).toThrow(re);
    };
    bad((t) => ((t.wood_barricade as { upgradesTo: { type: string } }).upgradesTo.type = "nope"), /upgradesTo: unknown type nope/);
    bad((t) => ((t.wood_barricade as { upgradesTo: { type: string } }).upgradesTo.type = "auto_turret"), /auto_turret must be upgrade-only/);
    bad((t) => ((t.reinforced_barricade as { widthM: number }).widthM = 2.5), /must have the same footprint/);
    bad((t) => ((t.reinforced_barricade as { price: number }).price = 80), /price must be 40 \+ 50 = 90/);
    bad((t) => {
      (t.metal_barricade as Record<string, unknown>).upgradesTo = { type: "reinforced_barricade", price: 1 };
      (t.reinforced_barricade as { price: number }).price = 161; // keep the sums consistent-ish: the loop is what fails
    }, /upgrade ladder loops/);
    bad((t) => ((t.spike_trap as Record<string, unknown>).solid = true), /a trap or mine must be floor/);
    // Review L4: an upgrade keeps the building's kind (a barricade tier can't grow a turret).
    bad((t) => ((t.reinforced_barricade as Record<string, unknown>).turret = { ...(t.auto_turret as { turret: object }).turret }), /must be the same kind of building \(barricade, not turret\)/);
    bad((t) => ((t.spike_trap as Record<string, unknown>).mine = { triggerRadiusM: 1, blastRadiusM: 2, damage: 1, playerShare: 0 }), /exclude each other/);
    bad((t) => ((t.mine as Record<string, unknown>).upgradesTo = { type: "metal_barricade", price: 100 }), /a floor type can't upgrade/);
    bad((t) => ((t.spike_trap as { trap: { pulseS: number } }).trap.pulseS = 0.33), /whole number/);
    bad((t) => ((t.mine as { mine: { blastRadiusM: number } }).mine.blastRadiusM = 0.5), /at least triggerRadiusM/);
  });
});
