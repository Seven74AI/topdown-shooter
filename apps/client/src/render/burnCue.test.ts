import { describe, expect, it } from "vitest";
import type { SimEvent } from "@topdown/shared";
import { FIRE_CUE_MS, FireCue } from "./fireCue";
import { EDGE_GLOW_MAX, EDGE_GLOW_MIN, FIRE_HIT_QUEUE, FIRE_POP_MS, FIRE_POP_POOL, PopPool, bodyFlameSpot, edgeGlowAlpha, fireDamageLabel, routeFireHit } from "./burnCue";

const fireHit = (playerId: string, amount = 5): SimEvent => ({ type: "player.damaged", playerId, amount, sourceZombieId: -1 });
const bite = (playerId: string): SimEvent => ({ type: "player.damaged", playerId, amount: 10, sourceZombieId: 3 });
const queue = () => ({ fireHitAmounts: new Float32Array(FIRE_HIT_QUEUE), fireHitCount: 0 });

describe("Story 4.11: burning cues from the server's fire events", () => {
  it("the number is the event's amount, rounded up like the HP display; labels are cached", () => {
    expect(fireDamageLabel(5)).toBe("-5");
    expect(fireDamageLabel(4.2)).toBe("-5");
    expect(fireDamageLabel(5.0000000001)).toBe("-5"); // net quantisation noise does not round up
    expect(fireDamageLabel(10)).toBe("-10");
    expect(fireDamageLabel(5)).toBe(fireDamageLabel(5));
  });

  it("a fire hit marks that player burning; only MY hits queue a number (teammates show flames only); bites do nothing", () => {
    const cue = new FireCue();
    const q = queue();
    expect(routeFireHit(fireHit("p1"), "p0", 1000, cue, q)).toBe(true);
    expect(cue.burning("p1", 1000)).toBe(true);
    expect(q.fireHitCount).toBe(0);
    expect(routeFireHit(fireHit("p0", 5), "p0", 1000, cue, q)).toBe(true);
    expect(q.fireHitCount).toBe(1);
    expect(q.fireHitAmounts[0]).toBe(5);
    expect(routeFireHit(bite("p0"), "p0", 1100, cue, q)).toBe(false);
    expect(q.fireHitCount).toBe(1);
    expect(routeFireHit({ type: "wave.started", number: 2 } as SimEvent, "p0", 1100, cue, q)).toBe(false);
  });

  it("a burst (a woken tab) never overflows the HUD queue", () => {
    const cue = new FireCue();
    const q = queue();
    for (let i = 0; i < 20; i++) routeFireHit(fireHit("p0"), "p0", 1000, cue, q);
    expect(q.fireHitCount).toBe(FIRE_HIT_QUEUE);
  });

  it("the cue ends 0.7 s after the last hit; the glow is mine only, 0 when not burning, pulsing inside its range", () => {
    const cue = new FireCue();
    cue.hit("p0", 1000);
    expect(cue.burning("p0", 1000 + FIRE_CUE_MS - 1)).toBe(true);
    expect(cue.burning("p0", 1000 + FIRE_CUE_MS)).toBe(false);
    expect(cue.sinceLastHit("p0", 1250)).toBe(250);
    expect(cue.sinceLastHit("nobody", 1250)).toBe(Infinity);
    expect(edgeGlowAlpha(false, 0, 500)).toBe(0);
    const peak = edgeGlowAlpha(true, 0, 500);
    expect(peak).toBeCloseTo(EDGE_GLOW_MAX, 9);
    const low = edgeGlowAlpha(true, 480, 500);
    expect(low).toBeLessThan(peak);
    expect(low).toBeGreaterThan(EDGE_GLOW_MIN * 0.7 - 1e-9);
  });

  it("pop pool: fixed capacity, free slots first, the oldest reused when full, gone after its life", () => {
    const pool = new PopPool(FIRE_POP_POOL);
    const slots = new Set<number>();
    for (let i = 0; i < FIRE_POP_POOL; i++) slots.add(pool.spawn(1000 + i, 5));
    expect(slots.size).toBe(FIRE_POP_POOL);
    expect(pool.spawn(1100, 5)).toBe(0); // all busy: slot 0 is the oldest
    expect(pool.spawn(1101, 5)).toBe(1);
    expect(pool.alive(2, 1002 + FIRE_POP_MS - 1)).toBe(true);
    expect(pool.alive(2, 1002 + FIRE_POP_MS)).toBe(false);
    expect(pool.spawn(1002 + FIRE_POP_MS, 5)).toBe(2); // the first free slot
    pool.clear();
    for (let i = 0; i < FIRE_POP_POOL; i++) expect(pool.alive(i, 5000)).toBe(false);
  });

  it("body flames stay on the body", () => {
    const out = { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) {
      bodyFlameSpot(i, 3, 1.23, 0.4, out);
      expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(0.4);
    }
  });
});
