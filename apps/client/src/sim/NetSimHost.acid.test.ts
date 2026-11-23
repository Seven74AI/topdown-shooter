import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, NET_NONE, PLACEHOLDER_MAP, S2C, TICK_DT_S, loadBalance, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { ACID_SOUND_MAX_AGE_S, AcidFx } from "../render/acidFx";

/**
 * Story 5.6 review M1 (AC 18): a tab hidden mid-wave (no build start) wakes to a backlog of spits and
 * splashes. Stale globs are dropped; each splash starts as old as it is, and splashes older than a
 * puddle's life are dropped, so the client's puddles are exactly the server's live ones, and no
 * backlog event is young enough to play a sound.
 */
const balance = loadBalance();
const spit = balance.zombies.types.spitter?.spit;
if (!spit) throw new Error("no spit");
const PUDDLE_TICKS = Math.round(spit.puddleS / TICK_DT_S); // 60

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
  room.state.phase = "wave";
  let now = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now, map: PLACEHOLDER_MAP });
  now = 500;
  room.state.tick = 10;
  room.patch();
  host.update(0);
  return { room, host, setNow: (ms: number) => (now = ms) };
}

const spat = (id: number): number[] => [NET_EVENT_KIND.SPITTER_SPAT, 3, id, 1000, 1000, 1400, 1000];
const splash = (id: number): number[] => [NET_EVENT_KIND.ACID_SPLASHED, id, 1400, 1000, NET_NONE];

describe("NetSimHost: spits and puddles after a hidden tab (Story 5.6 review M1)", () => {
  it("wakes with exactly the server's live puddles, back-dated, no stale globs, no sounds", () => {
    const { room, host, setNow } = setup();
    // Server timeline: spit+splash at ticks 11/12 (long gone by tick 200), 150/151 (alive), a fresh spit at 196.
    const timeline: [number, number[][]][] = [
      [11, [spat(1)]],
      [12, [splash(1)]],
      [150, [spat(2)]],
      [151, [splash(2)]],
      [196, [spat(3)]],
    ];
    for (const [tick, events] of timeline) room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick, events } satisfies SimEventsFlushed);
    const WAKE = 200;
    for (let t = 11; t <= WAKE + RENDER_DELAY_TICKS; t++) {
      setNow(500 + (t - 10) * 50); // hidden: the server keeps ticking, nothing drained
      room.state.tick = t;
      room.patch();
    }
    setNow(500 + (WAKE + RENDER_DELAY_TICKS - 10) * 50);
    host.update(0);
    expect(host.renderTick).toBeCloseTo(WAKE, 0);
    const events = host.drainEvents() as SimEvent[];
    // Splashes older than a puddle's life never leave the host (they could evict live puddles at the cap).
    expect(events.filter((e) => e.type === "acid.splashed").map((e) => (e.type === "acid.splashed" ? e.puddleId : -1))).toEqual([2]);
    const fx = new AcidFx(balance.zombies.spitCaps.maxLiveSpits, balance.zombies.spitCaps.maxLivePuddles, spit.speedMps, spit.puddleS);
    const nowS = 1000;
    let sounds = 0;
    for (const e of events) {
      fx.handle(e, nowS);
      if ((e.type === "spitter.spat" || e.type === "acid.splashed") && (e.ageS ?? 0) <= ACID_SOUND_MAX_AGE_S) sounds++;
    }
    fx.update(nowS);
    // The server's live puddles at tick 200: born after 200 − 60 → only puddle 2.
    const serverLive = [12, 151].filter((born) => WAKE - born < PUDDLE_TICKS).length;
    expect(fx.puddleCount).toBe(serverLive);
    expect(Array.from(fx.puddleId).filter((id) => id !== -1)).toEqual([2]);
    // Puddle 2 ends with the server's (at tick 211), not 3 s after the wake.
    fx.update(nowS + (151 + PUDDLE_TICKS - WAKE) * TICK_DT_S + 0.01);
    expect(fx.puddleCount).toBe(0);
    // Globs: 1 and 2 are stale (dropped); 3 is 4 ticks old (kept, already 0.2 s into its flight).
    expect(events.filter((e) => e.type === "spitter.spat").map((e) => (e.type === "spitter.spat" ? e.spitId : -1))).toEqual([3]);
    expect(sounds).toBe(1); // only spit 3 (0.2 s old) may sound
  });
});
