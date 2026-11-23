import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, loadBalance, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { bruteSpawnCue, type BruteCue } from "../render/bruteCue";

/**
 * Story 5.7 (AC 4, brief line 14): `zombie.brute_spawned` reaches the client decoded, the banner
 * shows once per run (the first Brute only), and a hidden tab that sleeps across the wave-5 Brute
 * spawn wakes without a late banner or roar (Beat the rule 9). The knock fields of the local player
 * are mirrored from schema.
 */
const balance = loadBalance();
const view = { x: 0, y: 0, width: 24, height: 12 };

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
const spawned = (slot: number, first: boolean): number[] => [NET_EVENT_KIND.BRUTE_SPAWNED, slot | (2 << 8), 60, 3140, first ? 1 : 0];

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

describe("NetSimHost: the Brute's spawn cue (Story 5.7)", () => {
  it("decoded with its zombie slot; banner once per run, roar for each", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [spawned(5, true)] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 40, events: [spawned(9, false)] } satisfies SimEventsFlushed);
    const events = playTo(room, host, setNow, 11, 40 + RENDER_DELAY_TICKS + 2, true).filter((e) => e.type === "zombie.brute_spawned");
    expect(events.map((e) => e.type === "zombie.brute_spawned" && [e.zombieId, e.x, e.y, e.first])).toEqual([
      [5, 0.6, 31.4, true],
      [9, 0.6, 31.4, false],
    ]);
    const cue: BruteCue = { roar: false, banner: false, pan: 0 };
    const banners = events.filter((e) => e.type === "zombie.brute_spawned" && bruteSpawnCue(e, view, cue).banner).length;
    const roars = events.filter((e) => e.type === "zombie.brute_spawned" && bruteSpawnCue(e, view, cue).roar).length;
    expect([banners, roars]).toEqual([1, 2]);
  });

  it("a tab hidden across the Brute's spawn wakes with no late banner and no roar", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 20, events: [spawned(5, true)] } satisfies SimEventsFlushed);
    const events = playTo(room, host, setNow, 11, 200 + RENDER_DELAY_TICKS, false).filter((e) => e.type === "zombie.brute_spawned");
    expect(events).toHaveLength(1); // delivered once…
    const cue: BruteCue = { roar: false, banner: false, pan: 0 };
    const e = events[0] as Extract<SimEvent, { type: "zombie.brute_spawned" }>;
    expect(e.ageS).toBeGreaterThan(5);
    expect(bruteSpawnCue(e, view, cue)).toMatchObject({ roar: false, banner: false }); // …but stale: shown as the Brute itself
  });

  it("mirrors the local player's knock fields from schema", () => {
    const { room, host, setNow } = setup();
    const me = room.state.players.get("p1");
    if (!me) throw new Error("no p1");
    Object.assign(me, { knockTicks: 3, knockDx: 127, knockDy: 0, knockStepMm: 375 });
    playTo(room, host, setNow, 11, 12, true);
    const p = host.world.players.get("p1");
    expect([p?.knockTicks, p?.knockDx, p?.knockDy, p?.knockStepMm]).toEqual([3, 127, 0, 375]);
  });
});
