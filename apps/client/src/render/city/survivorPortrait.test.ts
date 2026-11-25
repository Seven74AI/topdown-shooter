import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, encodeLook } from "@topdown/shared";
import { PORTRAIT_PX, clearPortraitCache, survivorPortraitUrl } from "./survivorPortrait";

const napi = (): HTMLCanvasElement => createCanvas(1, 1) as unknown as HTMLCanvasElement;
const RED = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:6|c:cc2222,22cc22,2222cc";

describe("lobby portrait (Story 7.9 AC 12)", () => {
  it("draws once per look code and caches the data URL", () => {
    clearPortraitCache();
    let made = 0;
    const make = (): HTMLCanvasElement => (made++, napi());
    const a = survivorPortraitUrl(RED, make);
    expect(a).toMatch(/^data:image\/png;base64,/);
    expect(survivorPortraitUrl(RED, make)).toBe(a);
    expect(made).toBe(1);
    const d = survivorPortraitUrl(encodeLook(DEFAULT_LOOK), make);
    expect(d).not.toBe(a); // another look is another picture
    expect(made).toBe(2);
  });

  it("the whole survivor is inside the picture (no part cut at the edges) and something is drawn", () => {
    clearPortraitCache();
    let cv: HTMLCanvasElement | null = null;
    survivorPortraitUrl(RED, () => (cv = napi()));
    const c = cv as unknown as HTMLCanvasElement;
    const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, PORTRAIT_PX, PORTRAIT_PX).data;
    let opaque = 0;
    let edge = 0;
    for (let y = 0; y < PORTRAIT_PX; y++)
      for (let x = 0; x < PORTRAIT_PX; x++) {
        if ((d[(y * PORTRAIT_PX + x) * 4 + 3] as number) === 0) continue;
        opaque++;
        if (x < 2 || y < 2 || x >= PORTRAIT_PX - 2 || y >= PORTRAIT_PX - 2) edge++;
      }
    expect(opaque).toBeGreaterThan(5000);
    expect(edge).toBe(0);
  });

  it("no DOM: null, nothing thrown; junk codes draw the default parts", () => {
    clearPortraitCache();
    expect(survivorPortraitUrl(RED, () => null)).toBeNull();
    expect(survivorPortraitUrl("x".repeat(5000), napi)).toMatch(/^data:image\/png/);
  });
});
