import { describe, expect, it } from "vitest";
import { getMessageBytes, Protocol } from "@colyseus/core";
import { GHOST_KEEPALIVE_MS, GHOST_MIN_INTERVAL_MS, S2C, buildingTypeIds, loadBalance, type BuildingGhosted } from "@topdown/shared";

const balance = loadBalance();
const BUILD_S = 30;
/** ux-spec §11's budget for teammate ghosts, per receiver over a 30 s build. */
const BUDGET_BPS = 0.4 * 1024;

/** One `building.ghosted` frame as Colyseus 0.18 writes it to a socket (type string + msgpack payload). */
const frameBytes = (g: BuildingGhosted): number => getMessageBytes.raw(Protocol.ROOM_DATA, S2C.BUILDING_GHOSTED, g).byteLength;

describe("teammate ghost bandwidth (Story 5.24, AC 7, brief 11)", () => {
  it("worst case: 3 teammates moving their ghosts the whole build at 4 Hz stays ≤ 0.4 KB/s per receiver", () => {
    const lastType = buildingTypeIds(balance).length - 1;
    // the largest numbers each field can carry (msgpack grows with the value)
    const big = frameBytes([3, lastType, 255, 255, 3]);
    const clear = frameBytes([3, -1, 0, 0, 0]);
    const perSecond = 1000 / GHOST_MIN_INTERVAL_MS;
    const worstBps = (3 * perSecond * BUILD_S * big) / BUILD_S;
    const stillBps = (3 * (1000 / GHOST_KEEPALIVE_MS) * big); // everyone holding still: keepalives only
    console.log(`[5.24 bandwidth] frame ${big} B (clear ${clear} B); worst ${worstBps.toFixed(0)} B/s, still ${stillBps.toFixed(0)} B/s per receiver; budget ${BUDGET_BPS} B/s`);
    expect(big).toBeLessThanOrEqual(32);
    expect(worstBps).toBeLessThanOrEqual(BUDGET_BPS);
    expect(stillBps).toBeLessThan(worstBps);
  });
});
