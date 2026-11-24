import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer, removePlayer } from "../player/player";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { startBuild } from "../run/runStateMachine";
import { maxAliveNow } from "../waves/waveDirector";
import { applyBossDamage } from "./bossDamage";
import { BOSS_STATE, bossMaxHp, isBossWave } from "./bossState";
import { BEHEMOTH_LOOKS, behemothLookIndex, bossEntry, bossEntryOpen, pickBossEntry, startBossWarning } from "./behemoth";
import { recordBossThreat } from "./target";
import { collect, placeBoss, tickN } from "./testBoss";

/**
 * Story 6.5: the Behemoth's arrival, HP, entry, alive cap, wave end and target rule (F1, F7, F10,
 * F11, D2, D6, D7, D11). Fairness rules first (brief line 3): each is a test.
 */
const balance = loadBalance();
const B = balance.boss;
const NO_WAVES = { waves: () => {} };

function world(opts: { map?: typeof DOWNTOWN_MAP; seed?: number; systems?: object } = {}): World {
  return createWorld({ balance, seed: opts.seed ?? 7, systems: (opts.systems ?? NO_WAVES) as never, ...(opts.map ? { map: opts.map } : {}) });
}

describe("Story 6.5 boss.json (AC 1)", () => {
  it("matches the story / GDD numbers", () => {
    expect(B).toMatchObject({
      bossWaves: [10],
      arriveAtFraction: 0.5,
      warningS: 4,
      radiusM: 2,
      speedMps: 1.3,
      hp: 6000,
      soloHpScale: 0.4,
      aliveCap: 110,
      entryMinPlayerDistanceM: 14,
      entryPoints: ["street_west", "street_east", "street_north", "street_south"],
      buildingDps: 100,
      edgeGraceM: 0.25,
      gapS: [2.8, 2.2, 1.8, 1.5],
      firstGapS: 1,
      target: { threatWindowS: 5, switchMinS: 4 },
      slam: { triggerM: 4, telegraphS: 1.2, radiusM: 4.5, damage: 40, pushM: 2, pushS: 0.2, recoverS: 0.8, cooldownS: 4, zombieDamage: 40 },
      bodyPushPlayers: true,
      pathing: { inflateM: 1.65, rebuildEveryS: 0.5, buildingSlowPct: 25 },
      caps: { maxDecals: 8 },
    });
    expect(B.aliveCap).toBeLessThanOrEqual(balance.waves.maxAlive);
  });

  it("every entry point names a real Downtown spawn point", () => {
    const names = DOWNTOWN_MAP.spawnPoints.map((s) => s.name);
    for (const e of B.entryPoints) expect(names).toContain(e);
  });

  it("isBossWave: wave 10 only; the dev override replaces the list", () => {
    expect([...Array(12).keys()].map((i) => i + 1).filter((w) => isBossWave(balance, w))).toEqual([10]);
    expect(isBossWave(balance, 3, false, [3])).toBe(true);
    expect(isBossWave(balance, 10, false, [3])).toBe(false);
  });
});

describe("Story 6.5 F10: same boss for everyone in a run", () => {
  it("HP 2,400 / 3,600 / 4,800 / 6,000 for 1–4 players", () => {
    expect([1, 2, 3, 4].map((n) => bossMaxHp(balance, n))).toEqual([2400, 3600, 4800, 6000]);
  });

  it("fixed at its arrival (a player leaving later changes nothing)", () => {
    const w = world();
    for (let i = 0; i < 3; i++) addPlayer(w, `p${i}`, 24 + i, 16);
    w.run.phase = "wave";
    expect(startBossWarning(w)).toBe(true);
    tickN(w, ticksFor(B.warningS));
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(w.boss.maxHp).toBe(4800);
    removePlayer(w, "p2");
    tickN(w, 5);
    expect(w.boss.maxHp).toBe(4800);
  });
});

describe("Story 6.5 F1: you always see it coming", () => {
  it("arrives at 50 % of a boss wave's spawns, not before; warns 80 ticks; the entry never changes", () => {
    const w = world({ systems: {} }); // the real run: build → wave 1 (DEV_BOSS_WAVES=1)
    w.debug.bossWaves = [1];
    w.debug.godMode = true;
    addPlayer(w, "p0", 24, 16);
    const ev = collect(w);
    startBuild(w);
    // The boss system runs before the director in a tick: it sees the spawns of the ticks before.
    let before = 0;
    let prev = 0;
    for (let t = 0; t < 2000 && w.boss.state === BOSS_STATE.NONE; t++) {
      prev = before;
      before = w.run.phase === "wave" ? w.waves.size - w.waves.queued : 0;
      tickN(w);
    }
    expect(w.boss.state).toBe(BOSS_STATE.WARNING);
    const half = Math.round(w.waves.size * B.arriveAtFraction);
    expect(before).toBeGreaterThanOrEqual(half); // at 50 %
    expect(prev).toBeLessThan(half); // and not a tick later than it could
    expect(w.waves.size).toBe(Math.round(40 * balance.waves.playerCountScale[0]!)); // solo wave 1
    const warn = ev.find((e) => e.type === "boss.warning");
    expect(warn).toBeDefined();
    const entry = { ...w.boss.entry };
    const p = w.players.get("p0");
    if (!p) throw new Error("no player");
    // The team walks toward the entry during the warning: it does not change (fixed at the start).
    let ticks = 0;
    while (w.boss.state === BOSS_STATE.WARNING) {
      p.x += (entry.x - p.x) * 0.02;
      tickN(w);
      ticks++;
      expect(w.boss.entry).toEqual(entry);
    }
    expect(ticks).toBe(ticksFor(B.warningS)); // 80
    expect(ticksFor(B.warningS)).toBe(80);
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(w.boss.x).toBeCloseTo(entry.x, 6);
    const arrived = ev.find((e) => e.type === "boss.arrived");
    expect(arrived).toMatchObject({ maxHp: 2400 });
    if (warn?.type === "boss.warning") expect(warn.hitTick).toBe(w.tick - 1); // it walks in on the warning's announced tick
  });

  it("D2: the street end farthest from the team, ≥ 14 m from every standing player whenever one is (every team position)", () => {
    const w = world({ map: DOWNTOWN_MAP });
    const entries = DOWNTOWN_MAP.spawnPoints.filter((s) => B.entryPoints.includes(s.name));
    expect(entries).toHaveLength(4);
    let checked = 0;
    for (let x = 2; x < DOWNTOWN_MAP.widthM; x += 3) {
      for (let y = 2; y < DOWNTOWN_MAP.heightM; y += 3) {
        for (const id of [...w.players.keys()]) removePlayer(w, id);
        addPlayer(w, "p0", x, y);
        addPlayer(w, "p1", DOWNTOWN_MAP.widthM - x, y); // a split team
        pickBossEntry(w);
        const near = (sx: number, sy: number) => Math.min(...[...w.players.values()].map((p) => Math.hypot(p.x - sx, p.y - sy)));
        const chosen = entries.find((e) => e.name === bossEntry.name);
        expect(chosen, `${x},${y}`).toBeDefined();
        if (!chosen) continue;
        expect(bossEntryOpen(w, chosen.x, chosen.y)).toBe(true); // never a pocket it can't leave
        const best = Math.max(...entries.filter((e) => bossEntryOpen(w, e.x, e.y)).map((e) => near(e.x, e.y)));
        expect(near(chosen.x, chosen.y)).toBeCloseTo(best, 9);
        if (best >= B.entryMinPlayerDistanceM) expect(near(chosen.x, chosen.y)).toBeGreaterThanOrEqual(B.entryMinPlayerDistanceM);
        // Its body starts inside the map.
        expect(bossEntry.x).toBeGreaterThanOrEqual(B.radiusM - 1e-9);
        expect(bossEntry.x).toBeLessThanOrEqual(DOWNTOWN_MAP.widthM - B.radiusM + 1e-9);
        expect(bossEntry.y).toBeGreaterThanOrEqual(B.radiusM - 1e-9);
        expect(bossEntry.y).toBeLessThanOrEqual(DOWNTOWN_MAP.heightM - B.radiusM + 1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("downed players don't count for the entry distance (only standing ones)", () => {
    const w = world({ map: DOWNTOWN_MAP });
    const east = DOWNTOWN_MAP.spawnPoints.find((s) => s.name === "street_east");
    if (!east) throw new Error("no street_east");
    addPlayer(w, "p0", 2, 16);
    const d = addPlayer(w, "p1", east.x - 1, east.y);
    d.status = "downed";
    pickBossEntry(w);
    expect(bossEntry.name).toBe("street_east");
  });

  it("Downtown stage 1: the west street is a pocket for a 4 m body (its parked cars); the other three ends are open", () => {
    const w = world({ map: DOWNTOWN_MAP });
    const open = DOWNTOWN_MAP.spawnPoints.filter((s) => B.entryPoints.includes(s.name)).map((s) => [s.name, bossEntryOpen(w, s.x, s.y)]);
    expect(Object.fromEntries(open)).toEqual({ street_west: false, street_east: true, street_north: true, street_south: true });
  });
});

describe("Story 6.5 D7: looks", () => {
  it("one of four per Behemoth from the run seed; never the previous look", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 200; seed++) {
      const first = behemothLookIndex(seed, 1, -1);
      expect(first).toBe(behemothLookIndex(seed, 1, -1));
      seen.add(first);
      let prev = first;
      for (let n = 2; n < 8; n++) {
        const k = behemothLookIndex(seed, n, prev);
        expect(k).not.toBe(prev);
        expect(k >= 0 && k < BEHEMOTH_LOOKS).toBe(true);
        prev = k;
      }
    }
    expect(seen.size).toBe(4);
  });
});

describe("Story 6.5 D6 / D11 / brief 22: alive cap 110 while it warns or lives", () => {
  it("110 from the warning, the boss not counted, 150 the tick it dies", () => {
    const w = world();
    addPlayer(w, "p0", 24, 16);
    w.run.phase = "wave";
    expect(maxAliveNow(w)).toBe(150);
    startBossWarning(w);
    expect(maxAliveNow(w)).toBe(110); // D11: from the warning
    tickN(w, ticksFor(B.warningS));
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(maxAliveNow(w)).toBe(110);
    applyBossDamage(w, 1e9, "p0", "pistol");
    expect(w.boss.state).toBe(BOSS_STATE.DEAD);
    expect(maxAliveNow(w)).toBe(150);
  });

  it("the director spawns no zombie above 110 while it lives; zombies above it are not killed", () => {
    const w = world({ systems: {} });
    w.debug.godMode = true;
    w.debug.bossWaves = [9];
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    w.waves.number = 8; // the next wave (9) is a boss wave
    tickN(w, ticksFor(balance.waves.buildPhaseS) + 1);
    expect(w.run.phase).toBe("wave");
    // Freeze the horde where it stands (no contact, no deaths) and fill it.
    w.zombies.state.fill(0);
    let max = 0;
    let warned = false;
    for (let t = 0; t < 600; t++) {
      tickN(w);
      if (w.boss.state >= BOSS_STATE.WARNING) {
        if (!warned) {
          warned = true;
          max = w.zombies.aliveCount; // already alive when it warned: kept
        }
        expect(w.zombies.aliveCount).toBeLessThanOrEqual(Math.max(110, max));
      }
    }
    expect(warned).toBe(true);
    expect(w.waves.queued).toBeGreaterThan(0); // the cap held spawns back
  });
});

describe("Story 6.5 F11: the wave isn't over while it lives", () => {
  it("every zombie dead, queue empty: the wave holds while the boss warns or walks; ends once it is dead", () => {
    const w = world({ systems: {} });
    w.debug.godMode = true;
    w.debug.bossWaves = [1];
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    tickN(w, ticksFor(balance.waves.buildPhaseS) + 1);
    // Beat-the-rule 9: kill every zombie as it spawns, before and after the warning.
    let ended = false;
    w.events.subscribe((e) => {
      if (e.type === "wave.ended") ended = true;
    });
    for (let t = 0; t < 400; t++) {
      for (let i = w.zombies.aliveCount - 1; i >= 0; i--) killZombie(w, w.zombies.aliveIds[i] as number, null, "pistol");
      tickN(w);
    }
    expect(w.waves.queued).toBe(0);
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(ended).toBe(false);
    expect(w.run.phase).toBe("wave");
    applyBossDamage(w, 1e9, "p0", "pistol");
    tickN(w, 2);
    expect(ended).toBe(true);
  });

  it("a non-boss wave ends as before (no boss, no hold)", () => {
    const w = world({ systems: {} });
    w.debug.godMode = true;
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    tickN(w, ticksFor(balance.waves.buildPhaseS) + 1);
    let ended = false;
    w.events.subscribe((e) => {
      if (e.type === "wave.ended") ended = true;
    });
    for (let t = 0; t < 400 && !ended; t++) {
      for (let i = w.zombies.aliveCount - 1; i >= 0; i--) killZombie(w, w.zombies.aliveIds[i] as number, null, "pistol");
      tickN(w);
    }
    expect(ended).toBe(true);
    expect(w.boss.state).toBe(BOSS_STATE.NONE);
  });
});

describe("Story 6.5 F7: it goes after whoever hurts it", () => {
  function fight() {
    const w = world();
    const a = addPlayer(w, "p0", 10, 16);
    const b = addPlayer(w, "p1", 30, 16);
    placeBoss(w, 24, 8);
    w.boss.gapTicks = 1000; // no attacks: target only
    const ev = collect(w);
    return { w, a, b, ev };
  }

  it("no damage → the nearest standing player; then most damage in the last 5 s", () => {
    const { w, ev } = fight();
    tickN(w);
    expect(w.boss.targetId).toBe("p1"); // 30,16 is nearer to 24,8 than 10,16
    tickN(w, ticksFor(B.target.switchMinS));
    recordBossThreat(w, "p0", 50);
    tickN(w);
    expect(w.boss.targetId).toBe("p0");
    expect(ev.filter((e) => e.type === "boss.target_changed").map((e) => (e.type === "boss.target_changed" ? e.playerId : ""))).toEqual(["p1", "p0"]);
  });

  it("switches at most once every 80 ticks while the target stands", () => {
    const { w } = fight();
    tickN(w);
    const t0 = w.tick;
    recordBossThreat(w, "p0", 1000);
    let switchedAt = -1;
    for (let t = 0; t < 200 && switchedAt < 0; t++) {
      tickN(w);
      if (w.boss.targetId === "p0") switchedAt = w.tick;
    }
    expect(switchedAt - t0).toBeGreaterThanOrEqual(ticksFor(B.target.switchMinS));
  });

  it("damage older than 5 s no longer counts", () => {
    const { w } = fight();
    tickN(w);
    recordBossThreat(w, "p0", 1000);
    tickN(w, ticksFor(B.target.threatWindowS) + 10); // the bucket rolled out before the 4 s switch allowed it... or after
    // After > 5 s with no new damage, p0's threat is gone: target = nearest (p1).
    tickN(w, ticksFor(B.target.switchMinS));
    expect(w.boss.targetId).toBe("p1");
  });

  it("switches at once when its target goes down, and never targets a downed or out player", () => {
    const { w, b } = fight();
    tickN(w);
    expect(w.boss.targetId).toBe("p1");
    b.status = "downed";
    tickN(w);
    expect(w.boss.targetId).toBe("p0");
    recordBossThreat(w, "p1", 1e6);
    tickN(w, 200);
    expect(w.boss.targetId).toBe("p0");
  });

  it("switches at once when its target leaves (and the leaver's threat is cleared)", () => {
    const { w } = fight();
    tickN(w);
    recordBossThreat(w, "p1", 1e6);
    tickN(w, ticksFor(B.target.switchMinS) + 1);
    expect(w.boss.targetId).toBe("p1");
    removePlayer(w, "p1");
    tickN(w);
    expect(w.boss.targetId).toBe("p0");
    expect([...w.boss.threat].every((v, i) => Math.floor(i / 10) !== 1 || v === 0)).toBe(true);
  });

  it("ties: equal damage → the nearer player", () => {
    const { w } = fight();
    tickN(w, ticksFor(B.target.switchMinS) + 1);
    recordBossThreat(w, "p0", 30);
    recordBossThreat(w, "p1", 30);
    tickN(w, ticksFor(B.target.switchMinS) + 1);
    expect(w.boss.targetId).toBe("p1");
  });
});

describe("Story 6.5 replay (brief 8)", () => {
  it("same seed + inputs → same digest with the boss arriving, walking and slamming", () => {
    const run = () => {
      const w = world({ systems: {}, map: DOWNTOWN_MAP, seed: 99 });
      w.debug.bossWaves = [1];
      w.debug.godMode = true;
      addPlayer(w, "p0", 24, 16);
      startBuild(w);
      tickN(w, 1200);
      return { d: worldDigest(w), state: w.boss.state, number: w.boss.number };
    };
    const a = run();
    const b = run();
    expect(a.number).toBe(1);
    expect(a.state).not.toBe(BOSS_STATE.NONE);
    expect(a).toEqual(b);
  });

  it("the dev spawn works in any wave, never twice at once", () => {
    const w = world();
    addPlayer(w, "p0", 24, 16);
    expect(startBossWarning(w)).toBe(false); // lobby
    w.run.phase = "wave";
    expect(startBossWarning(w)).toBe(true);
    expect(startBossWarning(w)).toBe(false);
    spawnZombie(w, "walker", 1, 1);
  });
});
