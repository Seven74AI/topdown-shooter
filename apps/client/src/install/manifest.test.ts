import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_TITLE } from "@topdown/shared";
import { parseUrlOptions } from "../debug/urlOptions";

/** Story 10.5 (AC 1, 2; B2): the web app manifest and the home-screen meta in index.html. */
const CLIENT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(CLIENT, "public");
const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};
const html = readFileSync(join(CLIENT, "index.html"), "utf8");

/** Width and height from a PNG's IHDR. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1"), `${file} is a PNG`).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("Story 10.5: manifest.webmanifest", () => {
  it("B2 fields and the Q2 name", () => {
    expect(manifest.name).toBe("Hordes");
    expect(manifest.short_name).toBe("Hordes");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // iOS / Android cut the label at about 12
    expect(GAME_TITLE).toBe(manifest.name); // the start screen and the boot title say the same
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.display_override).toEqual(["fullscreen", "standalone"]);
    expect(manifest.orientation).toBe("landscape");
    expect(manifest.start_url).toBe("/?source=homescreen");
    expect(manifest.scope).toBe("/");
    expect(manifest.background_color).toBe("#000000");
    expect(manifest.theme_color).toBe("#000000");
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`); // no colour flash on launch
  });

  it("icons: purpose any at 192 and 512, a separate maskable 512; every file exists in public/ at its stated size", () => {
    const any = manifest.icons.filter((i) => i.purpose === "any").map((i) => i.sizes);
    expect(any).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.filter((i) => i.purpose === "maskable").map((i) => i.sizes)).toEqual(["512x512"]);
    for (const i of manifest.icons) {
      expect(i.purpose).toMatch(/^(any|maskable)$/); // never "any maskable" (one picture can't be both well)
      expect(i.type).toBe("image/png");
      expect(i.src).toMatch(/^\/icons\//); // outside /assets/: the short cache, never the immutable one (Caddyfile)
      const file = join(PUBLIC, i.src);
      expect(existsSync(file), i.src).toBe(true);
      const [w, h] = pngSize(file);
      expect(`${w}x${h}`, i.src).toBe(i.sizes);
    }
  });

  it("index.html links the manifest, favicon and apple touch icon (existing, at their sizes) and has the iOS meta and the Q2 title", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Hordes" />');
    expect(html).toContain("<title>Hordes</title>");
    expect(html).toContain("viewport-fit=cover"); // black-translucent draws under the status bar: the safe areas handle it
    for (const [rel, px] of [
      ["icon", 32],
      ["apple-touch-icon", 180],
    ] as const) {
      const m = new RegExp(`<link rel="${rel}"[^>]*sizes="${px}x${px}" href="([^"]+)"`).exec(html);
      expect(m, rel).not.toBeNull();
      expect(pngSize(join(PUBLIC, (m as RegExpExecArray)[1] as string))).toEqual([px, px]);
    }
  });

  it("B2: start_url's ?source=homescreen changes no URL option (dev and release)", () => {
    const query = new URL(manifest.start_url, "https://hordes.sevend.io").search;
    expect(query).toBe("?source=homescreen");
    for (const dev of [false, true]) expect(parseUrlOptions(query, dev)).toEqual(parseUrlOptions("", dev));
  });

  it("B1: no service worker anywhere in the client (it would cache index.html and hide 'A new version is out')", () => {
    expect(html).not.toMatch(/serviceWorker/);
    expect(readFileSync(join(CLIENT, "src", "main.ts"), "utf8")).not.toMatch(/serviceWorker/);
  });
});
