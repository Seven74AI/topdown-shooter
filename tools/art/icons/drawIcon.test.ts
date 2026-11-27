import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_FILES, OUT_DIR, PICKED, drawIcons, iconSourcesHash, sha256 } from "./drawIcon";

/** Story 10.5 (B3): the committed icons are exactly what the approved drawing code bakes (`npm run art:icons`). */
const meta = JSON.parse(readFileSync(join(import.meta.dirname, "icons.json"), "utf8")) as { option: string; sourcesHash: string; files: Record<string, string> };

describe("Story 10.5 B3: the home-screen icons are baked from docs/art/icon/icons.js (IC3)", () => {
  it("the drawing code has not changed since the last bake (else: npm run art:icons)", () => {
    expect(meta.option).toBe(PICKED);
    expect(meta.sourcesHash, "icons.js or drawIcon.ts changed: run npm run art:icons and commit the PNGs").toBe(iconSourcesHash());
  });

  it("a fresh bake gives the committed files byte for byte, at their sizes", () => {
    const fresh = drawIcons();
    expect([...fresh.keys()]).toEqual(ICON_FILES.map((f) => f.file));
    for (const { file, px } of ICON_FILES) {
      const committed = readFileSync(join(OUT_DIR, file));
      const png = fresh.get(file) as Buffer;
      expect(png.readUInt32BE(16), `${file} width`).toBe(px);
      expect(png.readUInt32BE(20), `${file} height`).toBe(px);
      expect(sha256(committed), `${file}: icons.json`).toBe(meta.files[file]);
      expect(sha256(png), `${file}: a fresh bake differs from the committed file (npm run art:icons)`).toBe(sha256(committed));
    }
  });

  it("the icons are opaque (iOS shows a transparent icon on black) and the badge is inside the maskable 80 % circle", async () => {
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(readFileSync(join(OUT_DIR, "icon-maskable-512.png")));
    const c = createCanvas(512, 512);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 512, 512).data;
    let minA = 255;
    for (let i = 3; i < d.length; i += 4) minA = Math.min(minA, d[i] as number);
    expect(minA).toBe(255);
    // the amber glyph (bright, saturated pixels) lies entirely inside the circle of radius 0.4 × 512 round the centre
    let amber = 0;
    let outside = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;
        const r = d[i] as number, gg = d[i + 1] as number, b = d[i + 2] as number;
        if (r > 200 && r - b > 100 && gg > 100) {
          amber++;
          if (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 0.4 * 512) outside++;
        }
      }
    expect(amber).toBeGreaterThan(2000); // liveness: the glyph is there
    expect(outside).toBe(0);
  });
});
