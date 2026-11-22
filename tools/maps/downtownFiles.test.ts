/**
 * Story 4.1: the three Downtown files agree. The sim imports `packages/shared/src/map/data/downtown.tmj.json`
 * (the shared package can't read the client's public folder), so it must be a byte copy of the Tiled
 * export `apps/client/public/assets/maps/downtown.tmj`; the Tiled source `downtown.tmx` must hold the
 * same objects. After a Tiled export run `npm run maps:sync`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, loadTiledMap } from "@topdown/shared";
import { SHARED_COPY_PATH, TMJ_PATH, TMX_PATH } from "./buildDowntown";

const tmj = readFileSync(TMJ_PATH, "utf8");

describe("Downtown map files (Story 4.1)", () => {
  it("the sim's copy is the Tiled export, byte for byte (else: npm run maps:sync)", () => {
    expect(readFileSync(SHARED_COPY_PATH, "utf8") === tmj, "run `npm run maps:sync`").toBe(true);
    expect(loadTiledMap(JSON.parse(tmj), "downtown").version).toBe(DOWNTOWN_MAP.version);
  });

  it("downtown.tmx (the Tiled source) holds the same layers and objects at the same pixels as the export", () => {
    const tmx = readFileSync(TMX_PATH, "utf8");
    type L = { type: string; name: string; layers?: L[]; objects?: { name: string; x: number; y: number }[] };
    const walk = (ls: L[], out: string[]): string[] => {
      for (const l of ls) {
        out.push(`layer ${l.name}`);
        if (l.layers) walk(l.layers, out);
        for (const o of l.objects ?? []) out.push(`${o.name} ${o.x} ${o.y}`);
      }
      return out;
    };
    const fromTmj = walk((JSON.parse(tmj) as { layers: L[] }).layers, []);
    const fromTmx = [...tmx.matchAll(/<(objectgroup|group) id="\d+" name="([^"]+)"|<object id="\d+" name="([^"]*)" x="([^"]+)" y="([^"]+)"/g)].map((m) =>
      m[2] !== undefined ? `layer ${m[2]}` : `${m[3]} ${Number(m[4])} ${Number(m[5])}`,
    );
    expect(fromTmx).toEqual(fromTmj);
    expect(fromTmj.length).toBeGreaterThan(50);
  });
});
