import { describe, expect, it } from "vitest";
import { C2S, INPUT_STICK_STEPS, NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, TICK_DT_S, loadBalance, type PlayerInput, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { GrenadeFlights } from "../render/grenadeFx";
import { MolotovFires } from "../render/molotovFx";

/**
 * Story 5.12 (AC 7, 8): the online client's consumables — the slot and count are the state's (never
 * the tap's), a throw's flight is its `grenade.launched` (with its item), the molotov zone is its
 * `molotov.ignited` (drawn from the render tick of the landing; a woken tab's stale one never shows).
 */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10, consumable: 2, consumableCount: 2 })]));
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
/** p1's molotov 4 (item 2 → wire 3) from (20.65, 10) to (28.65, 10), 14 ticks of flight. */
const thrown = (id: number, flight = 14): number[] => [NET_EVENT_KIND.GRENADE_LAUNCHED, 1, id, 2065, 1000, 2865, 1000, flight, 0, 3];
const ignited = (zone: number): number[] => [NET_EVENT_KIND.MOLOTOV_IGNITED, zone, 2, 2865, 1000, 1];

describe("NetSimHost: consumables (Story 5.12)", () => {
  it("re-review M: the tap frame's throw aim is sent (fire off) on the step that takes the flag, not the latest frame's", () => {
    const { room, host, setNow } = setup();
    const neutral = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: true, viewTick: -1 };
    room.sent.length = 0;
    let t = 500;
    host.setLocalInput({ ...neutral, aimX: 0.75, consumable: true }); // frame 1: the throw's encoding, fire dropped
    host.update(1 / 60);
    for (let i = 0; i < 3; i++) {
      host.setLocalInput({ ...neutral, aimX: 0.5, fire: true }); // frames 2…: the launcher's, fire held
      setNow((t += 1000 / 60));
      host.update(1 / 60);
    }
    host.update(0.05);
    const sent = room.inputsSent() as PlayerInput[];
    expect(sent.length).toBeGreaterThanOrEqual(2);
    const step = (v: number) => Math.round(v * INPUT_STICK_STEPS) / INPUT_STICK_STEPS; // Story 8.11: sent at 1/127 steps
    expect(sent[0]).toMatchObject({ consumable: true, aimX: step(0.75), fire: false });
    expect(sent[1]).toMatchObject({ consumable: false, aimX: step(0.5), fire: true });
  });

  it("re-review L: a medkit tap's own fire (held) is sent on the flagged step", () => {
    const { room, host } = setup();
    const held = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 1, fire: true, swap: false, consumable: false, isMouse: true, viewTick: -1 };
    room.sent.length = 0;
    host.setLocalInput({ ...held, consumable: true });
    host.update(1 / 60);
    host.setLocalInput(held);
    host.update(0.05);
    const sent = room.inputsSent() as PlayerInput[];
    expect(sent[0]).toMatchObject({ consumable: true, fire: true });
  });

  it("slot and count come from the state (index → id; 255 = empty)", () => {
    const { room, host } = setup();
    const me = host.world.players.get("p1")!;
    expect([me.consumable, me.consumableCount]).toEqual(["molotovs", 2]);
    const s = room.state.players.get("p1")!;
    s.consumableCount = 1;
    room.patch();
    host.update(0.05);
    expect(me.consumableCount).toBe(1);
    s.consumable = 255;
    s.consumableCount = 0;
    room.patch();
    host.update(0.05);
    expect([me.consumable, me.consumableCount]).toEqual([null, 0]);
  });

  it("a molotov flies from its event (bottle), lands, and its zone shows from the landing render tick for 4 s", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [thrown(4), [NET_EVENT_KIND.CONSUMABLE_USED, 1, 2]] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 26, events: [ignited(1)] } satisfies SimEventsFlushed); // landed on 25
    const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, "p1", 1);
    const fires = new MolotovFires(balance);
    let item = -1;
    let used = 0;
    let firstLive = Number.NaN;
    let lastLive = Number.NaN;
    for (let t = 11; t <= 140; t++) {
      setNow(500 + (t - 10) * 50 + RENDER_DELAY_TICKS * 50);
      room.state.tick = t + RENDER_DELAY_TICKS;
      room.patch();
      host.update(0.05);
      const nowS = host.renderTick * TICK_DT_S;
      for (const e of host.drainEvents() as SimEvent[]) {
        if (e.type === "grenade.launched") item = e.item ?? 0;
        if (e.type === "consumable.used") used++;
        flights.handle(e, nowS);
        fires.handle(e, nowS);
      }
      fires.update(nowS);
      if (fires.live.length > 0) {
        if (Number.isNaN(firstLive)) firstLive = host.renderTick;
        lastLive = host.renderTick;
      }
    }
    expect(item).toBe(3);
    expect(used).toBe(1);
    expect(flights.count).toBe(0); // the bottle ended at its fire
    expect(firstLive).toBeGreaterThanOrEqual(26);
    expect(firstLive).toBeLessThan(28);
    expect(lastLive - firstLive).toBeGreaterThanOrEqual(78);
    expect(lastLive - firstLive).toBeLessThanOrEqual(80);
    expect(fires.live.length).toBe(0);
  });

  it("a hidden tab asleep past a zone's life wakes with no ghost fire", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 26, events: [ignited(5)] } satisfies SimEventsFlushed);
    const WAKE = 200;
    for (let t = 11; t <= WAKE + RENDER_DELAY_TICKS; t++) {
      setNow(500 + (t - 10) * 50);
      room.state.tick = t;
      room.patch();
    }
    setNow(500 + (WAKE + RENDER_DELAY_TICKS - 10) * 50);
    host.update(0);
    const fires = new MolotovFires(balance);
    const events = host.drainEvents() as SimEvent[];
    expect(events.some((e) => e.type === "molotov.ignited")).toBe(true); // liveness: the backlog held it
    for (const e of events) fires.handle(e, 100);
    expect(fires.live.length).toBe(0);
  });
});
