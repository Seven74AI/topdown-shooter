/**
 * Story 7.9 (retro R2): wiring of the per-player looks into GameScene. The scene is a Phaser scene with no test
 * harness, so this reads its source: each hookup below is one line, and deleting it fails here. The behaviour of
 * each piece is tested in render/SurvivorLookTextures.test.ts.
 */
import { describe, expect, it } from "vitest";
import src from "./GameScene.ts?raw";
/** The body of a `private readonly name = (…) => { … };` arrow, up to its closing `};` line. */
function arrowBody(name: string): string {
  const start = src.indexOf(`private readonly ${name} = `);
  expect(start, name).toBeGreaterThan(0);
  return src.slice(start, src.indexOf("\n  };", start));
}

describe("GameScene look wiring (Story 7.9)", () => {
  it("every view's look is synced from host.playerInfo(id).look each frame", () => {
    expect(arrowBody("syncPlayerView")).toMatch(/this\.syncLook\(view, id, this\.host\?\.playerInfo\(id\)\.look \?\? ""\)/);
  });
  it("syncLook passes the decay stage (D1) and ?devlayer to syncViewLook", () => {
    expect(arrowBody("syncLook")).toMatch(/syncViewLook\(view, this\.lookTextures, id, code, this\.host\?\.world\.decay\.stage \?\? 1, this\.layerPoolOf, this\.layerPool !== null, urlOptions\(\)\.devLayer\)/);
  });
  it("a player who leaves takes their texture along", () => {
    expect(arrowBody("dropPlayerView")).toMatch(/this\.lookTextures\?\.remove\(id\)/);
  });
  it("the textures are made at create (leftover cleanup) and disposed at shutdown", () => {
    expect(src).toMatch(/this\.lookTextures = new SurvivorLookTextures\(this\);/);
    expect(src).toMatch(/this\.lookTextures\?\.dispose\(\);/);
  });
  it("?devlooks makes its extra survivors and updates them after the real ones", () => {
    expect(src).toMatch(/new DevLooks\(urlOptions\(\)\.devLooks - 1, /);
    expect(src).toMatch(/this\.devLooks\.update\(me, /);
    expect(src).toMatch(/this\.devLooks\?\.destroy\(\);/);
  });
  it("practice solo draws my own look from this phone's copy (AC 13, D4)", () => {
    expect(src).toMatch(/new LocalSimHost\(\{ [^}]*look: deviceLook\.get\(\) \}\)/);
  });
});
