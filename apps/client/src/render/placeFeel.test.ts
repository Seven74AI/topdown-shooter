import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { PlacedSoundPicker, DROP_FROM_M, DROP_MS, FAR_VOLUME, OWNER_LEFT_COLOR, PICK_POP_FROM, PICK_POP_MS, STALE_PLACE_S, TAB_FADE_MS, TAB_LIFE_MS, dropOffsetM, freshPlace, ownerColor, pickPopScale, placeSoundKind, placeVolume, tabAlpha } from "./placeFeel";
import { SLOT_COLORS } from "./playerColors";

const balance = loadBalance();

describe("Story 5.23: placement feel rules (AC 1, 2, 4, 6)", () => {
  it("sound by kind (D3): wooden walls thunk, floor types click, every other solid type clanks", () => {
    const kind = (t: string) => placeSoundKind(t, balance.buildings.types[t]);
    expect(Object.fromEntries(Object.keys(balance.buildings.types).map((t) => [t, kind(t)]))).toEqual({
      wood_barricade: "thunk",
      reinforced_barricade: "thunk",
      metal_barricade: "clank",
      auto_turret: "clank",
      floodlight: "clank",
      med_station: "clank",
      spike_trap: "click",
      mine: "click",
      bear_trap: "click",
    });
    expect(placeSoundKind("castle", undefined)).toBe("clank");
  });

  it("pick pop: 0.8 at the pick, eases out to 1 at 120 ms, 1 after (and for bad clocks)", () => {
    expect(pickPopScale(0)).toBeCloseTo(PICK_POP_FROM, 9);
    expect(pickPopScale(PICK_POP_MS / 2)).toBeGreaterThan(0.9 + 0.05 * 0); // ease-out: past halfway at half time
    expect(pickPopScale(PICK_POP_MS / 2)).toBeLessThan(1);
    expect(pickPopScale(PICK_POP_MS)).toBe(1);
    expect(pickPopScale(5000)).toBe(1);
    expect(pickPopScale(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(pickPopScale(Number.NaN)).toBe(1);
    expect(pickPopScale(-5)).toBe(1);
    for (let t = 0; t < PICK_POP_MS; t += 10) expect(pickPopScale(t + 10)).toBeGreaterThanOrEqual(pickPopScale(t));
  });

  it("drop: 0.15 m at the placement, falling (ease-in) to 0 at 120 ms", () => {
    expect(dropOffsetM(0)).toBeCloseTo(DROP_FROM_M, 9);
    expect(dropOffsetM(DROP_MS / 2)).toBeCloseTo(DROP_FROM_M * 0.75, 9); // ease-in: still high at half time
    expect(dropOffsetM(DROP_MS)).toBe(0);
    expect(dropOffsetM(Number.NaN)).toBe(0);
  });

  it("tab: full for 2.6 s, fading over 0.4 s, gone at 3 s", () => {
    expect(tabAlpha(0)).toBe(1);
    expect(tabAlpha(TAB_LIFE_MS - TAB_FADE_MS)).toBe(1);
    expect(tabAlpha(TAB_LIFE_MS - TAB_FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(tabAlpha(TAB_LIFE_MS)).toBe(0);
    expect(tabAlpha(-1)).toBe(0);
  });

  it("a teammate's placement beyond 12 m is quieter; mine never is (D4)", () => {
    expect(placeVolume(false, 12, 0)).toBe(1);
    expect(placeVolume(false, 12.01, 0)).toBe(FAR_VOLUME);
    expect(placeVolume(false, 9, 9)).toBe(FAR_VOLUME); // 12.7 m
    expect(placeVolume(true, 100, 100)).toBe(1);
  });

  it("stale (a woken tab's backlog) or a hidden tab: no sound, haptic or dust (AC 6)", () => {
    expect(freshPlace(undefined, false)).toBe(true);
    expect(freshPlace(STALE_PLACE_S, false)).toBe(true);
    expect(freshPlace(STALE_PLACE_S + 0.05, false)).toBe(false);
    expect(freshPlace(0, true)).toBe(false);
  });

  it("owner colour: the 2.9 slot colours, grey for a player who left", () => {
    expect(ownerColor(1, SLOT_COLORS)).toBe(SLOT_COLORS[1]);
    expect(ownerColor(-1, SLOT_COLORS)).toBe(OWNER_LEFT_COLOR);
    expect(ownerColor(9, SLOT_COLORS)).toBe(OWNER_LEFT_COLOR);
  });
});

describe("Story 5.23 (review L2): one placed sound per kind per frame, mine first", () => {
  it("my own wins over a teammate's of the same kind, whatever the order; else the loudest; kinds are independent", () => {
    const p = new PlacedSoundPicker();
    const played: string[] = [];
    const play = (k: string, pan: number, vol: number) => played.push(`${k}:${pan}:${vol}`);
    p.offer("thunk", false, -1, 1);
    p.offer("thunk", true, 0, 1);
    p.offer("thunk", false, 1, 1);
    p.offer("clank", false, 0.5, FAR_VOLUME);
    p.offer("clank", false, -0.5, 1);
    p.flush(play);
    expect(played).toEqual(["thunk:0:1", "clank:-0.5:1"]);
    p.flush(play);
    expect(played).toHaveLength(2); // cleared
  });
  it("no survivor drawn: a teammate's placement is quiet (never full volume by default)", () => {
    expect(placeVolume(false, 0, 0, false)).toBe(FAR_VOLUME);
    expect(placeVolume(true, 0, 0, false)).toBe(1);
  });
});
