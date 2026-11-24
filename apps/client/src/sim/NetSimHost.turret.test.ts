import { describe, expect, it } from "vitest";
import { NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, loadBalance, quantizeHeading, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
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
  // Story 4.2: the open street (on Downtown (15.5, 5.5) is inside the apartments, whose walls stop the shot).
  const host = new NetSimHost({ balance, session, now: () => now, map: PLACEHOLDER_MAP });
  // A turret with its min corner at (15, 5): centre (15.5, 5.5). Owned by p0 (not me).
  room.state.buildings.set("4", { type: "auto_turret", owner: "p0", gx: 30, gy: 10, rot: 0, hp: 300, trap: 0 });
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

  it("review L1: after a backlog, turret and teammates' shots older than the render tick − 10 are dropped (aim still turns), newer ones play", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, {
      tick: 11,
      events: [
        [NET_EVENT_KIND.TURRET_FIRED, 4, quantizeHeading(0, 1)],
        [NET_EVENT_KIND.WEAPON_FIRED, 0, 0, 1000, 500, 0], // p0's (a teammate's) shot
        [NET_EVENT_KIND.WAVE_RUSH_STARTED, 5],
      ],
    } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, {
      tick: 28,
      events: [
        [NET_EVENT_KIND.TURRET_FIRED, 4, quantizeHeading(-1, 0)],
        [NET_EVENT_KIND.WEAPON_FIRED, 0, 0, 1000, 500, 0],
      ],
    } satisfies SimEventsFlushed);
    for (let t = 11; t <= 30 + RENDER_DELAY_TICKS; t++) {
      setNow(500 + (t - 10) * 50); // the server keeps ticking (a hidden tab: nothing drained)
      room.state.tick = t;
      room.patch();
    }
    setNow(500 + (30 + RENDER_DELAY_TICKS - 10) * 50); // render tick 30: tick 11 is stale, 28 is not
    host.update(0);
    expect(host.renderTick).toBeCloseTo(30, 0);
    const types = host.drainEvents().map((e) => e.type);
    expect(types).toEqual(["wave.rush_started", "turret.fired", "weapon.fired"]);
    expect(host.world.projectiles.aliveCount).toBe(2); // one turret shot + one teammate shot, from tick 28
    const b = host.world.buildings.list[0];
    expect(b?.aimX).toBeCloseTo(-1, 6);
  });
});
