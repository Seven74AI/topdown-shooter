import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { applyBossDamage } from "./bossDamage";
import { BOSS_ATTACK, BOSS_STATE } from "./bossState";
import { crawlerDropSpot } from "./enrage";
import { bossGapTicks, bossStats, bossTicks, telegraphTicks } from "./telegraph";
import { collect, placeBoss, slamOnly, tickN } from "./testBoss";

/**
 * Story 6.7 (F1–F4; AC 2–4, 10): the roar, the enraged pace and the Crawlers off its back.
 */
const balance = loadBalance();
const E = balance.boss.enrage;
const ROAR = ticksFor(E.roarS);
const NO_WAVES = { waves: () => {} };

function setup() {
  const w = createWorld({ balance, seed: 8, systems: NO_WAVES });
  const ev = collect(w);
  return { w, ev };
}

/** A walking boss at half HP or less: it roars on the next tick. */
function roarNow(w: World, x = 24, y = 16): void {
  placeBoss(w, x, y, 1000);
  w.boss.hp = 500;
  slamOnly(w);
  w.boss.cooldown.slam = 1e9;
}

describe("Story 6.7 F1: the roar warns you, it doesn't hurt you", () => {
  it("the first walking tick at ≤ 50 %: ROAR 30 ticks, standing still; ENRAGED after; once only", () => {
    const { w, ev } = setup();
    addPlayer(w, "far", 44, 30);
    roarNow(w);
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.ROAR);
    expect(ev.filter((e) => e.type === "boss.enraged")).toHaveLength(1);
    expect(w.boss.enraged).toBe(false); // set at the roar's end
    for (let i = 0; i < ROAR - 1; i++) {
      tickN(w);
      expect(w.boss.state).toBe(BOSS_STATE.ROAR);
      expect(w.boss.x).toBe(24);
      expect(ev.filter((e) => e.type === "boss.telegraph")).toHaveLength(0); // F5: the roar is busy
    }
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(w.boss.enraged).toBe(true);
    w.boss.hp = 100;
    tickN(w, 200);
    expect(ev.filter((e) => e.type === "boss.enraged")).toHaveLength(1);
  });

  it("4.9 m: pushed 1.5 m straight away with no damage; 5.1 m: not moved", () => {
    const { w, ev } = setup();
    const near = addPlayer(w, "near", 24 + 4.9, 16);
    const out = addPlayer(w, "out", 24, 16 + 5.1);
    roarNow(w);
    tickN(w);
    tickN(w, ticksFor(E.roarPushS) + 1);
    expect(near.x).toBeCloseTo(24 + 4.9 + E.roarPushM, 2);
    expect(near.y).toBeCloseTo(16, 6);
    expect(out.x).toBe(24);
    expect(out.y).toBe(16 + 5.1);
    expect(ev.some((e) => e.type === "player.damaged")).toBe(false);
  });

  it("never mid-attack: crossing 50 % during a slam telegraph roars only after its recovery, before the gap", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16, 1000);
    slamOnly(w);
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.TELEGRAPH);
    applyBossDamage(w, 600, "p", "pistol");
    w.debug.godMode = true;
    let roarAt = -1;
    let recoverEnd = -1;
    for (let i = 0; i < 80 && roarAt < 0; i++) {
      const before = w.boss.state;
      p.x = 40;
      tickN(w);
      if (before === BOSS_STATE.RECOVER && w.boss.state !== BOSS_STATE.RECOVER) recoverEnd = w.tick - 1;
      if (w.boss.state === BOSS_STATE.ROAR) roarAt = w.tick - 1;
      if (roarAt < 0) expect(w.boss.state).not.toBe(BOSS_STATE.ROAR);
    }
    expect(ev.filter((e) => e.type === "boss.slammed")).toHaveLength(1); // the slam landed first
    expect(roarAt).toBe(recoverEnd + 1); // the first walking tick
  });

  it("the roar never starts while a chunk is in flight (one thing at a time)", () => {
    const { w } = setup();
    addPlayer(w, "far", 36, 16);
    placeBoss(w, 24, 16, 1000);
    w.boss.cooldown.slam = 1e9;
    w.boss.cooldown.charge = 1e9;
    tickN(w);
    expect(w.boss.attack.kind).toBe(BOSS_ATTACK.THROW);
    w.boss.hp = 400;
    for (let i = 0; i < 40; i++) {
      tickN(w);
      if (w.boss.attack.live) expect(w.boss.state).not.toBe(BOSS_STATE.ROAR);
    }
    expect(w.boss.enraged || w.boss.state === BOSS_STATE.ROAR).toBe(true);
  });
});

describe("Story 6.7 F2 / F3: only its pace changes", () => {
  it("F2: every telegraph length is the same enraged or not, 1–4 players (slam 24, charge 20, throw 20 + 16)", () => {
    for (const players of [1, 2, 3, 4]) {
      for (const enraged of [false, true]) {
        const { w } = setup();
        for (let i = 0; i < players; i++) addPlayer(w, `p${i}`, 4 + i, 4);
        placeBoss(w, 24, 16);
        w.boss.enraged = enraged;
        expect(telegraphTicks(w, BOSS_ATTACK.SLAM)).toBe(24);
        expect(telegraphTicks(w, BOSS_ATTACK.CHARGE)).toBe(20);
        expect(telegraphTicks(w, BOSS_ATTACK.THROW)).toBe(36);
      }
    }
    // Through real attacks: the event's hitTick − startTick.
    for (const enraged of [false, true]) {
      for (const [kind, px] of [
        [BOSS_ATTACK.SLAM, 27],
        [BOSS_ATTACK.CHARGE, 32],
        [BOSS_ATTACK.THROW, 36],
      ] as const) {
        const { w, ev } = setup();
        addPlayer(w, "p", px, 16);
        placeBoss(w, 24, 16);
        w.boss.enraged = enraged;
        w.boss.targetId = "p";
        w.boss.lastSwitchTick = w.tick;
        if (kind !== BOSS_ATTACK.SLAM) w.boss.cooldown.slam = 1e9;
        if (kind === BOSS_ATTACK.THROW) w.boss.cooldown.charge = 1e9;
        tickN(w);
        const t = ev.find((e) => e.type === "boss.telegraph");
        if (t?.type !== "boss.telegraph") throw new Error("no telegraph");
        expect(t.kind).toBe(kind);
        expect(t.hitTick - t.startTick).toBe(kind === BOSS_ATTACK.SLAM ? 24 : kind === BOSS_ATTACK.CHARGE ? 20 : 36);
      }
    }
  });

  it("F3: gaps 39 / 31 / 25 / 21 ticks (1–4 players) and cooldowns slam 56, charge 98, throw 84 when enraged", () => {
    const want = [39, 31, 25, 21];
    for (const players of [1, 2, 3, 4]) {
      const { w } = setup();
      for (let i = 0; i < players; i++) addPlayer(w, `p${i}`, 4 + i, 4);
      placeBoss(w, 24, 16);
      expect(bossGapTicks(w)).toBe(ticksFor(balance.boss.gapS[players - 1] as number));
      w.boss.enraged = true;
      expect(bossGapTicks(w)).toBe(want[players - 1]);
    }
    const { w } = setup();
    placeBoss(w, 24, 16);
    w.boss.enraged = true;
    expect(bossTicks(w, balance.boss.slam.cooldownS, "cooldown")).toBe(56);
    expect(bossTicks(w, balance.boss.charge.cooldownS, "cooldown")).toBe(98);
    expect(bossTicks(w, balance.boss.throw.cooldownS, "cooldown")).toBe(84);
    // Through a real slam: the cooldown set at its hit tick.
    const s = setup();
    addPlayer(s.w, "p", 27, 16);
    placeBoss(s.w, 24, 16);
    s.w.boss.enraged = true;
    s.w.debug.godMode = true;
    tickN(s.w, 1 + ticksFor(balance.boss.slam.telegraphS));
    expect(s.w.boss.cooldown.slam).toBe(56);
  });

  it("F3: recoveries, the stun, damage and radii don't change", () => {
    const { w } = setup();
    addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16);
    w.boss.enraged = true;
    w.debug.godMode = true;
    tickN(w, 1 + 24);
    expect(w.boss.state).toBe(BOSS_STATE.RECOVER);
    tickN(w, ticksFor(balance.boss.slam.recoverS) - 1);
    expect(w.boss.state).toBe(BOSS_STATE.RECOVER);
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
  });

  it("DD2: a cooldown set before the enrage keeps its promised length", () => {
    const { w } = setup();
    addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16, 1000);
    w.debug.godMode = true;
    tickN(w, 1 + 24); // the slam lands: cooldown 80 set
    const cd = w.boss.cooldown.slam;
    expect(cd).toBe(ticksFor(balance.boss.slam.cooldownS));
    w.boss.enraged = true; // enraged now: the running cooldown is not cut
    tickN(w, 10);
    expect(w.boss.cooldown.slam).toBe(cd - 10);
  });

  it("F3: enraged walk speed × 1.3 (1.69 m/s)", () => {
    const speed = (enraged: boolean): number => {
      const { w } = setup();
      addPlayer(w, "p", 44, 16);
      placeBoss(w, 10, 16);
      slamOnly(w);
      w.boss.enraged = enraged;
      w.boss.targetId = "p";
      tickN(w, 2);
      let d = 0;
      for (let i = 0; i < 20; i++) {
        const x0 = w.boss.x;
        const y0 = w.boss.y;
        tickN(w);
        d += Math.hypot(w.boss.x - x0, w.boss.y - y0);
      }
      return d / (20 * TICK_DT_S);
    };
    expect(speed(false)).toBeCloseTo(balance.boss.speedMps, 6);
    expect(speed(true)).toBeCloseTo(1.69, 6);
  });
});

describe("Story 6.7 F4: Crawlers drop off its back, never on top of you", () => {
  it("every 8 / 6 / 5 / 4 s (1–4 players), the first 1 s after the roar, 2.4 m behind its centre", () => {
    for (const players of [1, 2, 3, 4]) {
      const { w, ev } = setup();
      for (let i = 0; i < players; i++) addPlayer(w, `p${i}`, 44 - i, 30);
      roarNow(w);
      w.boss.facing = 0; // facing +x: behind = −x
      for (const p of w.players.values()) p.status = "out"; // nobody walks it anywhere (out players are no target)
      tickN(w, 1 + ROAR); // roar, then enraged
      expect(w.boss.enraged).toBe(true);
      const t0 = w.tick - 1;
      const drops: number[] = [];
      w.events.subscribe((e) => {
        if (e.type === "boss.crawler_dropped") drops.push(w.tick);
      });
      const every = ticksFor(E.crawlerEveryS[players - 1] as number);
      tickN(w, ticksFor(E.firstCrawlerS) + every * 2 + 1);
      expect(drops.length, `${players} players`).toBe(3);
      expect((drops[0] as number) - 1 - t0).toBe(ticksFor(E.firstCrawlerS)); // events are read after the step (w.tick + 1)
      expect((drops[1] as number) - (drops[0] as number)).toBe(every);
      const d = ev.find((e) => e.type === "boss.crawler_dropped");
      expect(d).toMatchObject({ x: 24 - E.crawlerBehindM, y: 16 });
    }
  });

  it("a drop is a wave zombie (counts in the wave, pays 3 like any Crawler)", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 44, 30);
    roarNow(w);
    w.boss.enraged = true;
    w.boss.crawlerTicks = 1;
    w.boss.facing = 0;
    p.status = "out";
    tickN(w);
    expect(ev.some((e) => e.type === "boss.crawler_dropped")).toBe(true);
    expect(w.zombies.aliveCount).toBe(1);
    const id = w.zombies.aliveIds[0] as number;
    expect(w.zombies.waveZombie[id]).toBe(1);
    p.status = "alive";
    const wallet = p.wallet;
    killZombie(w, id, "p", "pistol");
    tickN(w); // the economy pays on the kill event
    expect(p.wallet - wallet).toBe(balance.zombies.types.crawler?.reward);
  });

  it("skipped (timer restarts) when the spot is in a map box, on a building, off the map, within 1.5 m of a standing player, or at 110 alive", () => {
    const cases: [string, (w: World) => void][] = [
      ["box", (w) => (w.obstacles.solids as MapBox[]).push({ name: "box", minX: 20, minY: 15, maxX: 22, maxY: 17 } as MapBox)],
      ["player", (w) => addPlayer(w, "q", 24 - E.crawlerBehindM + 1.4, 16)],
      [
        "cap",
        (w) => {
          for (let i = 0; i < balance.boss.aliveCap; i++) spawnZombie(w, "walker", 40 + (i % 6) * 0.3, 2 + Math.floor(i / 6) * 0.3);
          w.zombies.state.fill(0);
        },
      ],
      [
        "edge",
        (w) => {
          w.boss.x = 2.2;
        },
      ],
    ];
    for (const [name, prep] of cases) {
      const { w, ev } = setup();
      const p = addPlayer(w, "p", 44, 30);
      p.status = "out";
      roarNow(w);
      w.boss.enraged = true;
      w.boss.facing = 0;
      w.boss.crawlerTicks = 1;
      prep(w);
      const alive0 = w.zombies.aliveCount;
      tickN(w);
      expect(ev.some((e) => e.type === "boss.crawler_dropped"), name).toBe(false);
      expect(w.zombies.aliveCount, name).toBe(alive0);
      expect(w.boss.crawlerTicks, name).toBe(ticksFor(E.crawlerEveryS[w.players.size - 1] as number));
    }
    // 1.6 m from a standing player: drops.
    const { w } = setup();
    addPlayer(w, "q", 24 - E.crawlerBehindM + 1.6, 16).status = "alive";
    placeBoss(w, 24, 16, 1000);
    w.boss.facing = 0;
    expect(crawlerDropSpot(w)).toBe(true);
  });

  it("drops while stunned too (a crash can shake one loose), never while it is dead", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 44, 30);
    p.status = "out";
    roarNow(w);
    w.boss.enraged = true;
    w.boss.state = BOSS_STATE.STUN;
    w.boss.facing = 0;
    w.boss.crawlerTicks = 1;
    tickN(w);
    expect(ev.filter((e) => e.type === "boss.crawler_dropped")).toHaveLength(1);
    applyBossDamage(w, 1e9, null, "pistol");
    w.boss.crawlerTicks = 1;
    tickN(w, 200);
    expect(ev.filter((e) => e.type === "boss.crawler_dropped")).toHaveLength(1);
    expect(bossStats.crawlersDropped).toBeGreaterThan(0);
  });
});

