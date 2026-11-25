import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, addPlayer, encodeLook, loadBalance, worldDigest } from "@topdown/shared";
import { LOCAL_PLAYER_ID, LocalSimHost } from "./LocalSimHost";

/** Story 7.9 AC 13 (D4): practice solo draws my own look from this phone's progress, checked as a join would be. */
describe("practice solo look (Story 7.9 AC 13)", () => {
  const balance = loadBalance();
  it("no cached look → the default look (\"\"), no error", () => {
    expect(new LocalSimHost({ balance, seed: 1 }).playerInfo().look).toBe("");
  });
  it("a cached starter look is drawn as it is", () => {
    const code = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
    expect(new LocalSimHost({ balance, seed: 1, look: code }).playerInfo().look).toBe(code);
  });
  it("a part I don't own (riot helmet before 7.11) or junk falls back per slot", () => {
    const info = new LocalSimHost({ balance, seed: 1, look: "v1|top:hoodie|head:riot|hair:short|pack:none|skin:2|c:aa0000,00bb00,0000cc" }).playerInfo();
    expect(info.look).toBe("v1|top:hoodie|head:cap|hair:short|pack:none|skin:2|c:aa0000,00bb00,0000cc");
    expect(new LocalSimHost({ balance, seed: 1, look: { x: 1 } }).playerInfo().look).toBe(encodeLook(DEFAULT_LOOK));
  });
});

describe("L5: a look is cosmetic only (Story 7.9)", () => {
  it("same seed and inputs → the same World digest with any look (the World never sees it)", () => {
    const balance = loadBalance();
    const digest = (look: unknown): { digest: string; waves: number } => {
      const host = new LocalSimHost({ balance, seed: 77, ...(look === undefined ? {} : { look }) });
      addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
      host.update(0.05);
      host.setBuildReady(true);
      for (let i = 0; i < 600; i++) host.update(0.05); // 30 s of play: wave 1 runs
      return { digest: String(worldDigest(host.world)), waves: host.world.waves.number };
    };
    const base = digest(undefined);
    expect(base.waves).toBeGreaterThanOrEqual(1); // liveness: a wave was played
    for (const look of ["v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc", "v1|head:prop", "junk"]) expect(digest(look)).toEqual(base);
  });
});
