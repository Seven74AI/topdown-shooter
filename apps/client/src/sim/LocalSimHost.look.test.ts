import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, encodeLook, loadBalance } from "@topdown/shared";
import { LocalSimHost } from "./LocalSimHost";

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
