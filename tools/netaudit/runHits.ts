/**
 * Network audit 2026-11: reversed hits (NFR5) at 150 ms RTT ± 10 ms, with and without TCP loss
 * modelled as head-of-line stalls. Runs the real server RunController + client Predictor/fire clock
 * through `hitsLossSim.ts` (a copy of the Story 2.7 harness). Not game code; not a test.
 *
 *   npx tsx tools/netaudit/runHits.ts [seconds=60] [seeds=3]
 */
import { simulate, type Options } from "./hitsLossSim";

/** REWIND_CAP_MS (300) in 50 ms ticks: shots asking for an older view are clamped (apps/server/src/net/limits.ts). */
const REWIND_CAP_TICKS = 6;

const seconds = Number(process.argv[2] ?? 60);
const seeds = Number(process.argv[3] ?? 3);

interface Case {
  name: string;
  o: Partial<Options>;
}

const cases: Case[] = [
  { name: "150 walkers, standing", o: { walkers: 150, kite: false } },
  { name: "150 walkers, kiting", o: { walkers: 150, kite: true } },
  { name: "20 runners, kiting", o: { zombieType: "runner", kite: true } },
];
const losses: (Options["loss"] | undefined)[] = [undefined, { pct: 1, stallMs: 200 }, { pct: 2, stallMs: 200 }, { pct: 1, stallMs: 400 }];

for (const c of cases) {
  for (const loss of losses) {
    let apparent = 0;
    let reversed = 0;
    let overflow = 0;
    let drained = 0;
    let shots = 0;
    let overCap = 0;
    let serverShots = 0;
    let localShots = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = simulate({ seconds, oneWayMs: 75, jitterHalfMs: 10, seed, weapon: "pistol", kite: false, ...c.o, ...(loss ? { loss } : {}) });
      apparent += r.apparentHits;
      reversed += r.reversed;
      overflow += r.drops.overflow;
      drained += r.drops.drained;
      shots += r.viewOffsets.length;
      overCap += r.viewOffsets.filter((v) => v > REWIND_CAP_TICKS).length;
      serverShots += r.serverShotSeqs.length;
      localShots += r.localShotSeqs.length;
    }
    const label = loss ? `loss ${loss.pct}% × ${loss.stallMs} ms` : "no loss";
    process.stdout.write(
      JSON.stringify({ case: c.name, net: label, apparent, reversed, reversedPct: apparent ? Math.round((1000 * reversed) / apparent) / 10 : 0, inputOverflowDrops: overflow, drainedInputs: drained, localShots, serverShots, shotsOverRewindCapPct: shots ? Math.round((1000 * overCap) / shots) / 10 : 0 }) + "\n",
    );
  }
}
