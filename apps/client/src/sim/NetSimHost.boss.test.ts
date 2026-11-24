import { describe, expect, it } from "vitest";
import { BOSS_STATE, NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, loadBalance, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakeBoss, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { telegraphProgress, type TelegraphLook } from "../render/bossTelegraph";
import { bossCue, type BossCue } from "../render/bossCue";

/**
 * Story 6.5 (F3, brief 14, 21b): the client draws a boss telegraph from the server's start tick.
 * The mirror copies the boss record from state; `serverTick` is the clock's estimate (not the
 * delayed render tick); a late event, a woken tab and a late Game scene all show the right fill.
 */
const balance = loadBalance();

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

/** Plays server ticks from..to (a patch each 50 ms), updating the host each frame when `live`. */
function playTo(room: FakeRoom, host: NetSimHost, setNow: (ms: number) => void, from: number, to: number, live: boolean, each?: (t: number) => void): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t++) {
    setNow(500 + (t - 10) * 50);
    room.state.tick = t;
    each?.(t);
    room.patch();
    if (live) {
      host.update(0.05);
      out.push(...(host.drainEvents() as SimEvent[]).map((e) => ({ ...e })));
    }
  }
  if (!live) {
    host.update(0);
    out.push(...(host.drainEvents() as SimEvent[]).map((e) => ({ ...e })));
  }
  return out;
}

const look: TelegraphLook = { progress: 0, visible: false, alpha: 0 };

describe("NetSimHost: the Behemoth (Story 6.5)", () => {
  it("mirrors the boss record from state (position, hp, target slot, the attack's ticks and zone)", () => {
    const { room, host, setNow } = setup();
    room.state.boss = fakeBoss({ state: BOSS_STATE.TELEGRAPH, x: 12, y: 8, hp: 4000, maxHp: 4800, number: 1, look: 2, target: 1, atkId: 3, atkKind: 1, atkStart: 30, atkHit: 54, atkX: 12, atkY: 8, atkR: 4.5 });
    playTo(room, host, setNow, 11, 31, true);
    const b = host.world.boss;
    expect([b.state, b.x, b.y, b.hp, b.maxHp, b.look, b.targetId]).toEqual([BOSS_STATE.TELEGRAPH, 12, 8, 4000, 4800, 2, "p1"]);
    expect([b.attack.startTick, b.attack.hitTick, b.attack.cx, b.attack.radiusM]).toEqual([30, 54, 12, 4.5]);
  });

  it("F3: serverTick is the clock's estimate, ahead of the render tick; the fill follows the server's ticks", () => {
    const { room, host, setNow } = setup();
    playTo(room, host, setNow, 11, 60, true);
    expect(host.serverTick).toBeGreaterThan(host.renderTick);
    expect(Math.abs(host.serverTick - 60)).toBeLessThan(3);
    // A telegraph that started at tick 57 (its message 150 ms late): already 3 ticks in.
    telegraphProgress(host.serverTick, 57, 81, look);
    expect(look.visible).toBe(true);
    expect(look.progress).toBeGreaterThan(1 / 24);
    expect(look.progress).toBeLessThan(6 / 24);
  });

  it("a late boss.telegraph event: drawn from its start tick, the fill reaches the edge on the hit tick", () => {
    const { room, host, setNow } = setup();
    // The event of tick 40 arrives only now (a 150 ms late delivery at tick 43).
    playTo(room, host, setNow, 11, 43, true);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 41, events: [[NET_EVENT_KIND.BOSS_TELEGRAPH, 1, 1, 40, 64, 1200, 800, 450]] } satisfies SimEventsFlushed);
    const ev = playTo(room, host, setNow, 44, 44 + RENDER_DELAY_TICKS + 2, true).filter((e) => e.type === "boss.telegraph");
    expect(ev).toHaveLength(1);
    const t = ev[0];
    if (t?.type !== "boss.telegraph") throw new Error("no telegraph");
    expect([t.startTick, t.hitTick, t.radiusM]).toEqual([40, 64, 4.5]);
    // Whenever it is drawn, the fill is the server's tick's, never "0 at arrival".
    expect(telegraphProgress(host.serverTick, t.startTick, t.hitTick, look).progress).toBeGreaterThan(0.25);
    expect(telegraphProgress(64, t.startTick, t.hitTick, look).progress).toBe(1);
  });

  it("a tab hidden across a telegraph wakes past its hit: nothing drawn, no late banner", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 20, events: [[NET_EVENT_KIND.BOSS_WARNING, 100, 1600, 99], [NET_EVENT_KIND.BOSS_TELEGRAPH, 1, 1, 20, 44, 1200, 800, 450]] } satisfies SimEventsFlushed);
    room.state.boss = fakeBoss({ state: BOSS_STATE.WALK, atkId: 1, atkKind: 1, atkStart: 20, atkHit: 44 });
    const ev = playTo(room, host, setNow, 11, 300, false); // asleep: one update at the end
    expect(telegraphProgress(host.serverTick, 20, 44, look).visible).toBe(false);
    const cue: BossCue = { banner: "", sound: "", shake: false, buzz: false, music: "" };
    const warning = ev.find((e) => e.type === "boss.warning");
    expect(warning).toBeDefined();
    if (warning) expect(bossCue(warning, "p1", 0, 0, cue).banner).toBe("");
  });

  it("a late Game scene / reconnect mid-telegraph: the state carries the attack and the right fill", () => {
    const { room, host, setNow } = setup();
    playTo(room, host, setNow, 11, 70, true, (t) => {
      if (t === 60) room.state.boss = fakeBoss({ state: BOSS_STATE.TELEGRAPH, atkId: 9, atkKind: 1, atkStart: 60, atkHit: 84, atkX: 5, atkY: 5, atkR: 4.5 });
    });
    const a = host.world.boss.attack;
    expect(host.world.boss.state).toBe(BOSS_STATE.TELEGRAPH);
    telegraphProgress(host.serverTick, a.startTick, a.hitTick, look);
    expect(look.progress).toBeGreaterThan(8 / 24);
    expect(look.progress).toBeLessThan(13 / 24);
  });

  it("the Predictor gets the boss's body (D1: the push-out matches the server)", () => {
    const { room, host, setNow } = setup();
    room.state.boss = fakeBoss({ state: BOSS_STATE.WALK, x: 20, y: 12 });
    playTo(room, host, setNow, 11, 20, true);
    const pw = (host.predictor as unknown as { world: { boss: { x: number; y: number; state: number } } }).world;
    expect([pw.boss.state, pw.boss.x, pw.boss.y]).toEqual([BOSS_STATE.WALK, 20, 12]);
  });
});
