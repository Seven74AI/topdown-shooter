import { describe, expect, it, vi } from "vitest";
import { DOWNTOWN_MAP, addPlayer, createWorld, loadBalance, setForcedBlackout, spawnZombie, startBuild } from "@topdown/shared";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0, FILL: 1 } }));
vi.mock("../city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("../city/spriteAtlas")>()), ensureAtlases: () => ({}) }));
vi.mock("../../audio/placeholderSfx", () => ({ playSfx: () => {} }));

import { ZombieView } from "../ZombieView";
import { EyesView } from "../darkness/EyesView";
import { AcidView } from "../AcidView";
import { AcidFx } from "../acidFx";
import { BloodTrailView } from "../BloodTrailView";
import { fakeScene, type FakeObject } from "../darkness/fakeScene.testkit";

/**
 * Story 6.4 review L1 (F3, F6, D3): the client views really honour the fog's visibility — a zombie at
 * 0 is not drawn (no image, no eyes), at 0.5 it is drawn at half alpha and its eyes follow; a spit glob
 * in the fog is hidden. (`ScreenFog` itself is tested in fog.test.ts.)
 */
const balance = loadBalance();
const QUIET = { waves: () => {}, zombies: () => {} };

/** A stub fog: visibility by x (x < 30 → 1, 30–35 → 0.5, beyond → 0). */
const fog = { visibility: (x: number) => (x < 30 ? 1 : x < 35 ? 0.5 : 0) };

function scene() {
  const fs = fakeScene();
  const sc = fs.scene as unknown as Record<string, unknown>;
  sc.time = { now: 1000 };
  sc.cameras = { main: { worldView: { x: 0, y: 0, width: 48, height: 32 } } };
  return fs;
}

describe("Story 6.4 review L1: ZombieView, EyesView and AcidView follow the fog", () => {
  it("ZombieView: visible at 1, half alpha at 0.5, not drawn at 0 (drawnImage undefined); no fog = all drawn", () => {
    const fs = scene();
    const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: QUIET });
    const clear = spawnZombie(w, "walker", 25, 16);
    const edge = spawnZombie(w, "walker", 32, 16);
    const hidden = spawnZombie(w, "walker", 40, 16);
    const zv = new ZombieView(fs.scene, balance, 64);
    zv.fog = fog;
    zv.update(w, 1);
    expect(zv.drawnImage(clear)?.alpha).toBe(1);
    expect(zv.drawnImage(edge)?.alpha).toBe(0.5);
    expect(zv.drawnImage(hidden)).toBeUndefined();
    expect(zv.drawn(hidden)).toBe(false);
    expect(zv.fogHidden).toBe(1);
    zv.fog = null;
    zv.update(w, 1);
    expect(zv.drawnImage(hidden)).toBeDefined();
    expect(zv.drawnImage(edge)?.alpha).toBe(1);
  });

  it("EyesView: no eyes on a fog-hidden zombie; the eyes of a fading one take its alpha", () => {
    const fs = scene();
    const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: QUIET });
    addPlayer(w, "me", 24, 16);
    startBuild(w);
    setForcedBlackout(w, 5);
    const edge = spawnZombie(w, "walker", 32, 16);
    const hidden = spawnZombie(w, "walker", 36, 16);
    const zv = new ZombieView(fs.scene, balance, 64);
    zv.fog = fog;
    zv.update(w, 1);
    const ev = new EyesView(fs.scene, balance);
    ev.update(w, zv, 24, 16, balance.decay.blackout.eyesM);
    expect(ev.drawn).toBe(1); // only the fading one (the hidden one is not drawn)
    const eye = fs.objects.find((o) => o.visible && o.frame.includes("eyes")) as FakeObject;
    expect(eye.alpha).toBeCloseTo(0.9 * 0.5, 9);
    void hidden;
    void edge;
  });

  it("AcidView: a spit glob in flight is hidden where the fog hides it, drawn where it doesn't", () => {
    const fs = scene();
    const fx = new AcidFx(4, 4, 10, 4);
    const av = new AcidView(fs.scene, fx, 1);
    av.fog = fog;
    fx.handle({ type: "spitter.spat", zombieId: 1, spitId: 1, x: 40, y: 10, toX: 41, toY: 10 }, 0);
    fx.handle({ type: "spitter.spat", zombieId: 2, spitId: 2, x: 20, y: 10, toX: 21, toY: 10 }, 0);
    av.update(0.01);
    const globs = fs.objects.filter((o) => o.frame.includes("spit"));
    const shown = globs.filter((g) => g.visible);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.x).toBeLessThan(30);
  });

  it("review L5: BloodTrailView: a fog-hidden Crawler leaves no marks; a visible one does", () => {
    const fs = fakeScene(["blood_trail"]);
    const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: QUIET });
    const seen = spawnZombie(w, "crawler", 20, 10);
    const hidden = spawnZombie(w, "crawler", 40, 20);
    const tv = new BloodTrailView(fs.scene, 64);
    tv.fog = fog;
    for (let k = 0; k < 20; k++) {
      for (const [id, x0, y] of [[seen, 20, 10], [hidden, 40, 20]] as const) {
        w.zombies.prevX[id] = w.zombies.x[id] as number;
        w.zombies.x[id] = x0 + k * 0.3;
        w.zombies.prevY[id] = w.zombies.y[id] = y;
      }
      tv.update(w, 1, 50, false);
    }
    const marks = fs.objects.filter((o) => o.visible && o.texture === "blood_trail");
    expect(marks.length).toBeGreaterThan(3); // the visible Crawler's trail
    expect(marks.every((m) => m.x < 30)).toBe(true); // none from the hidden one
  });
});
