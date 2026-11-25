import { describe, expect, it } from "vitest";
import {
  BYTES,
  HORDE_MAX_FRAME_BYTES,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  S2C,
  ZOMBIE_STATE,
  hordeFrameBytes,
  loadBalance,
  packTypeState,
  weaponIds,
  wireState,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
  type SimEvent,
  type SimEventsFlushed,
} from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { isFireHit } from "../render/fireCue";

/**
 * Story 5.4 (AC 14, brief lines 2/11/14): the client's mirror shows burning zombies from the horde's
 * burning bit, remote cones from the burst events (with the lost-event fallback on the synced fuel),
 * my own cone at once from the fire clock, and friendly fire as the server's `player.damaged`.
 */
const balance = loadBalance();
const FT = weaponIds(balance).indexOf("flamethrower");

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10, weapon0: "flamethrower", ammo0: 120 }), fakePlayer(1, { x: 20, y: 10, weapon0: "flamethrower", ammo0: 120 })]));
  let now = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  /** Drains like GameScene: every event goes to the flame cues. */
  const drain = (): SimEvent[] => {
    const evs = [...host.drainEvents()];
    for (const e of evs) host.flames.handle(e);
    return evs;
  };
  return {
    room,
    host,
    drain,
    setNow: (ms: number) => (now = ms),
    arrive(tick: number, update: (s: FakeRoom["state"]) => void = () => {}) {
      room.state.tick = tick;
      update(room.state);
      room.patch();
    },
  };
}

const scratch = new Uint8Array(HORDE_MAX_FRAME_BYTES);
const view = new DataView(scratch.buffer);
function frame(tick: number, zs: { netId: number; x: number; burning: boolean }[]): Uint8Array {
  writeHordeHeader(view, tick, zs.length);
  zs.forEach((z, i) => writeHordeRecord(view, i, z.netId, z.x, 5, 0, packTypeState(0, wireState(ZOMBIE_STATE.CHASE, z.burning))));
  return scratch.slice(0, hordeFrameBytes(zs.length));
}

describe("NetSimHost flames (Story 5.4)", () => {
  it("the mirror shows burning zombies from the horde record's burning bit (client-only flag, the state stays CHASE)", () => {
    const { host, room, arrive, setNow } = setup();
    const A = zombieNetId(3, 1);
    const B = zombieNetId(4, 1);
    for (let t = 10; t <= 12; t++) {
      setNow(500 + t * 50);
      room.deliver(BYTES.HORDE_FRAME, frame(t, [{ netId: A, x: 5, burning: true }, { netId: B, x: 6, burning: false }]));
      arrive(t);
    }
    setNow(500 + (11 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    const z = host.world.zombies;
    expect(z.aliveCount).toBe(2);
    expect(z.igniteTicks[3]).toBe(1);
    expect(z.igniteTicks[4]).toBe(0);
    expect(z.state[3]).toBe(ZOMBIE_STATE.CHASE);
  });

  it("a remote cone: on at flame_started, off at flame_stopped", () => {
    const t = setup();
    let ammo = 120;
    for (let tick = 10; tick <= 20; tick++) {
      t.setNow(500 + tick * 50);
      t.arrive(tick, (s) => {
        const p0 = s.players.get("p0");
        if (p0 && tick >= 12) p0.ammo0 = --ammo;
      });
      if (tick === 12) t.room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [[NET_EVENT_KIND.FLAME_STARTED, 0, FT]] } satisfies SimEventsFlushed);
    }
    t.setNow(500 + (14 + RENDER_DELAY_TICKS) * 50);
    t.host.update(0);
    t.drain();
    expect(t.host.flames.flaming("p0")).toBe("flamethrower");
    t.room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 21, events: [[NET_EVENT_KIND.FLAME_STOPPED, 0]] } satisfies SimEventsFlushed);
    t.setNow(500 + 21 * 50); // Story 8.9: on time (a late patch now raises the render delay)
    t.arrive(21);
    t.setNow(500 + (21 + RENDER_DELAY_TICKS) * 50);
    t.host.update(0);
    t.drain();
    expect(t.host.flames.flaming("p0")).toBe("");
  });

  it("BtR 10: flame_stopped DROPPED → the remote cone ends within 3 patches of the fuel no longer falling", () => {
    const t = setup();
    let ammo = 120;
    for (let tick = 10; tick <= 30; tick++) {
      t.setNow(500 + tick * 50);
      t.arrive(tick, (s) => {
        const p0 = s.players.get("p0");
        if (p0 && tick >= 12 && tick < 22) p0.ammo0 = --ammo; // flames ticks 12–21, then releases
      });
      if (tick === 12) t.room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 12, events: [[NET_EVENT_KIND.FLAME_STARTED, 0, FT]] } satisfies SimEventsFlushed);
      t.host.update(0);
      t.drain();
      if (tick === 16) expect(t.host.flames.flaming("p0")).toBe("flamethrower");
      if (tick >= 25) expect(t.host.flames.flaming("p0"), `tick ${tick}`).toBe("");
    }
  });

  it("my own cone shows on the step I press fire (no round trip), from my predicted fuel", () => {
    const t = setup();
    t.arrive(1);
    t.host.update(0);
    expect(t.host.flames.flaming("p1")).toBe("");
    t.host.setLocalInput({ ...NEUTRAL_INPUT, aimX: 0, aimY: 1, fire: true });
    t.setNow(50);
    t.host.update(0.05);
    expect(t.host.flames.flaming("p1")).toBe("flamethrower");
    expect(t.host.flames.localDir).toEqual({ x: 0, y: 1 });
    // no cosmetic projectile and no local weapon.fired for a flame tick
    expect(t.drain().filter((e) => e.type === "weapon.fired")).toEqual([]);
    expect(t.host.world.players.get("p1")?.loadout.slots[0].ammo).toBe(119); // the HUD's fuel follows the fire clock
    t.host.setLocalInput({ ...NEUTRAL_INPUT, aimX: 0, aimY: 1, fire: false });
    t.setNow(100);
    t.host.update(0.05);
    expect(t.host.flames.flaming("p1")).toBe("");
  });

  it("friendly fire arrives as the server's player.damaged (fire, source player): the burn cue and the source travel; HP is the server's", () => {
    const t = setup();
    t.setNow(500);
    t.arrive(5, (s) => {
      const me = s.players.get("p1");
      if (me) me.hp = 95;
    });
    t.room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 5, events: [[NET_EVENT_KIND.PLAYER_DAMAGED, 1, 50, -1, 3, 0]] } satisfies SimEventsFlushed);
    t.setNow(1000);
    t.host.update(0.05);
    const hit = t.drain().find(isFireHit);
    expect(hit).toMatchObject({ playerId: "p1", amount: 5, tag: "fire", sourcePlayerId: "p0", sourceZombieId: -1 });
    expect(t.host.world.players.get("p1")?.hp).toBe(95);
  });
});
