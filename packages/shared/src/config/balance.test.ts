import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, withOverrides, type RawBalanceFiles } from "./balance";
import { fxSchema } from "./balanceSchema";
import { MAX_FIXED_PER_WAVE } from "./constants";
import weapons from "./balance/weapons.json" with { type: "json" };
import zombies from "./balance/zombies.json" with { type: "json" };
import waves from "./balance/waves.json" with { type: "json" };
import player from "./balance/player.json" with { type: "json" };
import controls from "./balance/controls.json" with { type: "json" };
import bots from "./balance/bots.json" with { type: "json" };
import buildings from "./balance/buildings.json" with { type: "json" };
import shop from "./balance/shop.json" with { type: "json" };
import decay from "./balance/decay.json" with { type: "json" };
import combat from "./balance/combat.json" with { type: "json" };
import gear from "./balance/gear.json" with { type: "json" };
import consumables from "./balance/consumables.json" with { type: "json" };
import boss from "./balance/boss.json" with { type: "json" };
import eventsJson from "./balance/events.json" with { type: "json" };
import economy from "./balance/economy.json" with { type: "json" };

const raw = (): RawBalanceFiles => JSON.parse(JSON.stringify({ weapons, zombies, waves, player, controls, economy, bots, buildings, shop, decay, combat, gear, consumables, boss, events: eventsJson })) as RawBalanceFiles;

/** Story 5.18: the chain and pending numbers in controls.build. */
const CHAIN = { pendingTimeoutMs: 2000, chainSendGapMs: 250, chainMinStepM: 1, barQuietMs: 300 } as const;
/** Story 5.19: the thumb-drag numbers in controls.build. */
const DRAG = { dragGain: 1, dragStartPx: 8 } as const;

describe("loadBalance", () => {
  it("loads the bundled files into a typed object", () => {
    const b = loadBalance();
    const pistol = b.weapons.pistol;
    expect(pistol?.kind).toBe("gun");
    expect(pistol?.damage).toBe(6); // Epic 5 balance pass B3
    expect(b.zombies.types.walker?.hp).toBe(10);
    expect(b.waves.maxAlive).toBe(150);
  });

  it("applies schema defaults", () => {
    expect(loadBalance().weapons.pistol?.knockbackM).toBe(0);
  });

  it("shotgun and assault rifle match the GDD table (Story 5.3)", () => {
    const b = loadBalance();
    expect(b.weapons.shotgun).toMatchObject({ kind: "gun", damage: 5, pellets: 8, rateHz: 1.2, rangeM: 5, spreadDeg: 30, knockbackM: 0.5, hitPushbackM: 0, magazine: 6, reloadS: 2.5, price: 250, pierce: 1, projectileSpeedMps: 60 });
    expect(b.weapons.assault_rifle).toMatchObject({ kind: "gun", damage: 10, pellets: 1, rateHz: 6, rangeM: 11, spreadDeg: 4, magazine: 30, reloadS: 2.0, price: 450, pierce: 1, projectileSpeedMps: 60, hitPushbackM: 0.15, knockbackM: 0 });
    // Appended at the end: the wire's weapon indices of the older weapons never move.
    expect(Object.keys(b.weapons).slice(0, 4)).toEqual(["pistol", "smg", "hunting_rifle", "machete"]);
  });

  it("fire axe and chainsaw match the GDD table (Story 5.2)", () => {
    const b = loadBalance();
    expect(b.weapons.fire_axe).toMatchObject({ kind: "melee", name: "Fire Axe", damage: 30, rateHz: 1.4, rangeM: 2.2, arcDeg: 140, knockbackM: 1.5, hitPushbackM: 0, screenShake: true, price: 300, wielderSlowPct: 0, quietHits: false });
    expect(b.weapons.chainsaw).toMatchObject({ kind: "melee", name: "Chainsaw", damage: 6, rateHz: 10, rangeM: 1.5, arcDeg: 60, knockbackM: 0, hitPushbackM: 0.05, screenShake: false, price: 600, wielderSlowPct: 20, quietHits: true });
    expect(b.weapons.machete).toMatchObject({ knockbackM: 0, wielderSlowPct: 0, quietHits: false }); // unchanged
    // Appended after Round A's ids: the wire's weapon index of every older weapon stays.
    expect(Object.keys(b.weapons).slice(0, 8)).toEqual(["pistol", "smg", "hunting_rifle", "machete", "shotgun", "assault_rifle", "fire_axe", "chainsaw"]);
    for (const [id, t] of Object.entries(b.zombies.types)) expect(t.knockbackTakenPct, id).toBe(id === "brute" ? 20 : 100); // Story 5.7: the Brute takes 20 %
    expect(b.controls.fx).toMatchObject({ maxSwingArcs: 8, maxChainsawSparks: 32 });
  });

  it("Story 5.4: the two flame weapons (round C: fuel jet 6 m × 20° for 700, gas torch 3 m × 60° for 550) and combat.json", () => {
    const b = loadBalance();
    const same = { kind: "flame", damage: 20, rateHz: 20, fuelS: 6, reloadS: 3, pulseS: 0.25, playerPulseS: 0.5, igniteDamagePerS: 3, igniteS: 3, ignitePulseS: 0.5, hitPushbackM: 0, knockbackM: 0, screenShake: false };
    expect(b.weapons.flamethrower).toMatchObject({ ...same, name: "Flamethrower", rangeM: 6, coneDeg: 20, price: 700 });
    expect(b.weapons.gas_torch).toMatchObject({ ...same, name: "Gas torch", rangeM: 3, coneDeg: 60, price: 550 });
    // appended (older wire weapon indices stay); Story 5.13: sold as cards
    expect(Object.keys(b.weapons).slice(-3)).toEqual(["grenade_launcher", "flamethrower", "gas_torch"]); // after 5.5's
    expect(b.combat.friendlyFire).toEqual({ pct: 50, canDown: true });
    expect(b.combat.fx).toEqual({ maxFlameParticles: 96, flameParticlesPerS: 90, maxBurningZombieFx: 40 });
  });

  it("Story 5.4: refuses fractional pulse ticks, fuel past uint16, a non-whole friendly-fire pulse, a mine share apart from the FF rule", () => {
    const bad = (edit: (files: RawBalanceFiles) => void, msg: RegExp) => {
      const files = raw();
      edit(files);
      expect(() => loadBalance(files)).toThrow(msg);
    };
    const ft = (f: RawBalanceFiles) => (f.weapons as Record<string, Record<string, unknown>>).flamethrower as Record<string, unknown>;
    bad((f) => (ft(f).pulseS = 0.26), /whole numbers of ticks/);
    bad((f) => (ft(f).igniteS = 2.99), /whole numbers of ticks/);
    bad((f) => (ft(f).fuelS = 3300), /uint16/);
    bad((f) => (ft(f).rateHz = 10), /rateHz must be the tick rate/);
    bad((f) => (ft(f).damage = 21), /must be a whole number \(player HP is whole\)/); // 21 × 0.5 × 50 % = 5.25
    bad((f) => (((f.combat as Record<string, Record<string, unknown>>).friendlyFire as Record<string, unknown>).pct = 40), /playerShare 0.5 must equal/);
    bad((f) => delete (f as Record<string, unknown>).combat, /combat.json: file missing/);
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

  it("Story 5.7: the Brute matches the GDD; other types keep the new fields' defaults", () => {
    const b = loadBalance();
    expect(b.zombies.types.brute).toMatchObject({ hp: 120, speedMps: 1.0, damage: 35, attackIntervalS: 1.5, radiusM: 0.6, reward: 25, buildingDamageMult: 3, knockbackTakenPct: 20, hitKnockbackM: 1.5, knockbackS: 0.2, windupS: 0.5, swingReachM: 0.3, wideBody: true, gapReachM: 1.8, swingToleranceM: 0.01 });
    for (const id of ["walker", "crawler", "runner", "spitter"]) {
      expect(b.zombies.types[id], id).toMatchObject({ buildingDamageMult: 1, knockbackTakenPct: 100, hitKnockbackM: 0, windupS: 0, swingReachM: 0, wideBody: false });
    }
    expect(b.zombies.pathing.wideInflateM).toBe(0.25);
    expect(b.waves.fixed.slice(0, 6)).toEqual([{}, {}, {}, {}, { brute: 1 }, { brute: 1 }]); // Story 6.1 adds waves 7–10
    expect(b.waves.fixedAtFraction).toBe(0.25);
  });

  it("Story 6.1: the 10-wave run: runWaves 10, mix and two Brutes for waves 7–10, Brutes at 25 % and 65 %", () => {
    const w = loadBalance().waves;
    expect(w.runWaves).toBe(10);
    expect(w.mix.slice(6)).toEqual([
      { walker: 38, runner: 22, crawler: 15, spitter: 10, bloater: 15 },
      { walker: 35, runner: 24, crawler: 15, spitter: 11, bloater: 15 },
      { walker: 40, runner: 18, crawler: 17, spitter: 10, bloater: 15 },
      { walker: 38, runner: 22, crawler: 15, spitter: 10, bloater: 15 },
    ]);
    expect(w.fixed.slice(6)).toEqual([{ brute: 2 }, { brute: 2 }, { brute: 2 }, { brute: 2 }]);
    expect(w.fixedAtFractions).toEqual([0.25, 0.65]);
  });

  it("Story 6.1: fixedAtFractions validated (ascending, each in [0, 1), covers the biggest fixed entry; ≤ MAX_FIXED_PER_WAVE)", () => {
    const set = (fracs: unknown, fixed?: unknown) => {
      const files = raw();
      (files.waves as { fixedAtFractions: unknown }).fixedAtFractions = fracs;
      if (fixed !== undefined) (files.waves as { fixed: unknown }).fixed = fixed;
      return files;
    };
    expect(() => loadBalance(set([0.65, 0.25]))).toThrow(/waves\.json: fixedAtFractions.*ascending/);
    expect(() => loadBalance(set([0.25, 1]))).toThrow(/waves\.json: fixedAtFractions\.1/);
    expect(() => loadBalance(set([-0.1, 0.65]))).toThrow(/waves\.json: fixedAtFractions\.0/);
    expect(() => loadBalance(set([0.25]))).toThrow(/waves\.json: fixedAtFractions has 1 entries but a wave holds 2 fixed zombies/);
    expect(() => loadBalance(set([]))).not.toThrow(); // empty: fixedAtFraction for every fixed zombie (D-A)
    expect(() => loadBalance(set([0.25, 0.25]))).not.toThrow(); // equal points are allowed (both at once)
    expect(() => loadBalance(set([], [{}, { brute: 9 }]))).toThrow(/waves\.json: a fixed entry holds 9 zombies, more than the 8/);
    expect(() => loadBalance(set([], [{}, { brute: 8 }]))).not.toThrow();
    expect(MAX_FIXED_PER_WAVE).toBe(8);
  });

  it("Story 5.7: fixed counts are validated (known type, in ZOMBIE_TYPES, ≤ the smallest wave)", () => {
    const set = (fixed: unknown) => {
      const files = raw();
      (files.waves as { fixed: unknown }).fixed = fixed;
      return files;
    };
    expect(() => loadBalance(set([{ behemoth: 1 }]))).toThrow(/waves\.json: fixed\.0: unknown zombie type behemoth/);
    // Wave 1 solo = 40 × 0.35 = 14 zombies (Epic 5 balance pass B2).
    expect(() => loadBalance(set([{ brute: 15 }]))).toThrow(/waves\.json: fixed\.0: 15 fixed zombies exceed the smallest wave 1 \(14 solo\)/);
    expect(() => loadBalance(set([{ brute: 2 }, { brute: 2 }]))).not.toThrow(); // Story 6.1: ≤ MAX_FIXED_PER_WAVE and a fixedAtFractions point each
    expect(() => loadBalance(set([{ brute: -1 }]))).toThrow(/waves\.json: fixed\.0\.brute/);
  });

  it("Story 5.7: a wide body over the wide limit is refused, a non-wide body over 0.35 m too", () => {
    const set = (patch: Record<string, unknown>) => {
      const files = raw();
      Object.assign((files.zombies as { types: Record<string, Record<string, unknown>> }).types.brute as Record<string, unknown>, patch);
      return files;
    };
    expect(() => loadBalance(set({ radiusM: 0.61 }))).toThrow(/types\.brute: a wide body of 0\.61 m exceeds 0\.6 m/);
    expect(() => loadBalance(set({ wideBody: false }))).toThrow(/types\.brute: a zombie radius of 0\.6 m exceeds 0\.35 m/);
    expect(() => loadBalance(set({ radiusM: 0.6 }))).not.toThrow();
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

  it("Story 5.20: buildings.sellShare (0.5, defaults, bounded) and controls.build.undoWindowMs (10 s, bounded)", () => {
    expect(loadBalance().buildings.sellShare).toBe(0.5);
    const d = raw();
    delete (d.buildings as { sellShare?: unknown }).sellShare;
    expect(loadBalance(d).buildings.sellShare).toBe(0.5);
    const s = raw();
    (s.buildings as { sellShare: number }).sellShare = 1.5;
    expect(() => loadBalance(s)).toThrow(/sellShare/);
    const u = raw();
    (u.controls as { build: { undoWindowMs: number } }).build.undoWindowMs = 500;
    expect(() => loadBalance(u)).toThrow(/undoWindowMs/);
  });

  it("Story 5.21: controls.build.longPressMs (450) and longPressRingMs (150) load, default and are bounded", () => {
    const b = loadBalance().controls.build;
    expect(b.longPressMs).toBe(450);
    expect(b.longPressRingMs).toBe(150);
    const d = raw();
    delete (d.controls as { build: { longPressMs?: unknown } }).build.longPressMs;
    delete (d.controls as { build: { longPressRingMs?: unknown } }).build.longPressRingMs;
    expect(loadBalance(d).controls.build.longPressMs).toBe(450);
    expect(loadBalance(d).controls.build.longPressRingMs).toBe(150);
    const l = raw();
    (l.controls as { build: { longPressMs: number } }).build.longPressMs = 100; // shorter than a tap (300 ms)
    expect(() => loadBalance(l)).toThrow(/longPressMs/);
  });

  it("Story 5.15: controls.build (carry gap, snap and auto-rotate hysteresis) loads, defaults and is bounded", () => {
    expect(loadBalance().controls.build).toEqual({ carryGapM: 1, snapHysteresisM: 0.1, autoRotateHysteresisDeg: 10, reasonHoldMs: 250, ...CHAIN, ...DRAG, undoWindowMs: 10000, longPressMs: 450, longPressRingMs: 150 });
    const d = raw();
    delete (d.controls as { build?: unknown }).build;
    expect(loadBalance(d).controls.build).toEqual({ carryGapM: 1, snapHysteresisM: 0.1, autoRotateHysteresisDeg: 10, reasonHoldMs: 250, ...CHAIN, ...DRAG, undoWindowMs: 10000, longPressMs: 450, longPressRingMs: 150 });
    const h = raw();
    (h.controls as { build: { snapHysteresisM: number } }).build.snapHysteresisM = 0.25; // half a cell: the index would never settle
    expect(() => loadBalance(h)).toThrow(/controls\.json: build\.snapHysteresisM: /);
    const r = raw();
    (r.controls as { build: { autoRotateHysteresisDeg: number } }).build.autoRotateHysteresisDeg = 45;
    expect(() => loadBalance(r)).toThrow(/controls\.json: build\.autoRotateHysteresisDeg: /);
  });

  it("Story 5.17: controls.build.reasonHoldMs is 250, defaults when missing and is bounded", () => {
    expect(loadBalance().controls.build.reasonHoldMs).toBe(250);
    const d = raw();
    delete (d.controls as { build: { reasonHoldMs?: number } }).build.reasonHoldMs;
    expect(loadBalance(d).controls.build.reasonHoldMs).toBe(250);
    const h = raw();
    (h.controls as { build: { reasonHoldMs: number } }).build.reasonHoldMs = -1;
    expect(() => loadBalance(h)).toThrow(/controls\.json: build\.reasonHoldMs: /);
    const l = raw();
    (l.controls as { build: { reasonHoldMs: number } }).build.reasonHoldMs = 2001;
    expect(() => loadBalance(l)).toThrow(/controls\.json: build\.reasonHoldMs: /);
  });

  it("Story 5.18: controls.build chain/pending numbers (timeout 2 s, send gap 250 ms, step 1 m) default each and are bounded", () => {
    expect(loadBalance().controls.build).toMatchObject(CHAIN);
    for (const k of Object.keys(CHAIN) as (keyof typeof CHAIN)[]) {
      const d = raw();
      delete (d.controls as { build: Record<string, unknown> }).build[k];
      expect(loadBalance(d).controls.build[k]).toBe(CHAIN[k]);
    }
    for (const [k, bad] of [["pendingTimeoutMs", 100], ["pendingTimeoutMs", 10001], ["chainSendGapMs", 149], ["barQuietMs", 2001], ["chainMinStepM", 0.4]] as const) {
      const d = raw();
      (d.controls as { build: Record<string, unknown> }).build[k] = bad;
      expect(() => loadBalance(d)).toThrow(new RegExp(`controls\\.json: build\\.${k}: `));
    }
  });

  it("Story 5.19: controls.build drag numbers (gain 1.0, start 8 px) default each and are bounded; 5.18's walk-away distance is gone", () => {
    expect(loadBalance().controls.build).toMatchObject(DRAG);
    expect("chainUnpinWalkM" in loadBalance().controls.build).toBe(false);
    for (const k of Object.keys(DRAG) as (keyof typeof DRAG)[]) {
      const d = raw();
      delete (d.controls as { build: Record<string, unknown> }).build[k];
      expect(loadBalance(d).controls.build[k]).toBe(DRAG[k]);
    }
    for (const [k, bad] of [["dragGain", 0.2], ["dragGain", 3.5], ["dragStartPx", 1], ["dragStartPx", 41], ["dragStartPx", 8.5], ["chainUnpinWalkM", 2]] as const) {
      const d = raw();
      (d.controls as { build: Record<string, unknown> }).build[k] = bad;
      expect(() => loadBalance(d), `${k} = ${bad}`).toThrow(/controls\.json: build/);
    }
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

  it("Story 5.23: the placement-feel pool caps (dust, owner tabs) load and default to the JSON's values", () => {
    expect(controls.fx).toMatchObject({ maxPlaceDust: 64, maxOwnerTabs: 12 });
    const fxWithout: Record<string, unknown> = { ...controls.fx };
    delete fxWithout.maxPlaceDust;
    delete fxWithout.maxOwnerTabs;
    expect(fxSchema.parse(fxWithout)).toMatchObject({ maxPlaceDust: 64, maxOwnerTabs: 12 });
    expect(() => fxSchema.parse({ ...controls.fx, maxPlaceDust: 4 })).toThrow();
  });

  it("Story 5.10 building blocks: light/heal validate; two behaviour blocks refused; inShop defaults true", () => {
    const t = loadBalance().buildings.types;
    expect(t.floodlight).toMatchObject({ inShop: true, forSale: true, solid: true, stopsBullets: false, light: { radiusM: 4, blackoutRadiusM: 6 } });
    expect(t.med_station).toMatchObject({ inShop: true, solid: true, stopsBullets: false, heal: { radiusM: 2, hpPerS: 5 } });
    // 5.10 review: the schema default of the pool-sharing distance matches controls.json (4 m).
    const fxWithout: Record<string, unknown> = { ...controls.fx };
    delete fxWithout.floodLightMergeM;
    expect(fxSchema.parse(fxWithout).floodLightMergeM).toBe(4);
    for (const id of ["wood_barricade", "auto_turret", "spike_trap", "mine"]) expect(t[id]?.inShop, id).toBe(true);
    // The new types are appended (the wire index of every older type stays).
    expect(Object.keys(t).slice(-3)).toEqual(["floodlight", "med_station", "bear_trap"]); // Story 5.14 appends after 5.10
    const bad = (edit: (t: T) => void, re: RegExp): void => {
      const files = raw();
      edit(types(files));
      expect(() => loadBalance(files)).toThrow(re);
    };
    bad((t) => ((t.floodlight as Record<string, unknown>).heal = { radiusM: 2, hpPerS: 5 }), /exclude each other/);
    bad((t) => ((t.med_station as Record<string, unknown>).turret = { ...(t.auto_turret as { turret: object }).turret }), /exclude each other/);
    bad((t) => ((t.floodlight as { light: { radiusM: number } }).light.radiusM = 0), /radiusM/);
    bad((t) => ((t.floodlight as { light: { radiusM: number } }).light.radiusM = 17), /radiusM/);
    bad((t) => ((t.floodlight as { light: { blackoutRadiusM: number } }).light.blackoutRadiusM = 3), /blackoutRadiusM must be at least radiusM/);
    bad((t) => ((t.floodlight as { light: Record<string, unknown> }).light.extra = 1), /extra|Unrecognized/i);
    bad((t) => ((t.med_station as { heal: { hpPerS: number } }).heal.hpPerS = 0), /hpPerS/);
    bad((t) => ((t.med_station as { heal: { radiusM: number } }).heal.radiusM = 9), /radiusM/);
    bad((t) => ((t.med_station as Record<string, unknown>).inShop = "yes"), /inShop/);
  });

  it("Story 5.14 bear trap block: whole ticks, floor only, plate inside the footprint, exclusive; trapHoldPct 1–100", () => {
    const bad = (edit: (t: T) => void, re: RegExp): void => {
      const files = raw();
      edit(types(files));
      expect(() => loadBalance(files)).toThrow(re);
    };
    type B = { bearTrap: Record<string, number> };
    bad((t) => ((t.bear_trap as B).bearTrap.holdS = 3.01), /whole numbers of ticks/);
    bad((t) => ((t.bear_trap as B).bearTrap.rearmS = 0.33), /whole numbers of ticks/);
    bad((t) => ((t.bear_trap as B).bearTrap.wearPerCatch = 2.5), /wearPerCatch/);
    bad((t) => ((t.bear_trap as B).bearTrap.plateRadiusM = 0.6), /plateRadiusM must fit inside the footprint/);
    bad((t) => ((t.bear_trap as Record<string, unknown>).solid = true), /must be floor/);
    bad((t) => ((t.bear_trap as Record<string, unknown>).mine = { ...(t.mine as { mine: object }).mine }), /exclude each other/);
    const z = raw();
    ((z.zombies as { types: Record<string, Record<string, unknown>> }).types.brute as Record<string, unknown>).trapHoldPct = 0;
    expect(() => loadBalance(z)).toThrow(/trapHoldPct/);
  });
});

describe("Story 5.1: weapon upgrades", () => {
  it("upgrades block is validated", () => {
    expect(loadBalance().shop.upgrades).toEqual({ maxLevel: 4, damagePerLevel: 0.25, priceShare: 0.6 });
    const bad = (patch: Record<string, unknown>, re: RegExp): void => {
      const files = raw();
      Object.assign((files.shop as { upgrades: Record<string, unknown> }).upgrades, patch);
      expect(() => loadBalance(files)).toThrow(re);
    };
    bad({ maxLevel: 0 }, /shop\.json: upgrades\.maxLevel/);
    bad({ maxLevel: 5 }, /shop\.json: upgrades\.maxLevel/); // review L1: I–IV is the design
    bad({ maxLevel: 16 }, /shop\.json: upgrades\.maxLevel/);
    bad({ maxLevel: 2.5 }, /shop\.json: upgrades\.maxLevel/);
    bad({ damagePerLevel: -0.1 }, /shop\.json: upgrades\.damagePerLevel/);
    bad({ priceShare: 0 }, /shop\.json: upgrades\.priceShare/);
    bad({ extra: 1 }, /shop\.json: upgrades/);
    const files = raw();
    delete (files.shop as { upgrades?: unknown }).upgrades;
    expect(() => loadBalance(files)).toThrow(/shop\.json: upgrades/);
  });

  it("pistol upgrade base is 100", () => {
    const b = loadBalance();
    expect(b.weapons.pistol?.upgradeBasePrice).toBe(100);
    expect(b.weapons.pistol?.price).toBe(0);
    for (const id of Object.keys(b.weapons)) if (id !== "pistol") expect(b.weapons[id]?.upgradeBasePrice).toBeUndefined();
  });

  it("every weapon has a non-zero upgrade price", () => {
    const files = raw();
    delete (files.weapons as { pistol: { upgradeBasePrice?: number } }).pistol.upgradeBasePrice;
    expect(() => loadBalance(files)).toThrow(/weapons\.json: pistol: its upgrade price is 0/);
    const neg = raw();
    (neg.weapons as { pistol: { upgradeBasePrice: number } }).pistol.upgradeBasePrice = -1;
    expect(() => loadBalance(neg)).toThrow(/weapons\.json: pistol\.upgradeBasePrice/);
  });
});

describe("Story 5.5: the Grenade Launcher and combat.json", () => {
  type Raw = { weapons: Record<string, Record<string, unknown>>; combat: { friendlyFire: Record<string, unknown>; explosion: Record<string, unknown> }; buildings: { types: Record<string, { mine?: Record<string, unknown> }> } };
  const bad = (edit: (f: Raw) => void, re: RegExp): void => {
    const files = raw();
    edit(files as unknown as Raw);
    expect(() => loadBalance(files)).toThrow(re);
  };
  it("loads the launcher (GDD numbers) and the explosion block", () => {
    const b = loadBalance();
    expect(b.weapons.grenade_launcher).toMatchObject({ kind: "launcher", damage: 40, rateHz: 0.8, lobRangeM: 12, minLobM: 3, lobSpeedMps: 20, blastRadiusM: 2.5, blastPushM: 0.6, blastBuildingDamage: 0, magazine: 4, reloadS: 3, price: 700 });
    expect(b.combat).toMatchObject({ friendlyFire: { pct: 50, canDown: true }, explosion: { maxLiveRounds: 32, faceBackoffM: 0.05 } });
  });
  it("refuses minLobM ≥ lobRangeM, rangeM ≠ lobRangeM, a flight over 255 ticks, a pool over 255, a mine share apart from the friendly-fire rule", () => {
    bad((f) => ((f.weapons.grenade_launcher as Record<string, unknown>).minLobM = 12), /minLobM must be below lobRangeM/);
    bad((f) => ((f.weapons.grenade_launcher as Record<string, unknown>).rangeM = 10), /must equal lobRangeM/);
    bad((f) => ((f.weapons.grenade_launcher as Record<string, unknown>).lobSpeedMps = 0.5), /255 ticks/);
    bad((f) => (f.combat.explosion.maxLiveRounds = 256), /maxLiveRounds/);
    bad((f) => ((f.buildings.types.mine?.mine as Record<string, unknown>).playerShare = 0.4), /friendlyFire\.pct/);
    bad((f) => ((f.weapons.grenade_launcher as Record<string, unknown>).spreadDeg = 5), /spreadDeg/);
  });
});

describe("gear.json (Story 5.11)", () => {
  it("gear validates; > 8 items refused; unknown fields refused; armor needs both numbers", () => {
    const b = loadBalance(raw());
    expect(Object.keys(b.gear.items)).toHaveLength(5);
    expect(b.gear.items.tactical_flashlight).toMatchObject({ inShop: true, coneDeg: 80, rangeM: 12 }); // Story 6.3 (D8)
    expect(b.gear.items.body_armor_1?.inShop).toBe(true);
    const many = raw();
    const items = (many.gear as { items: Record<string, unknown> }).items;
    for (let i = 0; i < 4; i++) items[`extra_${i}`] = { name: "X", price: 1 };
    expect(() => loadBalance(many)).toThrow(/at most 8 gear items/);
    const odd = raw();
    ((odd.gear as { items: Record<string, Record<string, unknown>> }).items.running_shoes as Record<string, unknown>).jump = 2;
    expect(() => loadBalance(odd)).toThrow(/gear\.json: items\.running_shoes/);
    const frac = raw();
    ((frac.gear as { items: Record<string, Record<string, unknown>> }).items.running_shoes as Record<string, unknown>).speedBonusPct = 10.5;
    expect(() => loadBalance(frac)).toThrow(/gear\.json/);
    const half = raw();
    delete ((half.gear as { items: Record<string, Record<string, unknown>> }).items.body_armor_1 as Record<string, unknown>).armorTier;
    expect(() => loadBalance(half)).toThrow(/maxHpBonus and armorTier/);
    // re-review: reviveS must fit the synced uint8 reviveNeed (255 ticks = 12.75 s)
    const slowKit = raw();
    ((slowKit.gear as { items: Record<string, Record<string, unknown>> }).items.revive_kit as Record<string, unknown>).reviveS = 13;
    expect(() => loadBalance(slowKit)).toThrow(/gear\.json: items\.revive_kit\.reviveS/);
    const slowPlayer = raw();
    (slowPlayer.player as Record<string, unknown>).reviveS = 13;
    expect(() => loadBalance(slowPlayer)).toThrow(/player\.json: reviveS/);
    ((slowKit.gear as { items: Record<string, Record<string, unknown>> }).items.revive_kit as Record<string, unknown>).reviveS = 12.75;
    expect(() => loadBalance(slowKit)).not.toThrow();
  });
});


describe("consumables.json (Story 5.12)", () => {
  type Items = { items: Record<string, Record<string, unknown>> };
  it("consumables validate; fractional tick durations refused; > 8 items refused; a throwable needs its numbers", () => {
    const b = loadBalance(raw());
    expect(Object.keys(b.consumables.items)).toEqual(["medkit", "grenades", "molotovs"]);
    expect(b.consumables.useCooldownS).toBe(0.5);
    expect(b.consumables.items.grenades).toMatchObject({ price: 80, pack: 3, damage: 40, radiusM: 2.5, throwRangeM: 8, minThrowM: 2 });
    expect(b.consumables.items.molotovs).toMatchObject({ price: 100, pack: 2, radiusM: 3, durationS: 4, damagePerS: 8, pulseS: 0.5 });
    expect(b.consumables.items.medkit).toMatchObject({ price: 60, pack: 1, healHp: 50 });
    const frac = raw();
    ((frac.consumables as Items).items.molotovs as Record<string, unknown>).durationS = 4.01;
    expect(() => loadBalance(frac)).toThrow(/durationS must be a whole number of ticks/);
    const fracPulse = raw();
    ((fracPulse.consumables as Items).items.molotovs as Record<string, unknown>).pulseS = 0.33;
    expect(() => loadBalance(fracPulse)).toThrow(/pulseS must be a whole number of ticks/);
    const odd = raw();
    ((odd.consumables as Items).items.molotovs as Record<string, unknown>).damagePerS = 6; // 3 per pulse: no whole half
    expect(() => loadBalance(odd)).toThrow(/even whole number/);
    const cd = raw();
    (cd.consumables as Record<string, unknown>).useCooldownS = 0.52;
    expect(() => loadBalance(cd)).toThrow(/useCooldownS/);
    const many = raw();
    for (let i = 0; i < 6; i++) (many.consumables as Items).items[`extra_${i}`] = { name: "X", price: 1, pack: 1, kind: "heal", healHp: 1 };
    expect(() => loadBalance(many)).toThrow(/1–8 consumables/);
    const noRange = raw();
    delete ((noRange.consumables as Items).items.grenades as Record<string, unknown>).throwRangeM;
    expect(() => loadBalance(noRange)).toThrow(/a throwable needs/);
    const noHeal = raw();
    delete ((noHeal.consumables as Items).items.medkit as Record<string, unknown>).healHp;
    expect(() => loadBalance(noHeal)).toThrow(/a heal item needs healHp/);
  });
});

describe("Story 5.13: shop.json (card shop)", () => {
  it("shop.json: floor and tiers validated", () => {
    const b = loadBalance();
    expect(b.shop).toMatchObject({ cards: 6, floor: { weapon: 1, gear: 1 }, reroll: { price: 20, stepPerReroll: 0 }, priceScalePerBuild: 0, excludeFromCards: ["pistol"] });
    expect(b.shop.rarity.map((t) => [t.id, t.maxPrice, t.weight])).toEqual([
      ["common", 250, 3],
      ["rare", 500, 2],
      ["epic", null, 1],
    ]);
    const bad = (edit: (shop: Record<string, unknown>) => void): void => {
      const files = bundledBalanceFiles();
      edit(files.shop as Record<string, unknown>);
      expect(() => loadBalance(files)).toThrow(BalanceError);
    };
    bad((s) => (s.floor = { weapon: 4, gear: 3 })); // floor sum > cards
    bad((s) => (s.cards = 7));
    bad((s) => (s.rarity = [{ id: "a", maxPrice: 500, weight: 1 }, { id: "b", maxPrice: 250, weight: 1 }, { id: "c", maxPrice: null, weight: 1 }])); // not ascending
    bad((s) => (s.rarity = [{ id: "a", maxPrice: null, weight: 1 }, { id: "b", maxPrice: null, weight: 1 }])); // null not last only
    bad((s) => (s.rarity = [{ id: "a", maxPrice: null, weight: 0 }])); // weight > 0
    bad((s) => (s.weapons = ["pistol"])); // the 3.3 list is gone (strict)
  });

  it("an unknown excluded id is refused", () => {
    const files = bundledBalanceFiles();
    (files.shop as { excludeFromCards: string[] }).excludeFromCards.push("rocket");
    expect(() => loadBalance(files)).toThrow(/shop\.json: excludeFromCards\.1: unknown item rocket/);
  });
});

describe("Story 6.5 review L-e: boss.json cross-checks", () => {
  it("threatWindowS must match the threat ring (5 s): 6 is refused", () => {
    const r = raw();
    (r.boss as { target: { threatWindowS: number } }).target.threatWindowS = 6;
    expect(() => loadBalance(r)).toThrow(/boss\.json: target\.threatWindowS 6 must be 5/);
  });
});

describe("Stories 6.6 + 6.7: boss.json charge, throw, enrage, killPay (AC 1)", () => {
  it("the designer's numbers (D9 / D7, 6.7 D7)", () => {
    const b = loadBalance().boss;
    expect(b.charge).toMatchObject({ minM: 5, maxM: 12, minLaneM: 4, distM: 10, telegraphS: 1.0, speedMps: 12, laneWidthM: 4.8, damage: 30, shoveM: 2.5, shoveS: 0.2, zombieDamage: 30, recoverS: 1.0, cooldownS: 7, initialCooldownS: 2, stunS: 2, stunDamageMult: 1.5, sweepStepM: 0.1 });
    expect(b.throw).toMatchObject({ minM: 8, unreachableMinM: 4.5, liftS: 1.0, flightS: 0.8, radiusM: 3, damage: 35, zombieDamage: 35, recoverS: 0.6, cooldownS: 6, initialCooldownS: 3, sourceRangeM: 6 });
    expect(b.enrage).toMatchObject({ atHpFrac: 0.5, roarS: 1.5, roarRadiusM: 5, roarPushM: 1.5, speedMult: 1.3, cooldownMult: 0.7, gapMult: 0.7, crawlerEveryS: [8, 6, 5, 4], firstCrawlerS: 1.0, crawlerBehindM: 2.4, crawlerPlayerClearM: 1.5 });
    expect(b.killPay).toBe(150);
    expect(b.death.collapseS).toBe(1.5);
  });

  it("cross-checks: the lane's half-width beyond the grace, minLaneM ≤ distM, one Crawler interval per player count, whole ticks", () => {
    const a = raw();
    (a.boss as { charge: { laneWidthM: number } }).charge.laneWidthM = 0.5;
    expect(() => loadBalance(a)).toThrow(/charge\.laneWidthM \/ 2 must exceed edgeGraceM/);
    const b = raw();
    (b.boss as { charge: { minLaneM: number } }).charge.minLaneM = 11;
    expect(() => loadBalance(b)).toThrow(/charge\.minLaneM 11 exceeds distM 10/);
    const c = raw();
    (c.boss as { enrage: { crawlerEveryS: number[] } }).enrage.crawlerEveryS = [8, 6, 5];
    expect(() => loadBalance(c)).toThrow(/crawlerEveryS needs 4 entries/);
    const d = raw();
    (d.boss as { throw: { liftS: number } }).throw.liftS = 1.01;
    expect(() => loadBalance(d)).toThrow(/throw\.liftS must be whole ticks/);
    const e = raw();
    (e.boss as { enrage: { atHpFrac: number } }).enrage.atHpFrac = 1;
    expect(() => loadBalance(e)).toThrow();
    // Review L2: no other knock may share the charge shove's mm per tick (the Predictor's 6 m slide is keyed on it).
    const f = raw();
    (f.boss as { slam: { pushM: number } }).slam.pushM = 2.5; // 2.5 m over 4 ticks = 625 mm, the charge's step
    expect(() => loadBalance(f)).toThrow(/charge shove step 625 mm\/tick equals the slam push step/);
  });
});

describe("Story 6.8: events.json", () => {
  it("loads the starting values (2 per run in waves 3, 4, 6, 7, 8; 20–60 %; alarm 20 s + 15 s at 15 m; stampede 3 s + 10 s)", () => {
    const e = loadBalance().events;
    expect(e.perRun).toBe(2);
    expect(e.waves).toEqual([3, 4, 6, 7, 8]);
    expect([e.startFractionMin, e.startFractionMax]).toEqual([0.2, 0.6]);
    expect(e.carAlarm).toMatchObject({ armedS: 20, alarmS: 15, pullRadiusM: 15, distractBreakM: 2, pickMinM: 8, pickMaxM: 25 });
    expect(e.stampede).toMatchObject({ warningS: 3, runS: 10, laneWidthM: 8, speedMps: 5, contactDamage: 8, countByPlayers: [12, 18, 24, 30], overCap: 30, rowSize: 6, rowGapS: 0.3, stuckS: 1, stuckProgressM: 0.5 });
    expect(e.banners).toMatchObject({ car_alarm: "CAR ALARM · shoot it to set it off", stampede: "STAMPEDE!" });
  });

  it("refuses wave 5, only neighbouring waves, fractions out of order, an over-cap past the pool, a missing banner, fractional ticks", () => {
    const bad = (edit: (e: Record<string, unknown>) => void, msg: RegExp): void => {
      const r = raw();
      edit(r.events as Record<string, unknown>);
      expect(() => loadBalance(r)).toThrow(msg);
    };
    bad((e) => (e.waves = [3, 5, 7]), /events\.json: waves: 5 is never an event wave/);
    bad((e) => (e.waves = [3, 4]), /no two waves that are not neighbours/);
    bad((e) => {
      e.startFractionMin = 0.7;
    }, /startFractionMin must be ≤ startFractionMax/);
    bad((e) => ((e.stampede as Record<string, unknown>).overCap = 200), /exceeds the zombie pool/);
    bad((e) => (e.banners = { car_alarm: "x" }), /banners\.stampede is missing/);
    bad((e) => ((e.stampede as Record<string, unknown>).rowGapS = 0.33), /whole ticks/);
    bad((e) => ((e.stampede as Record<string, unknown>).countByPlayers = [12, 18, 24]), /countByPlayers/);
  });
});
