import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, S2C, loadBalance, quantizeHeading, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";

/** Story 3.6: a turret's shot from `turret.fired` (id + heading): muzzle at the mirror building, aim turned, a cosmetic shot. */
const balance = loadBalance();
const T = balance.buildings.types["auto_turret"]?.turret as { muzzleM: number; projectileSpeedMps: number };

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
  room.state.phase = "wave";
  let now = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  // A turret with its min corner at (15, 5): centre (15.5, 5.5). Owned by p0 (not me).
  room.state.buildings.set("4", { type: "auto_turret", owner: "p0", gx: 30, gy: 10, rot: 0, hp: 300 });
  now = 500;
  room.state.tick = 10;
  room.patch();
  host.update(0);
  return { room, host, setNow: (ms: number) => (now = ms) };
}

describe("NetSimHost turret shots (Story 3.6)", () => {
  it("turret.fired at the render tick: muzzle from the building, its aim turned, a cosmetic projectile tagged with it", () => {
    const { room, host, setNow } = setup();
    const b = host.world.buildings.list[0];
    expect(b?.type).toBe("auto_turret");
    expect([b?.aimX, b?.aimY]).toEqual([1, 0]);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 11, events: [[NET_EVENT_KIND.TURRET_FIRED, 4, quantizeHeading(0, 1)]] } satisfies SimEventsFlushed);
    setNow(500 + (11 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    const events = host.drainEvents() as SimEvent[];
    const shot = events.find((e) => e.type === "turret.fired");
    expect(shot).toMatchObject({ buildingId: 4 });
    if (shot?.type !== "turret.fired") return;
    expect(shot.x).toBeCloseTo(15.5, 6);
    expect(shot.y).toBeCloseTo(5.5 + T.muzzleM, 6);
    expect(b?.aimX).toBeCloseTo(0, 6);
    expect(b?.aimY).toBeCloseTo(1, 6);
    const pool = host.world.projectiles;
    expect(pool.aliveCount).toBe(1);
    const id = pool.aliveIds[0] as number;
    expect(pool.building[id]).toBe(4);
    expect(pool.owner[id]).toBeNull(); // never "mine": the reversed-hit check ignores it
    expect(pool.speedMps[id]).toBe(T.projectileSpeedMps);
    host.update(0.1);
    expect(pool.y[id]).toBeGreaterThan(shot.y); // it flies
  });

  it("a turret.fired for a building the mirror doesn't have draws nothing (x/y stay NaN)", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 11, events: [[NET_EVENT_KIND.TURRET_FIRED, 99, 0]] } satisfies SimEventsFlushed);
    setNow(500 + (11 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    const shot = host.drainEvents().find((e) => e.type === "turret.fired");
    expect(shot?.type === "turret.fired" && Number.isNaN(shot.x)).toBe(true);
    expect(host.world.projectiles.aliveCount).toBe(0);
  });
});
