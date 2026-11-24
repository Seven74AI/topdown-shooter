import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { maxAliveNow } from "../waves/waveDirector";
import { killZombie } from "../zombies/zombiePool";
import { applyBossDamage } from "./bossDamage";
import { BOSS_ATTACK, BOSS_STATE, bossBodyOn, pushPlayerOutOfBoss } from "./bossState";
import { killBoss } from "./death";
import { collect, placeBoss, slamOnly, tickN } from "./testBoss";

/**
 * Story 6.7 (F5–F7; AC 5, 6, 10): the end of the Behemoth.
 */
const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

function setup(systems: Parameters<typeof createWorld>[0]["systems"] = NO_WAVES) {
  const w = createWorld({ balance, seed: 9, systems });
  const ev = collect(w);
  return { w, ev };
}

const bossHits = (ev: ReturnType<typeof collect>): number => ev.filter((e) => e.type === "player.damaged" && e.tag === "boss").length;

describe("Story 6.7 F5: a dead boss never hurts you", () => {
  it("killed during a slam telegraph: the slam never lands", () => {
    const { w, ev } = setup();
    addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16);
    slamOnly(w);
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.TELEGRAPH);
    tickN(w, 10);
    applyBossDamage(w, 1e9, "p", "grenade");
    tickN(w, 40);
    expect(bossHits(ev)).toBe(0);
    expect(ev.some((e) => e.type === "boss.slammed")).toBe(false);
    expect(w.boss.attack.live).toBe(false);
    expect(w.boss.attack.kind).toBe(BOSS_ATTACK.NONE);
  });

  it("killed mid-rush: it stops where it is; nobody further down the lane is hit", () => {
    const { w, ev } = setup();
    addPlayer(w, "target", 21, 16);
    addPlayer(w, "down_lane", 19.5, 17);
    placeBoss(w, 12, 16);
    w.boss.cooldown.slam = 1e9;
    w.boss.cooldown.throw = 1e9;
    w.boss.targetId = "target";
    w.boss.lastSwitchTick = w.tick;
    tickN(w, 1 + 20 + 3); // telegraph, then 3 rush ticks
    expect(w.boss.state).toBe(BOSS_STATE.RUSH);
    const x = w.boss.x;
    applyBossDamage(w, 1e9, "target", "smg");
    tickN(w, 20);
    expect(w.boss.x).toBe(x);
    expect(bossHits(ev)).toBe(0);
  });

  it("killed while the chunk flies: it never lands (no damage, no crater)", () => {
    const { w, ev } = setup();
    addPlayer(w, "p", 36, 16);
    placeBoss(w, 24, 16);
    w.boss.cooldown.slam = 1e9;
    w.boss.cooldown.charge = 1e9;
    tickN(w, 1 + 20 + 4); // lift over, chunk in flight
    expect(w.boss.attack.live).toBe(true);
    applyBossDamage(w, 1e9, "p", "grenade");
    tickN(w, 30);
    expect(ev.some((e) => e.type === "boss.thrown_impact")).toBe(false);
    expect(bossHits(ev)).toBe(0);
  });

  it("DD3: a kill in `combat` on the slam's hit tick (combat runs before the boss system): the slam does not land", () => {
    let hitTick = -1;
    const killer = (w: World): void => {
      if (w.tick === hitTick) applyBossDamage(w, 1e9, "p", "pistol");
    };
    const { w, ev } = setup({ ...NO_WAVES, combat: killer });
    addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16);
    slamOnly(w);
    tickN(w);
    hitTick = w.boss.attack.hitTick;
    tickN(w, 30);
    expect(w.boss.state).toBe(BOSS_STATE.DEAD);
    expect(ev.some((e) => e.type === "boss.slammed")).toBe(false);
    expect(bossHits(ev)).toBe(0);
  });

  it("DD3, the other order: a kill after the boss system on the hit tick — the slam landed that tick; nothing after", () => {
    let hitTick = -1;
    const killer = (w: World): void => {
      if (w.tick === hitTick) applyBossDamage(w, 1e9, "p", "pistol");
    };
    const { w, ev } = setup({ waves: killer });
    addPlayer(w, "p", 27, 16);
    placeBoss(w, 24, 16);
    slamOnly(w);
    tickN(w);
    hitTick = w.boss.attack.hitTick;
    tickN(w, 60);
    expect(ev.filter((e) => e.type === "boss.slammed")).toHaveLength(1);
    expect(bossHits(ev)).toBe(1);
  });
});

describe("Story 6.7 F6: everyone gets paid", () => {
  it("150 to every player — standing, downed and out — once, even if several hits land in the killing tick", () => {
    const { w, ev } = setup();
    const a = addPlayer(w, "a", 4, 4);
    const b = addPlayer(w, "b", 6, 4);
    const c = addPlayer(w, "c", 8, 4);
    b.status = "downed";
    c.status = "out";
    const w0 = [a.wallet, b.wallet, c.wallet];
    placeBoss(w, 24, 16, 100);
    applyBossDamage(w, 80, "a", "smg");
    applyBossDamage(w, 80, "a", "smg");
    applyBossDamage(w, 80, null, "auto_turret");
    killBoss(w, "a", "smg");
    expect([a.wallet - (w0[0] as number), b.wallet - (w0[1] as number), c.wallet - (w0[2] as number)]).toEqual([150, 150, 150]);
    tickN(w); // events are delivered with the next step
    const paid = ev.filter((e) => e.type === "money.earned" && e.reason === "boss");
    expect(paid).toHaveLength(3);
    const killed = ev.filter((e) => e.type === "boss.killed");
    expect(killed).toHaveLength(1);
    expect(killed[0]).toMatchObject({ killerId: "a", weapon: "smg", number: 1 });
  });
});

describe("Story 6.7 F7 / AC 6: the wave still has to be won; the body stays but doesn't block", () => {
  it("the cap returns to 150 on the death tick", () => {
    const { w } = setup();
    addPlayer(w, "p", 4, 4);
    placeBoss(w, 24, 16);
    expect(maxAliveNow(w)).toBe(balance.boss.aliveCap);
    applyBossDamage(w, 1e9, "p", "pistol");
    expect(maxAliveNow(w)).toBe(balance.waves.maxAlive);
  });

  it("its death does not end the wave: the remaining zombies must still be cleared, then it ends", () => {
    const w = createWorld({ balance, seed: 10 });
    w.debug.godMode = true;
    w.debug.bossWaves = [1];
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    const ev = collect(w);
    tickN(w, ticksFor(balance.waves.buildPhaseS) + 1);
    for (let t = 0; t < 400 && w.boss.state !== BOSS_STATE.WALK; t++) tickN(w);
    expect(bossBodyOn(w.boss)).toBe(true);
    for (let t = 0; t < 400 && w.waves.queued > 0; t++) {
      w.boss.cooldown.slam = 1e9;
      w.boss.cooldown.charge = 1e9;
      w.boss.cooldown.throw = 1e9;
      tickN(w);
    }
    expect(w.waves.queued).toBe(0);
    expect(w.zombies.aliveCount).toBeGreaterThan(0);
    applyBossDamage(w, 1e9, "p0", "pistol");
    tickN(w, 5);
    expect(ev.some((e) => e.type === "wave.ended")).toBe(false); // zombies left
    for (let i = w.zombies.aliveCount - 1; i >= 0; i--) killZombie(w, w.zombies.aliveIds[i] as number, null, "pistol");
    tickN(w, 3);
    expect(ev.some((e) => e.type === "wave.ended")).toBe(true);
  });

  it("the dead body: not solid to players, takes no damage, back to NONE at the build start", () => {
    const { w } = setup();
    const p = addPlayer(w, "p", 24.5, 16);
    placeBoss(w, 24, 16);
    killBoss(w, "p", "smg");
    expect(bossBodyOn(w.boss)).toBe(false);
    expect(pushPlayerOutOfBoss(w, p)).toBe(false);
    expect(applyBossDamage(w, 100, "p", "smg")).toBe(0);
    w.run.phase = "build";
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.NONE);
    expect(w.boss.number).toBe(1); // kept for 6.12
  });
});

describe("Stories 6.6 + 6.7 replay (brief 8)", () => {
  it("same seed + inputs → same digest through charges, throws, the roar, Crawler drops and the death", () => {
    const run = () => {
      const w = createWorld({ balance, seed: 77, map: DOWNTOWN_MAP });
      w.debug.bossWaves = [1];
      w.debug.godMode = true;
      addPlayer(w, "p0", 24, 16);
      addPlayer(w, "p1", 30, 20);
      startBuild(w);
      const seen = { roar: 0, drops: 0, killed: 0, telegraphs: 0 };
      w.events.subscribe((e) => {
        if (e.type === "boss.enraged") seen.roar++;
        if (e.type === "boss.crawler_dropped") seen.drops++;
        if (e.type === "boss.killed") seen.killed++;
        if (e.type === "boss.telegraph") seen.telegraphs++;
      });
      const digests: number[] = [];
      for (let t = 0; t < 2400; t++) {
        // Deterministic damage once it walks: half its HP at the first chance, the rest 40 s later.
        if (bossBodyOn(w.boss) && w.boss.hp > w.boss.maxHp * 0.5) applyBossDamage(w, w.boss.maxHp * 0.55, "p0", "smg");
        if (bossBodyOn(w.boss) && w.boss.enraged && w.boss.stateTicks === 0 && t > 1800) applyBossDamage(w, 1e9, "p1", "grenade");
        tickN(w);
        if (t % 300 === 0) digests.push(worldDigest(w));
      }
      return { digests, d: worldDigest(w), seen };
    };
    const a = run();
    const b = run();
    expect(a.seen.roar).toBe(1);
    expect(a.seen.drops).toBeGreaterThanOrEqual(1);
    expect(a.seen.killed).toBe(1);
    expect(a.seen.telegraphs).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });
});
