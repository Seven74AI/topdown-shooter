/**
 * Story 4.1: the three Downtown files agree. The sim imports `packages/shared/src/map/data/downtown.tmj.json`
 * (the shared package can't read the client's public folder), so it must be a byte copy of the Tiled
 * export `tools/maps/downtown.tmj`; the Tiled source `downtown.tmx` must hold the
 * same objects. After a Tiled export run `npm run maps:sync`.
 *
 * Review L7: while the generator is the source, the committed .tmj and .tmx must be exactly what it
 * writes (size, properties, every object). Once the designer edits the map in Tiled, the .tmx is the
 * source: delete `buildDowntown.ts`'s layout and the "generator" test below (keep the other two).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, loadTiledMap } from "@topdown/shared";
import { SHARED_COPY_PATH, TMJ_PATH, TMX_PATH, buildDowntownTmj, tmxFromTmj } from "./buildDowntown";

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

  it("review L7 (retire once Tiled is the source): the committed .tmj and .tmx are exactly the generator's output", () => {
    const gen = buildDowntownTmj();
    expect(JSON.parse(tmj)).toEqual(gen);
    expect(tmj).toBe(`${JSON.stringify(gen, null, 1)}\n`);
    expect(readFileSync(TMX_PATH, "utf8")).toBe(tmxFromTmj(gen));
    expect([gen.width, gen.height, gen.tilewidth]).toEqual([48, 32, 32]);
  });
});
