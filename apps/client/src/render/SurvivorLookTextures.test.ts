import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 }, TintModes: { MULTIPLY: 0 } }));
vi.mock("./city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("./city/spriteAtlas")>()), ensureAtlases: () => ({}) }));
import { DEFAULT_LOOK, encodeLook, type PlayerState } from "@topdown/shared";
import { fakeScene, type FakeObject } from "./darkness/fakeScene.testkit";
import { textureRegistry } from "./gfx/textureRegistry";
import { DARK_BODY_DEPTH, PlayerView } from "./PlayerView";
import { LOOK_FRAME_NOPACK, LOOK_FRAME_PACK, LOOK_FRAME_SIDE, SurvivorLookTextures, lookLayer, lookTextureKey, syncViewLook } from "./SurvivorLookTextures";
import { SurvivorLayerPool } from "./SurvivorLayerPool";
import { SLOT_COLORS } from "./playerColors";
import { ATLAS_CHARACTERS, SURVIVOR_GUN_FRAMES, SURVIVOR_GUN_PLAIN } from "./city/spriteAtlas";
import { devLookCodes } from "./devLooks";

const napiCanvas = (): HTMLCanvasElement => Object.assign(createCanvas(1, 1), { addEventListener: () => {}, removeEventListener: () => {} }) as unknown as HTMLCanvasElement;
const pixels = (c: HTMLCanvasElement): Uint8ClampedArray => (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
const sum = (d: Uint8ClampedArray, from = 0, to = d.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] as number;
  return s;
};
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const DEFAULT_CODE = encodeLook(DEFAULT_LOOK);
const RED = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:6|c:cc2222,22cc22,2222cc";

function setup(): { fs: ReturnType<typeof fakeScene>; tx: SurvivorLookTextures; canvases: HTMLCanvasElement[] } {
  const fs = fakeScene();
  const canvases: HTMLCanvasElement[] = [];
  const tx = new SurvivorLookTextures(fs.scene, () => {
    const c = napiCanvas();
    canvases.push(c);
    return c;
  });
  return { fs, tx, canvases };
}

describe("per-player survivor textures (Story 7.9 AC 7, 9; D1)", () => {
  it("bakes each player's body once (pack and nopack side by side), through addGeneratedTexture", () => {
    const { fs, tx, canvases } = setup();
    const key = tx.setLook("p1", RED, 1);
    expect(key).toBe(lookTextureKey("p1"));
    expect(fs.keys.has(key)).toBe(true);
    expect(textureRegistry.has(key)).toBe(true);
    const c = canvases[0] as HTMLCanvasElement;
    expect([c.width, c.height]).toEqual([2 * LOOK_FRAME_SIDE, LOOK_FRAME_SIDE]);
    const d = pixels(c);
    const row = LOOK_FRAME_SIDE * 4;
    let packHalf = 0;
    let nopackHalf = 0;
    for (let y = 0; y < LOOK_FRAME_SIDE; y++) {
      packHalf += sum(d, y * 2 * row, y * 2 * row + row);
      nopackHalf += sum(d, y * 2 * row + row, (y + 1) * 2 * row);
    }
    expect(packHalf).toBeGreaterThan(nopackHalf); // the pack frame has the school bag, the other has none
    expect(nopackHalf).toBeGreaterThan(0);
    expect(tx.bakes).toBe(1);
    tx.dispose();
    expect(textureRegistry.has(key)).toBe(false);
    expect(fs.keys.has(key)).toBe(false);
  });

  it("L4: the same code and stage every frame does nothing (no repaint, no new texture)", () => {
    const { fs, tx } = setup();
    tx.setLook("p1", RED, 1);
    const refreshes = fs.refreshes;
    const objects = fs.objects.length;
    for (let i = 0; i < 600; i++) tx.setLook("p1", RED, 1);
    expect(tx.bakes).toBe(1);
    expect(fs.refreshes).toBe(refreshes);
    expect(fs.objects.length).toBe(objects);
    tx.dispose();
  });

  it("D1: a new decay stage repaints once, darker — the default look too", () => {
    const { fs, tx, canvases } = setup();
    tx.setLook("p1", DEFAULT_CODE, 1);
    const c = canvases[0] as HTMLCanvasElement;
    const evening = sum(pixels(c));
    tx.beginFrame();
    tx.setLook("p1", DEFAULT_CODE, 5);
    tx.setLook("p1", DEFAULT_CODE, 5);
    expect(tx.bakes).toBe(2);
    expect(fs.refreshes).toBe(1);
    expect(sum(pixels(c))).toBeLessThan(evening);
    tx.dispose();
  });

  it("AC 9: a build start repaints at most one existing body per frame; all 4 are done after 4 frames", () => {
    const { fs, tx } = setup();
    for (const id of ["p0", "p1", "p2", "p3"]) tx.setLook(id, DEFAULT_CODE, 1); // new bodies: painted at once
    expect(tx.bakes).toBe(4);
    for (let frame = 1; frame <= 6; frame++) {
      tx.beginFrame();
      for (const id of ["p0", "p1", "p2", "p3"]) tx.setLook(id, DEFAULT_CODE, 2);
      expect(tx.bakes).toBe(4 + Math.min(frame, 4));
    }
    expect(fs.refreshes).toBe(4);
    tx.dispose();
  });

  it("brief 20: a lost context repaints the CURRENT look and stage, not the first one", () => {
    const { tx, canvases } = setup();
    tx.setLook("p1", DEFAULT_CODE, 1);
    tx.beginFrame();
    tx.setLook("p1", RED, 3);
    const c = canvases[0] as HTMLCanvasElement;
    const now = pixels(c).slice();
    (c.getContext("2d") as CanvasRenderingContext2D).clearRect(0, 0, c.width, c.height); // the browser emptied it
    expect(sum(pixels(c))).toBe(0);
    textureRegistry.rebuildAll();
    expect(same(pixels(c), now)).toBe(true);
    tx.dispose();
  });

  it("a restarted scene drops the previous run's leftover bodies first", () => {
    const fs = fakeScene();
    const first = new SurvivorLookTextures(fs.scene, napiCanvas);
    first.setLook("old", RED, 1); // the scene shut down without dispose: Phaser keeps the texture
    expect(fs.keys.has(lookTextureKey("old"))).toBe(true);
    const again = new SurvivorLookTextures(fs.scene, napiCanvas);
    expect(fs.keys.has(lookTextureKey("old"))).toBe(false);
    expect(textureRegistry.has(lookTextureKey("old"))).toBe(false);
    again.setLook("old", RED, 1);
    expect(again.size).toBe(1);
    again.dispose();
  });

  it("beat the rule 4: 50 rejoins with different looks keep at most the players on screen", () => {
    const { fs, tx } = setup();
    const codes = devLookCodes(50);
    for (let i = 0; i < 50; i++) {
      tx.setLook(`p${i}`, codes[i] as string, 1);
      if (i >= 3) tx.remove(`p${i - 3}`); // the oldest left
      expect(tx.size).toBeLessThanOrEqual(4);
    }
    expect([...fs.keys].filter((k) => k.startsWith("survivorlook_")).length).toBe(3);
    tx.dispose();
    expect([...fs.keys].filter((k) => k.startsWith("survivorlook_")).length).toBe(0);
  });

  it("beat the rule 3: every slot unknown or junk draws the default parts, nothing throws", () => {
    const { tx } = setup();
    for (const code of ["v1|top:zzz|head:zzz|hair:zzz|pack:zzz|skin:zzz|c:zz,zz,zz", "x".repeat(10_000), "v1|" + "|".repeat(300)]) expect(() => tx.setLook("p", code, 2)).not.toThrow();
    tx.dispose();
  });

  it("L6: the same code and stage draw the same pixels on two phones", () => {
    const a = setup();
    const b = setup();
    a.tx.setLook("p1", RED, 4);
    b.tx.setLook("p1", RED, 4);
    expect(same(pixels(a.canvases[0] as HTMLCanvasElement), pixels(b.canvases[0] as HTMLCanvasElement))).toBe(true);
    a.tx.dispose();
    b.tx.dispose();
  });
});

describe("animated layer from the look (Story 7.9 AC 10)", () => {
  it("the propeller cap gives the propeller layer; other headgear none", () => {
    expect(lookLayer("v1|head:prop")).toBe("propeller");
    expect(lookLayer(DEFAULT_CODE)).toBeNull();
    expect(lookLayer("v1|head:riot")).toBeNull();
    expect(lookLayer("junk")).toBeNull();
  });
});

const player = (over: Partial<Record<string, unknown>> = {}): PlayerState =>
  ({ prevX: 5, x: 5, prevY: 7, y: 7, facingX: 0, facingY: 1, status: "alive", slowTicksLeft: 0, loadout: { slots: [{ weapon: "pistol" }], active: 0 }, ...over }) as unknown as PlayerState;

describe("PlayerView: the gun under the body (Story 7.9 AC 7, 11)", () => {
  function viewWithLook(code = RED): { v: PlayerView; body: FakeObject; gun: FakeObject; fs: ReturnType<typeof fakeScene>; tx: SurvivorLookTextures } {
    const fs = fakeScene();
    const tx = new SurvivorLookTextures(fs.scene, napiCanvas);
    const v = new PlayerView(fs.scene, 0.4);
    v.setBodyTexture(tx.setLook("p1", code, 1));
    return { v, body: v.bodySprite as unknown as FakeObject, gun: v.gunSprite as unknown as FakeObject, fs, tx };
  }

  it("body from the player's texture, gun from the shared atlas just under it, turned and placed together", () => {
    const { v, body, gun, tx } = viewWithLook();
    v.update(player(), 1, 0);
    expect(body.texture).toBe(lookTextureKey("p1"));
    expect(body.frame).toBe(LOOK_FRAME_PACK);
    expect(gun.texture).toBe(ATLAS_CHARACTERS);
    expect(gun.frame).toBe(SURVIVOR_GUN_PLAIN);
    expect(gun.depth).toBeLessThan(body.depth);
    expect([gun.x, gun.y, gun.rotation]).toEqual([body.x, body.y, body.rotation]);
    expect(body.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(gun.visible).toBe(true);
    expect([gun.displayWidth, gun.displayHeight]).toEqual([body.displayWidth, body.displayHeight]);
    tx.dispose();
  });

  it("the flamethrower's tanks: its gun frame and the body without the pack; back to the pack on a swap", () => {
    const { v, body, gun, tx } = viewWithLook();
    v.update(player({ loadout: { slots: [{ weapon: "flamethrower" }], active: 0 } }), 1, 0);
    expect(gun.frame).toBe(SURVIVOR_GUN_FRAMES.flamethrower);
    expect(body.frame).toBe(LOOK_FRAME_NOPACK);
    v.update(player({ loadout: { slots: [{ weapon: "shotgun" }], active: 0 } }), 1, 0);
    expect(gun.frame).toBe(SURVIVOR_GUN_FRAMES.shotgun);
    expect(body.frame).toBe(LOOK_FRAME_PACK);
    tx.dispose();
  });

  it("downed / slowed tints, out and the blackout depth apply to body and gun together", () => {
    const { v, body, gun, tx } = viewWithLook();
    v.update(player({ status: "downed" }), 1, 0);
    expect(gun.tint).toBe(body.tint);
    expect(body.tint).not.toBe(0xffffff);
    v.update(player({ slowTicksLeft: 10 }), 1, 0);
    expect(gun.tint).toBe(body.tint);
    expect(body.tint).not.toBe(0xffffff);
    v.update(player({ status: "out" }), 1, 0);
    expect([body.visible, gun.visible]).toEqual([false, false]);
    v.update(player(), 1, 0);
    expect([body.visible, gun.visible]).toEqual([true, true]);
    v.setAboveDark(true);
    expect(body.depth).toBe(DARK_BODY_DEPTH);
    expect(gun.depth).toBeLessThan(body.depth);
    expect(gun.depth).toBeGreaterThan(v.depths.ring);
    v.destroy();
    expect([body.destroyed, gun.destroyed]).toEqual([true, true]);
    tx.dispose();
  });

  it("L4: no frame or texture call per frame while nothing changes", () => {
    const { v, body, gun, fs, tx } = viewWithLook();
    v.update(player(), 1, 0);
    const spy = vi.spyOn(body, "setFrame");
    const gunSpy = vi.spyOn(gun, "setFrame");
    const texSpy = vi.spyOn(body, "setTexture");
    const refreshes = fs.refreshes;
    for (let i = 1; i <= 300; i++) {
      v.setBodyTexture(tx.setLook("p1", RED, 1));
      v.update(player({ x: 5 + i * 0.01 }), 1, i * 16);
    }
    expect([spy.mock.calls.length, gunSpy.mock.calls.length, texSpy.mock.calls.length, fs.refreshes - refreshes]).toEqual([0, 0, 0, 0]);
    tx.dispose();
  });

  it("L3: no look changes the ring colour — not even a look in every slot colour", () => {
    for (let slot = 0; slot < 4; slot++) {
      const hex = (SLOT_COLORS[slot] as number).toString(16).padStart(6, "0");
      const { v, fs, tx } = viewWithLook(`v1|top:jacket|head:cap|hair:short|pack:backpack|skin:1|c:${hex},${hex},${hex}`);
      v.setSlot(slot);
      v.update(player(), 1, 0);
      const ring = fs.objects[0] as FakeObject; // the ring is made first
      expect(ring.strokeColor).toBe(SLOT_COLORS[slot]);
      tx.dispose();
    }
  });

  it("without a look texture (7.8 path) the one-piece atlas frame shows and the gun stays hidden", () => {
    const fs = fakeScene();
    const v = new PlayerView(fs.scene, 0.4);
    v.update(player(), 1, 0);
    expect((v.gunSprite as unknown as FakeObject).visible).toBe(false);
    expect((v.bodySprite as unknown as FakeObject).texture).toBe(ATLAS_CHARACTERS);
  });

  it("AC 10: a look with the propeller cap carries the pooled propeller sprite", () => {
    const fs = fakeScene();
    const pool = new SurvivorLayerPool(fs.scene, napiCanvas);
    const v = new PlayerView(fs.scene, 0.4);
    const layer = lookLayer("v1|head:prop");
    expect(layer).toBe("propeller");
    if (layer) v.setAnimatedLayer(pool, layer);
    expect(v.layerSprite).not.toBeNull();
    v.destroy();
  });
});

describe("GameScene's look hookup: syncViewLook (Story 7.9 AC 7, 10; R2)", () => {
  it("sets the body texture, follows the stage, and takes the layer from the look (once per code)", () => {
    const fs = fakeScene();
    const tx = new SurvivorLookTextures(fs.scene, napiCanvas);
    let pool: SurvivorLayerPool | null = null;
    const poolOf = (): SurvivorLayerPool => (pool ??= new SurvivorLayerPool(fs.scene, napiCanvas));
    const v = new PlayerView(fs.scene, 0.4);
    const frame = (code: string, stage: number, dev: "propeller" | null = null): void => syncViewLook(v, tx, "p1", code, stage, poolOf, pool !== null, dev);
    frame(DEFAULT_CODE, 1);
    expect((v.bodySprite as unknown as FakeObject).texture).toBe(lookTextureKey("p1"));
    expect(v.layerSprite).toBeNull();
    expect(pool).toBeNull(); // no layer: no pool made
    frame(DEFAULT_CODE, 1);
    tx.beginFrame();
    frame(DEFAULT_CODE, 2); // a build start
    expect(tx.bakes).toBe(2);
    frame("v1|head:prop", 2); // a look with the propeller cap (owned in a later story)
    expect(v.layerSprite).not.toBeNull();
    frame(DEFAULT_CODE, 2);
    expect(v.layerSprite).toBeNull();
    frame("v1|head:beanie", 2, "propeller"); // ?devlayer forces it on everyone
    expect(v.layerSprite).not.toBeNull();
    v.destroy();
    tx.dispose();
  });
});
