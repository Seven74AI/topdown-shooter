import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, TICK_DT_S, loadBalance, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { GrenadeFlights, STALE_EXPLOSION_S, type RoundPose } from "../render/grenadeFx";

/**
 * Story 5.5 (AC 15): the NetSimHost mirror of rounds. A teammate's round (server events only) lands
 * at the server's point on the server's tick (in render time), its explosion arrives once at the
 * render tick of the burst; a woken tab's backlog across a build start shows no ghost round or blast.
 */
const balance = loadBalance();
const lostS = balance.combat.explosion.fx.lostEventTicks * TICK_DT_S;

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
/** p0's round 5 from (10.5, 10) to (18.25, 10.5), 9 ticks of flight (launched on tick T − 1, flushed with tick T). */
const launched = (id: number, flight = 9): number[] => [NET_EVENT_KIND.GRENADE_LAUNCHED, 0, id, 1050, 1000, 1825, 1050, flight];
const exploded = (id: number): number[] => [NET_EVENT_KIND.EXPLOSION_HAPPENED, 0, 1825, 1050, 200, 0, id];
const pose: RoundPose = { x: 0, y: 0, z: 0, heading: 0, landed: false };

describe("NetSimHost: lobbed rounds (Story 5.5)", () => {
  it("a teammate's round lands at the server's point and tick; its explosion is drawn once at the burst's render tick", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [launched(5)] } satisfies SimEventsFlushed); // launched on 11, lands on 20
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 21, events: [exploded(5)] } satisfies SimEventsFlushed); // burst on 20
    const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, "p1", lostS);
    let launchedAt = Number.NaN;
    let landTick = Number.NaN;
    let explodedAt = Number.NaN;
    let blasts = 0;
    for (let t = 11; t <= 40; t++) {
      setNow(500 + (t - 10) * 50 + RENDER_DELAY_TICKS * 50);
      room.state.tick = t + RENDER_DELAY_TICKS;
      room.patch();
      host.update(0.05);
      const nowS = host.renderTick * TICK_DT_S;
      for (const e of host.drainEvents() as SimEvent[]) {
        if (e.type === "grenade.launched") {
          launchedAt = host.renderTick;
          landTick = e.landTick;
          expect(e.tx).toBeCloseTo(18.25, 9);
          expect(e.ty).toBeCloseTo(10.5, 9);
        }
        if (e.type === "explosion.happened") {
          explodedAt = host.renderTick;
          blasts++;
          expect((e.ageS ?? 0) <= STALE_EXPLOSION_S).toBe(true);
        }
        flights.handle(e, nowS);
      }
      flights.update(nowS);
      if (flights.count === 1) {
        flights.pose(0, nowS, 1.5, pose);
        // drawn from its flush tick (launch + 1) like every event: it lands on render tick 20 + 1, the burst flush
        if (host.renderTick > 21) expect(pose.landed).toBe(true);
        if (host.renderTick < 20) expect(pose.landed).toBe(false);
      }
    }
    expect(landTick).toBe(20); // the absolute server landing tick, rebuilt from the flush tick
    expect(launchedAt).toBeLessThan(explodedAt);
    expect(explodedAt).toBeGreaterThanOrEqual(21);
    expect(blasts).toBe(1);
    expect(flights.count).toBe(0);
  });

  it("a hidden tab asleep across a launch and a build start wakes with no round and no fresh blast", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 100, events: [launched(7, 12)] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 104, events: [[NET_EVENT_KIND.BUILD_STARTED, 3]] } satisfies SimEventsFlushed); // the pool is cleared: no burst follows
    const WAKE = 200;
    for (let t = 11; t <= WAKE + RENDER_DELAY_TICKS; t++) {
      setNow(500 + (t - 10) * 50);
      room.state.tick = t;
      room.patch();
    }
    setNow(500 + (WAKE + RENDER_DELAY_TICKS - 10) * 50);
    host.update(0);
    const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, "p1", lostS);
    const nowS = 100;
    const events = host.drainEvents() as SimEvent[];
    expect(events.some((e) => e.type === "grenade.launched")).toBe(true); // liveness: the backlog really held the launch
    for (const e of events) flights.handle(e, nowS);
    flights.update(nowS);
    expect(flights.count).toBe(0);
    expect(events.filter((e) => e.type === "explosion.happened")).toHaveLength(0);
  });

  it("a lost explosion event: the round is hidden lostEventTicks after its landing", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [launched(9)] } satisfies SimEventsFlushed);
    const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, "p1", lostS);
    let maxCount = 0;
    for (let t = 11; t <= 60; t++) {
      setNow(500 + (t - 10) * 50 + RENDER_DELAY_TICKS * 50);
      room.state.tick = t + RENDER_DELAY_TICKS;
      room.patch();
      host.update(0.05);
      const nowS = host.renderTick * TICK_DT_S;
      for (const e of host.drainEvents() as SimEvent[]) flights.handle(e, nowS);
      flights.update(nowS);
      maxCount = Math.max(maxCount, flights.count);
      if (host.renderTick > 20 + balance.combat.explosion.fx.lostEventTicks + 1) expect(flights.count).toBe(0);
    }
    expect(maxCount).toBe(1);
  });
});
