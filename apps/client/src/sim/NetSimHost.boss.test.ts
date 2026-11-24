import { describe, expect, it } from "vitest";
import { BOSS_ATTACK, BOSS_STATE, NET_EVENT_KIND, PLACEHOLDER_MAP, S2C, loadBalance, type SimEvent, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakeBoss, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "./NetSimHost";
import { chargeLaneProgress, chargeStopTick, telegraphProgress, throwChunkAt, type ChunkLook, type TelegraphLook } from "../render/bossTelegraph";
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
    const cue: BossCue = { banner: "", bannerColor: "", bannerMs: 0, sound: "", shake: false, buzz: false, music: "" };
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

describe("NetSimHost: the Behemoth's charge, throw, roar and death (Stories 6.6 + 6.7)", () => {
  it("mirrors the lane (exact stop point → direction, length), CRASH and the chunk source from state", () => {
    const { room, host, setNow } = setup();
    room.state.boss = fakeBoss({ state: BOSS_STATE.TELEGRAPH, x: 10, y: 10, atkId: 4, atkKind: BOSS_ATTACK.CHARGE, atkStart: 30, atkHit: 50, atkX: 10, atkY: 10, atkEndX: 16, atkEndY: 18, atkCrash: true });
    playTo(room, host, setNow, 11, 32, true);
    const a = host.world.boss.attack;
    expect(a.lenM).toBeCloseTo(10, 5);
    expect([a.dirX, a.dirY].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.6, 0.8]);
    expect(a.crash).toBe(true);
    expect(a.widthM).toBe(balance.boss.charge.laneWidthM);
    room.state.boss = fakeBoss({ state: BOSS_STATE.TELEGRAPH, atkId: 5, atkKind: BOSS_ATTACK.THROW, atkStart: 40, atkHit: 76, atkX: 30, atkY: 9, atkR: 3, atkEndX: 30, atkEndY: 9, atkSrc: 2, atkSrcX: 4, atkSrcY: 5 });
    playTo(room, host, setNow, 33, 36, true);
    expect([host.world.boss.attack.src, host.world.boss.attack.srcX, host.world.boss.attack.srcY]).toEqual([2, 4, 5]);
  });

  it("a tab woken mid-rush draws the full lane; woken after the stop draws nothing", () => {
    const { room, host, setNow } = setup();
    // A charge: start 20, hit 40, 10 m (stop 40 + 16).
    room.state.boss = fakeBoss({ state: BOSS_STATE.RUSH, atkId: 2, atkKind: BOSS_ATTACK.CHARGE, atkStart: 20, atkHit: 40, atkX: 5, atkY: 5, atkEndX: 15, atkEndY: 5 });
    playTo(room, host, setNow, 11, 46, false); // asleep, woken at 46 (mid-rush)
    const stop = chargeStopTick(40, 10, balance.boss.charge.speedMps);
    expect(chargeLaneProgress(host.serverTick, 20, 40, stop, look)).toMatchObject({ visible: true, progress: 1 });
    const later = setup();
    later.room.state.boss = fakeBoss({ state: BOSS_STATE.RECOVER, atkId: 2, atkKind: BOSS_ATTACK.CHARGE, atkStart: 20, atkHit: 40, atkX: 5, atkY: 5, atkEndX: 15, atkEndY: 5 });
    playTo(later.room, later.host, later.setNow, 11, 90, false);
    expect(chargeLaneProgress(later.host.serverTick, 20, 40, stop, look).visible).toBe(false);
  });

  it("a tab woken during the chunk's flight draws the ring and the flying chunk, not the lift (the boss already recovers)", () => {
    const { room, host, setNow } = setup();
    // Throw: start 20, release 40, impact 56.
    room.state.boss = fakeBoss({ state: BOSS_STATE.RECOVER, x: 10, y: 10, atkId: 3, atkKind: BOSS_ATTACK.THROW, atkStart: 20, atkHit: 56, atkX: 26, atkY: 10, atkR: 3, atkEndX: 26, atkEndY: 10 });
    playTo(room, host, setNow, 11, 47, false);
    const b = host.world.boss;
    expect(b.state).toBe(BOSS_STATE.RECOVER); // the pose is not the lift
    expect(telegraphProgress(host.serverTick, b.attack.startTick, b.attack.hitTick, look).visible).toBe(true);
    const c: ChunkLook = { visible: false, x: 0, y: 0, heightM: 0, f: 0 };
    expect(throwChunkAt(host.serverTick, b.attack.hitTick - 16, b.attack.hitTick, 10, 10, 26, 10, c).visible).toBe(true);
  });

  it("a tab hidden across the roar and woken after the death: no late ENRAGED, EVAC INBOUND once", () => {
    const { room, host, setNow } = setup();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 25, events: [[NET_EVENT_KIND.BOSS_CRASHED, 4, 1000, 1000]] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 30, events: [[NET_EVENT_KIND.BOSS_ENRAGED, 1000, 1000]] } satisfies SimEventsFlushed);
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 90, events: [[NET_EVENT_KIND.BOSS_KILLED, 0, 0, 1000, 1000, 1]] } satisfies SimEventsFlushed);
    room.state.boss = fakeBoss({ state: BOSS_STATE.DEAD, enraged: true, number: 1 });
    const ev = playTo(room, host, setNow, 11, 300, false);
    const cue: BossCue = { banner: "", bannerColor: "", bannerMs: 0, sound: "", shake: false, buzz: false, music: "" };
    // Review L3 (M21): a crash long before the wake plays no late CRASH! either.
    const crash = ev.find((e) => e.type === "boss.crashed");
    expect(crash).toBeDefined();
    if (crash) expect(bossCue(crash, "p1", 0, 0, cue)).toMatchObject({ banner: "", sound: "" });
    const roar = ev.find((e) => e.type === "boss.enraged");
    const killed = ev.filter((e) => e.type === "boss.killed");
    expect(roar).toBeDefined();
    if (roar) expect(bossCue(roar, "p1", 0, 0, cue).banner).toBe("");
    expect(killed).toHaveLength(1);
    expect(bossCue(killed[0] as SimEvent, "p1", 0, 0, cue, "Sam", 150).banner).toContain("EVAC INBOUND");
    expect(cue.sound).toBe(""); // stale: no late death sound
    expect(host.world.boss.state).toBe(BOSS_STATE.DEAD);
  });
});
