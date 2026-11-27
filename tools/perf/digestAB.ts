/**
 * Story 10.3 (D13): a gameplay-free change must keep the sim bit for bit. Whole bot runs (4 god-mode bots, 10 waves,
 * the Behemoth, the vote), the World digest every 100 ticks folded into one number per seed. Run it on two trees and
 * compare the lines (they must be equal).
 *
 *   npx tsx tools/perf/digestAB.ts [seeds=1,2,3]
 */
import { loadBalance, runHeadless, worldDigest } from "@topdown/shared";

const balance = loadBalance();
for (const seed of (process.argv[2] ?? "1,2,3").split(",").map(Number)) {
  let fold = 0;
  let samples = 0;
  const log = runHeadless({
    balance,
    seed,
    players: 4,
    god: true,
    onTick: (w) => {
      if (w.tick % 100 !== 0) return;
      fold = (Math.imul(fold, 31) + worldDigest(w)) >>> 0;
      samples++;
    },
  });
  console.log(JSON.stringify({ seed, waves: log.waves?.length, ticks: log.ticks, samples, fold }));
}
