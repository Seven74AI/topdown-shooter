/**
 * Network audit 2026-11: reversed hits (NFR5) at 150 ms RTT ± 10 ms, with and without TCP loss
 * modelled as head-of-line stalls. Runs the real server RunController + client Predictor/fire clock
 * through the Story 2.7/2.12 harness `tools/netsim/hitsSim.ts` (Story 8.8 merged the audit's copy
 * `hitsLossSim.ts` back into it: `Options.loss`). Not game code; not a test.
 *
 *   npx tsx tools/netaudit/runHits.ts [seconds=60] [seeds=3]
 */
import { REWIND_CAP_TICKS } from "../../apps/server/src/run/RunController";
import { simulate, type Options } from "../netsim/hitsSim";

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
    let stallsUp = 0;
    let stallsDown = 0;
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
      stallsUp += r.stalls.up;
      stallsDown += r.stalls.down;
    }
    const label = loss ? `loss ${loss.pct}% × ${loss.stallMs} ms` : "no loss";
    process.stdout.write(
      JSON.stringify({ case: c.name, net: label, apparent, reversed, reversedPct: apparent ? Math.round((1000 * reversed) / apparent) / 10 : 0, inputOverflowDrops: overflow, drainedInputs: drained, localShots, serverShots, rewindCapTicks: REWIND_CAP_TICKS, shotsOverRewindCapPct: shots ? Math.round((1000 * overCap) / shots) / 10 : 0, stallsUp, stallsDown }) + "\n",
    );
  }
}
