import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { formatRunLine, runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import type { World } from "../core/world";
import { isSpawnBuried } from "../waves/spawnPick";
import { runSupplies, suppliesEnding, type RunRecord } from "../meta/supplies";

/** Story 7.2 (T6, brief 9): each bot's run record at the end, and the waves the run really ended / the wave it fell in. */
function recordsAtEnd(w: World): { records: RunRecord[] } {
  const records = [...w.players.values(), ...[...w.heldPlayers.values()].map((h) => h.player)].map((p) => ({ wavesIn: p.wavesIn, endlessWavesIn: p.endlessWavesIn, bossesIn: p.bossesIn, endlessBossesIn: p.endlessBossesIn }));
  return { records };
}

/**
 * Story 6.1 (AC 5; brief lines 9 and 15): the full 10-wave run with the real balance and every real
 * system (`runHeadless`: bots shop from `bots.json › shoppingList` and tap Ready).
 *
 * (a) Economy run (D2): 4 bots that can't die (`god`), seeds 1–3, so every run really plays all 10
 *     waves; each player's earnings are logged next to the GDD target (2,500–3,000 per player) with
 *     the gap in %. Earnings are logged only (D3: the Epic 5 balance pass owns the numbers).
 * (b) Survival run: 1–4 bots × seeds 1–3, mortal: every run ends on Results (extracted or wiped,
 *     never the tick limit); survival by wave is logged. Bot survival is not difficulty evidence.
 */
const balance = loadBalance();
const SEEDS = [1, 2, 3];
const GDD_MIN = 2500;
const GDD_MAX = 3000;
const info = (msg: string): void => (globalThis as unknown as { console: { info(m: string): void } }).console.info(msg);

/** Gap of `v` to the GDD band in % (0 inside it). */
const gapPct = (v: number): number => (v < GDD_MIN ? ((v - GDD_MIN) / GDD_MIN) * 100 : v > GDD_MAX ? ((v - GDD_MAX) / GDD_MAX) * 100 : 0);

describe("Story 6.1: ten-wave sim", () => {
  it("(a) god-mode bots, 4 players, seeds 1–3: all 10 waves played and extracted; money adds up; Brutes in waves 7–10; Bloaters burst in wave 10; earnings vs the GDD", () => {
    expect(balance.waves.runWaves).toBe(10);
    const lines: string[] = [];
    const runs: HeadlessRunLog[] = [];
    for (const seed of SEEDS) {
      let god = false;
      // Story 6.2 review M3: from wave 7 (stage 4) the run's collapsed alley buries one mouth, and the
      // wave director really picks the breaches. Story 6.14 (6.2 R2): the picks of each tick are counted
      // (the wave's `typeSpawned` total: one per spawned wave zombie, i.e. per pick), and only that many
      // newest ring entries are read; a tick with as many picks as the ring holds fails instead of
      // silently reading nothing.
      const buriedAtRuins = new Set<string>();
      const pickedFrom7 = new Set<string>();
      let prevSpawned = -1;
      let picksRead = 0;
      const onTick = (w: World): void => {
        let spawned = 0;
        for (let t = 0; t < w.waves.typeSpawned.length; t++) spawned += w.waves.typeSpawned[t] as number;
        const picks = prevSpawned < 0 ? 0 : spawned >= prevSpawned ? spawned - prevSpawned : spawned; // the count restarts each wave
        prevSpawned = spawned;
        if (w.decay.stage < 4) return; // picks before stage 4 stay out
        if (buriedAtRuins.size === 0) w.map.spawnPoints.forEach((sp, i) => void (isSpawnBuried(w, i) && buriedAtRuins.add(sp.name)));
        const cap = Math.min(w.waves.recentSpawns.length, balance.waves.spawnPick.recentPicks);
        expect(picks, `seed ${seed} tick ${w.tick}: more picks in one tick than the ring holds`).toBeLessThan(cap);
        for (let k = 1; k <= picks; k++) {
          const at = (w.waves.recentSpawnHead - k + cap) % cap;
          pickedFrom7.add((w.map.spawnPoints[w.waves.recentSpawns[at] as number] as { name: string }).name);
        }
        picksRead += picks;
      };
      let end: ReturnType<typeof recordsAtEnd> | null = null;
      const r = runHeadless({ balance, seed, players: 4, god: true, onTick, onEnd: (w) => void ((god = w.debug.godMode), (end = recordsAtEnd(w))) });
      // Story 7.2 (T6): every bot was in all 10 waves and the Behemoth; extracted → 250 Supplies each (no rookie line here).
      expect(end!.records.map((x) => [x.wavesIn, x.bossesIn, x.endlessWavesIn])).toEqual(Array.from({ length: 4 }, () => [10, 1, 0]));
      for (const x of end!.records) expect(runSupplies(x, suppliesEnding(r.ending, true), 10_000).total).toBe(250);
      expect([...buriedAtRuins].length, `seed ${seed}: one alley mouth buried at stage 4`).toBe(1);
      expect([...buriedAtRuins][0], `seed ${seed}`).toMatch(/^alley_[123]_mouth$/);
      expect(picksRead, `seed ${seed}: picks read from wave 7`).toBeGreaterThan(100);
      expect(pickedFrom7.has([...buriedAtRuins][0] as string), `seed ${seed}: the buried mouth is never picked`).toBe(false);
      expect([...pickedFrom7].some((n) => n.startsWith("breach_")), `seed ${seed}: a breach used from wave 7`).toBe(true);
      runs.push(r);
      // Mutation check: mortal 4-bot runs often clear all 10 waves too, so prove D2's method was really used.
      expect(god, `seed ${seed}: god mode on`).toBe(true);
      expect(r.waves.reduce((a, w) => a + w.downs, 0), `seed ${seed}: no one went down`).toBe(0);
      expect(r.timedOut, `seed ${seed}`).toBe(false); // never the tick limit
      expect(r.wavesCleared).toBe(10); // liveness: all 10 waves really played
      expect((r.ending === "extracted")).toBe(true);
      expect(r.wiped).toBe(false);
      expect(r.waves.map((w) => w.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(r.waves.map((w) => w.size)).toEqual([40, 80, 120, 160, 200, 240, 280, 320, 360, 400]);
      // Money adds up per player (review L10: building refunds — 6.2's 50 % back when rubble or a
      // fire takes a building — are not in `earned`; the log keeps them per player).
      for (let i = 0; i < 4; i++) {
        expect(r.wallet[i]).toBe(balance.economy.startingWallet + (r.earned[i] as number) + (r.refunded[i] as number) - (r.spent[i] as number));
      }
      expect(r.earnedBy.kill + r.earnedBy.assist + r.earnedBy.revive + r.earnedBy.wave + r.earnedBy.boss + r.earnedBy.event).toBe(r.earned.reduce((a, b) => a + b, 0)); // 6.10: + the survivor's "event" pay
      expect(r.earnedBy.boss, `seed ${seed}: the Behemoth's 150 to each of the 4 (Story 6.7)`).toBe(4 * balance.boss.killPay);
      // F3: exactly 2 Brutes in each of waves 7–10 (one in 5 and 6).
      for (let w = 5; w <= 10; w++) expect(r.brutes.spawnedInWave.filter((n) => n === w).length, `seed ${seed} wave ${w}`).toBe(w >= 7 ? 2 : 1);
      expect(r.bloaters.burstsInWave[9] ?? 0, `seed ${seed}: Bloater bursts in wave 10`).toBeGreaterThanOrEqual(1);
      lines.push(`${formatRunLine(r)} | ticks ${r.ticks} | kills by weapon ${JSON.stringify(r.killsByWeapon)} | buildings ${r.buildingsPlaced.join("/")} (cap ${balance.buildings.maxPerPlayer})`);
    }
    const earned = runs.flatMap((r) => r.earned);
    const mean = Math.round(earned.reduce((a, b) => a + b, 0) / earned.length);
    const min = Math.min(...earned);
    const max = Math.max(...earned);
    info(
      `[ten-wave sim (a)] 4 god-mode bots, seeds ${SEEDS.join(",")}; GDD target ${GDD_MIN}–${GDD_MAX} per player\n${lines.join("\n")}\n` +
        `earned per player: mean ${mean} (gap ${gapPct(mean).toFixed(1)} %), range ${min}–${max} (gaps ${gapPct(min).toFixed(1)} % / ${gapPct(max).toFixed(1)} %)`,
    );
    expect(mean).toBeGreaterThan(0);
  }, 180_000);

  it("(b) mortal bots, 1–4 players × seeds 1–3: every run ends on Results (never the tick limit); survival by wave logged", () => {
    const lines: string[] = [];
    const summary: string[] = [];
    let reachedLate = 0;
    let wipes7_2 = 0;
    let extracts7_2 = 0;
    for (const players of [1, 2, 3, 4]) {
      const rs: HeadlessRunLog[] = [];
      for (const seed of SEEDS) {
        let end: ReturnType<typeof recordsAtEnd> | null = null;
        const r = runHeadless({ balance, seed, players, onEnd: (w) => void (end = recordsAtEnd(w)) });
        rs.push(r);
        // Story 7.2 (T6, brief 9): wavesIn == the waves that really ended, plus the wave a wipe fell in (D8: the
        // team was in wave `reached` that never ended; a wipe in a build phase has reached == wavesCleared).
        const fellInWave = r.ending !== "extracted" && r.reached > r.wavesCleared;
        const expected = r.wavesCleared + (fellInWave ? 1 : 0);
        for (const x of end!.records) {
          expect(x.wavesIn, `${players}p seed ${seed}`).toBe(expected);
          const pay = runSupplies(x, suppliesEnding(r.ending, true), 10_000);
          expect(pay.total).toBe(r.ending === "extracted" ? 250 : expected * 10 + Math.min(x.bossesIn, 1) * 50);
        }
        if (r.ending === "extracted") extracts7_2++;
        else wipes7_2++;
        expect(r.timedOut, `${players}p seed ${seed}`).toBe(false); // F6: a run always ends on Results
        expect((r.ending === "extracted") !== r.wiped).toBe(true); // exactly one ending
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1);
        if ((r.ending === "extracted")) expect(r.wavesCleared).toBe(10);
        else expect(r.wavesCleared).toBe(r.reached - 1); // "Wave reached N": the wave it died in
        if (r.reached >= 7) reachedLate++;
        lines.push(formatRunLine(r));
      }
      const byWave = Array.from({ length: 10 }, (_, i) => rs.filter((r) => r.wavesCleared >= i + 1).length);
      const earned = rs.flatMap((r) => r.earned);
      summary.push(`${players}p: extracted ${rs.filter((r) => (r.ending === "extracted")).length}/${rs.length}, cleared by wave ${byWave.join("/")}, earned per player mean ${Math.round(earned.reduce((a, b) => a + b, 0) / earned.length)}`);
    }
    info(`[ten-wave sim (b)] mortal bots (not difficulty evidence)\n${lines.join("\n")}\n${summary.join("\n")}`);
    expect(reachedLate).toBeGreaterThan(0); // liveness: some mortal runs really reach the new waves 7–10
    expect(wipes7_2, "Story 7.2: at least one run wiped (its Supplies checked)").toBeGreaterThan(0);
    // The extracting runs with checked Supplies are (a)'s god-mode runs (mortal bots rarely extract: not difficulty evidence).
    info(`[ten-wave sim (b)] Story 7.2: Supplies checked on ${wipes7_2} wiped and ${extracts7_2} extracted runs`);
  }, 180_000);
});
