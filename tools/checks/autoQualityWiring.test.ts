import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 10.2 review L7: the one-time quality check (`settings/autoQuality.ts`, Q3 B) is wired where the story says:
 * GameScene feeds it every frame, gated to a real first wave (never ?stress, never after Game over, only
 * `phase === "wave"` of wave 1) with the tab's hidden state, and pushes its toast; main.ts boots it before the
 * canvas is sized (so a remembered step's Resolution applies to the first canvas). The unit tests cover the rules.
 */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", ...p), "utf8");

describe("Story 10.2 L7: autoQuality wiring", () => {
  it("GameScene: one call per frame, gated to a real first wave, its toast pushed", () => {
    const src = read("apps", "client", "src", "scenes", "GameScene.ts");
    const calls = src.match(/autoQuality\.frame\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(src).toMatch(
      /autoQuality\.frame\(performance\.now\(\), \{ firstWave: !this\.stressMode && !this\.gameOver && host\.world\.run\.phase === "wave" && host\.world\.waves\.number === 1, hidden: document\.hidden \}\)/,
    );
    expect(src).toMatch(/if \(aq !== ""\) this\.toasts\.push\(aq\);/);
    // in update(), before anything else can return early past it
    const update = src.indexOf("override update(_time: number, deltaMs: number): void {");
    const call = src.indexOf("autoQuality.frame(");
    expect(update).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(update);
    expect(src.slice(update, call).match(/\breturn\b/g)?.length ?? 0).toBe(1); // only the no-host guard comes first
  });

  it("main.ts: boot() before the Resolution cap and before the game (the first canvas already has the remembered size)", () => {
    const src = read("apps", "client", "src", "main.ts");
    const boot = src.indexOf("autoQuality.boot();");
    const cap = src.indexOf("applyResolutionCap(getSettings());");
    const game = src.indexOf("new Phaser.Game(");
    expect(boot).toBeGreaterThan(0);
    expect(boot).toBeLessThan(cap);
    expect(cap).toBeLessThan(game);
    expect(src).toMatch(/bindResolution\(game, viewport\)/);
  });

  it("the page's check is off under ?stress (no check, no remembered step: review N4)", () => {
    const src = read("apps", "client", "src", "settings", "autoQuality.ts");
    expect(src).toMatch(/export const autoQuality = new AutoQuality\(\(\) => globalThis\.localStorage, setSettingsDefaults, getStoredSettings, typeof location !== "undefined" && urlOptions\(\)\.stress !== null\);/);
    expect(src).toMatch(/boot\(\): void \{\s+if \(this\.disabled\) return;/);
  });
});
