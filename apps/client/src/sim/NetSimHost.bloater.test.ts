import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, ZOMBIE_STATE, ZOMBIE_TYPES, loadBalance, packTypeState, stateOfTypeState, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { BloaterFx } from "../render/bloaterFx";

/**
 * Story 5.8 (AC 13, brief line 14): `bloater.swell_started` and `bloater.burst` reach the client
 * decoded and aged; the cosmetic cloud comes from the burst event only (no cloud state on the wire)
 * and lives `gasS`; a hidden tab that slept across a burst (or a build start) wakes with no ghost
 * cloud. The swell is also the zombie's streamed state (the horde nibble: SWELL = 5 fits beside
 * the type index, under 5.4's burning bit).
 */
const balance = loadBalance();
const EX = balance.zombies.types.bloater?.explodes as NonNullable<NonNullable<typeof balance.zombies.types.bloater>["explodes"]>;

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

function playTo(room: FakeRoom, host: NetSimHost, setNow: (ms: number) => void, from: number, to: number, drain: boolean): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t++) {
    setNow(500 + (t - 10) * 50);
    room.state.tick = t;
    room.patch();
    if (drain) {
      host.update(0.05);
      out.push(...(host.drainEvents() as SimEvent[]).map((e) => ({ ...e })));
    }
  }
  if (!drain) {
    host.update(0);
    out.push(...(host.drainEvents() as SimEvent[]).map((e) => ({ ...e })));
  }
  return out;
}

describe("NetSimHost: Bloater swell and burst (Story 5.8)", () => {
  it("decodes the swell (zombie slot, point) and the burst (point, chain); the cloud comes from the burst event and ends after gasS", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [[NET_EVENT_KIND.BLOATER_SWELL_STARTED, 7 | (3 << 8), 1234, 560]] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 32, events: [[NET_EVENT_KIND.BLOATER_BURST, 1234, 560, 0], [NET_EVENT_KIND.BLOATER_BURST, 1500, 560, 1]] } satisfies SimEventsFlushed);
    const events = playTo(room, host, setNow, 11, 32 + RENDER_DELAY_TICKS + 2, true).filter((e) => e.type === "bloater.swell_started" || e.type === "bloater.burst");
    expect(events.map((e) => (e.type === "bloater.swell_started" ? ["swell", e.zombieId, e.x, e.y] : e.type === "bloater.burst" ? ["burst", e.x, e.y, e.chain] : []))).toEqual([
      ["swell", 7, 12.34, 5.6],
      ["burst", 12.34, 5.6, false],
      ["burst", 15, 5.6, true],
    ]);
    const fx = new BloaterFx(balance.zombies.blasts.maxGasClouds, balance.controls.fx.maxBloaterParticles, EX.gasRadiusM, EX.gasS);
    for (const e of events) fx.handle(e, 0);
    expect(fx.cloudCount).toBe(2);
    fx.update(EX.gasS + 0.01);
    expect(fx.cloudCount).toBe(0);
  });

  it("a tab hidden across a burst wakes with no ghost cloud; one hidden across a build start shows nothing stale", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 20, events: [[NET_EVENT_KIND.BLOATER_BURST, 1000, 1000, 0]] } satisfies SimEventsFlushed);
    const events = playTo(room, host, setNow, 11, 200 + RENDER_DELAY_TICKS, false).filter((e) => e.type === "bloater.burst");
    expect(events).toHaveLength(1);
    const e = events[0] as Extract<SimEvent, { type: "bloater.burst" }>;
    expect(e.ageS).toBeGreaterThan(EX.gasS);
    const fx = new BloaterFx(24, 240, EX.gasRadiusM, EX.gasS);
    expect(fx.handle(e, 100)).toBe(false);
    expect(fx.cloudCount).toBe(0);
    fx.handle({ type: "bloater.burst", x: 1, y: 1, chain: false }, 100);
    fx.handle({ type: "build.started", wave: 6 }, 100.1);
    expect(fx.cloudCount).toBe(0);
  });

  it("SWELL rides the horde stream's state nibble next to every type (≤ 7: 5.4's burning bit stays free)", () => {
    expect(ZOMBIE_STATE.SWELL).toBeLessThanOrEqual(7);
    for (let t = 0; t < ZOMBIE_TYPES.length; t++) expect(stateOfTypeState(packTypeState(t, ZOMBIE_STATE.SWELL))).toBe(ZOMBIE_STATE.SWELL);
  });
});
