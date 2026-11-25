/**
 * Story 7.9 AC 8 (decision D2): the held gun is its own picture under each player's body. With the default look, gun
 * frame + body frame composed must be the same picture as the 7.8 one-piece `drawSurvivor` frame (≤ 2 per channel per
 * pixel for alpha-blended edges), for every survivor frame. Real Canvas 2D in Node (`@napi-rs/canvas`, tests only).
 */
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "@topdown/shared";
import {
  CHAR_R_PX,
  SURVIVOR_GUN_CHAINSAW_RUNNING,
  SURVIVOR_GUN_FRAMES,
  SURVIVOR_GUN_PLAIN,
  SURVIVOR_WEAPON_FRAMES,
  characterSpecs,
  survivorFrameFor,
  survivorGunFrameFor,
  weaponHidesPack,
} from "./spriteAtlas";
import { CHAR_EXTENT_R, drawSurvivor, drawSurvivorBody, drawSurvivorGun } from "./spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "./weaponArt";
import { resolveLook } from "./survivorLook";

type G = CanvasRenderingContext2D;
const SIDE = Math.ceil(2 * CHAR_EXTENT_R.survivor * CHAR_R_PX);

function canvasOf(draw: (g: G) => void): Canvas {
  const cv = createCanvas(SIDE, SIDE);
  const g = cv.getContext("2d") as unknown as G;
  g.translate(SIDE / 2, SIDE / 2);
  draw(g);
  return cv;
}
const bytes = (cv: Canvas): Uint8ClampedArray => cv.getContext("2d").getImageData(0, 0, SIDE, SIDE).data as unknown as Uint8ClampedArray;

/** The gun canvas with the body canvas drawn over it: what the GPU shows (two sprites, one position). */
function composed(gun: (g: G) => void, withPack: boolean, look = resolveLook(DEFAULT_LOOK, 1)): Uint8ClampedArray {
  const under = canvasOf(gun);
  const body = canvasOf((g) => drawSurvivorBody(g, CHAR_R_PX, look, withPack, false));
  const g = under.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(body, 0, 0);
  return bytes(under);
}

function maxChannelDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
}

type Case = { weapon: string; running: boolean; held?: (c: G, r: number) => void; back?: ((c: G, r: number) => void) | undefined };
const CASES: Case[] = [
  { weapon: "pistol", running: false },
  { weapon: "chainsaw", running: true, held: (c, r) => drawChainsawRunning(c, "held", r) },
  ...Object.keys(WEAPON_ART).map((w) => ({ weapon: w, running: false, held: (c: G, r: number) => WEAPON_ART[w]!(c, "held", r), back: WEAPON_BACK_ART[w] })),
];

describe("gun under the body (Story 7.9 AC 8, D2)", () => {
  it("one gun frame per held-art weapon, the plain bar and the running chainsaw, all survivor-sized", () => {
    const specs = new Map(characterSpecs().map((s) => [s.name, s]));
    const names = [SURVIVOR_GUN_PLAIN, SURVIVOR_GUN_CHAINSAW_RUNNING, ...Object.values(SURVIVOR_GUN_FRAMES)];
    expect(names).toHaveLength(2 + Object.keys(SURVIVOR_WEAPON_FRAMES).length);
    for (const n of names) expect(specs.get(n)).toMatchObject({ w: SIDE, h: SIDE });
    expect(survivorGunFrameFor("pistol")).toBe(SURVIVOR_GUN_PLAIN);
    expect(survivorGunFrameFor("smg")).toBe(SURVIVOR_GUN_PLAIN);
    expect(survivorGunFrameFor("chainsaw", true)).toBe(SURVIVOR_GUN_CHAINSAW_RUNNING);
    expect(survivorGunFrameFor("shotgun", true)).toBe(SURVIVOR_GUN_FRAMES.shotgun);
    expect(weaponHidesPack("flamethrower")).toBe(true);
    expect(weaponHidesPack("shotgun")).toBe(false);
  });

  it.each(CASES.map((c) => [survivorFrameFor(c.weapon, c.running), c] as const))("%s: gun + default body = the one-piece frame", (_n, c) => {
    const reference = bytes(canvasOf((g) => drawSurvivor(g, CHAR_R_PX, c.held, c.back)));
    const split = composed((g) => drawSurvivorGun(g, CHAR_R_PX, c.held, c.back), !weaponHidesPack(c.weapon));
    let opaque = 0;
    for (let i = 3; i < split.length; i += 4) if ((split[i] as number) > 0) opaque++;
    expect(opaque).toBeGreaterThan(1000); // liveness: a survivor was drawn
    expect(maxChannelDiff(reference, split)).toBeLessThanOrEqual(2);
  });

  it("the gun frame alone shows no body, and the body alone no gun (the split is real)", () => {
    const gun = bytes(canvasOf((g) => drawSurvivorGun(g, CHAR_R_PX)));
    const body = bytes(canvasOf((g) => drawSurvivorBody(g, CHAR_R_PX)));
    const centre = (SIDE / 2) * SIDE * 4 + (SIDE / 2) * 4 + 3; // the head's centre
    expect(gun[centre]).toBe(0);
    expect(body[centre]).toBe(255);
    const muzzle = (SIDE / 2) * SIDE * 4 + Math.round(SIDE / 2 + CHAR_R_PX * 1.9) * 4 + 3; // the gun bar's tip
    expect(gun[muzzle]).toBeGreaterThan(0);
    expect(body[muzzle]).toBe(0);
    // the nopack body really has no pack (the flamethrower's tanks show in its place)
    const nopack = bytes(canvasOf((g) => drawSurvivorBody(g, CHAR_R_PX, resolveLook(DEFAULT_LOOK, 1), false)));
    const back = (SIDE / 2) * SIDE * 4 + Math.round(SIDE / 2 - CHAR_R_PX * 0.85) * 4 + 3; // the pack, behind the shoulders
    expect(body[back]).toBe(255);
    expect(nopack[back]).toBe(0);
  });
});
