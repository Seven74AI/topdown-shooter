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
import economy from "./balance/economy.json" with { type: "json" };

const raw = (): RawBalanceFiles => JSON.parse(JSON.stringify({ weapons, zombies, waves, player, controls, economy, bots, buildings, shop })) as RawBalanceFiles;

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

