/**
 * Story 3.10 balance sweep (Story 6.1: `runWaves` waves, 10 now; the file keeps its name): seeded headless runs with bots (`runHeadless`, the same run as
 * `economy/fiveWaveSim.test.ts` / `tenWaveSim.test.ts`), printed one line per run plus a summary per team size next to the GDD target
 * (2,500–3,000 per player over the 10-wave run).
 *
 *   npx tsx tools/sims/fiveWave.ts --players 2,3,4 --seeds 1-6
 *   npx tsx tools/sims/fiveWave.ts --set economy.waveClearBonusPerWave=15 --set weapons.smg.price=150
 *   npx tsx tools/sims/fiveWave.ts --list smg,wood_barricade,auto_turret
 *   npx tsx tools/sims/fiveWave.ts --waves 6        (Story 6.1: a shorter run, `runWaves` override; default the balance's 10)
 *   npx tsx tools/sims/fiveWave.ts --god            (Story 6.1 D2: bots can't die, every run plays every wave: the earnings check)
 *
 * `--set file.path=value` overrides a numeric balance value (`withOverrides`; the result is validated).
 */
import { bundledBalanceFiles, formatRunLine, loadBalance, runHeadless, withOverrides, type BalanceOverride } from "@topdown/shared";

function arg(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}` && argv[i + 1] !== undefined) out.push(argv[i + 1] as string);
  return out;
}

function range(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map(Number);
    if (b === undefined) out.push(a as number);
    else for (let n = a as number; n <= b; n++) out.push(n);
  }
  return out;
}

const overrides: BalanceOverride[] = arg("set").map((s) => {
  const [lhs, value] = s.split("=");
  const dot = (lhs as string).indexOf(".");
  return [(lhs as string).slice(0, dot) as BalanceOverride[0], (lhs as string).slice(dot + 1), Number(value)] as const;
});
const wavesArg = arg("waves")[0];
if (wavesArg !== undefined) overrides.push(["waves", "runWaves", Number(wavesArg)]);
const god = process.argv.includes("--god");
const balance = loadBalance(withOverrides(bundledBalanceFiles(), overrides));
const teamSizes = range(arg("players")[0] ?? "2,3,4");
const seeds = range(arg("seeds")[0] ?? "1-5");
const listArg = arg("list")[0];
const list = listArg === undefined ? undefined : listArg === "" ? [] : listArg.split(",");
console.log(`${balance.waves.runWaves} waves${god ? ", god mode" : ""}; GDD target 2,500–3,000 per player (10 waves); overrides: ${overrides.map((o) => o.join(" ")).join("; ") || "none"}; list: ${(list ?? balance.bots.shoppingList).join(",") || "(empty)"}`);
for (const players of teamSizes) {
  const runs = seeds.map((seed) => runHeadless({ balance, seed, players, god, ...(list ? { list } : {}) }));
  for (const r of runs) console.log(`${formatRunLine(r)} | Bloater bursts by wave ${r.bloaters.burstsInWave.join("/") || "-"}, chains ${r.bloaters.chains}, blast hits on players ${r.bloaters.playerHits}`);
  const held = runs.filter((r) => r.ending === "extracted").length; // Story 6.11
  const cleared = runs.map((r) => r.wavesCleared);
  const earned = runs.flatMap((r) => r.earned);
  const mean = earned.reduce((a, b) => a + b, 0) / Math.max(1, earned.length);
  const byWave = Array.from({ length: balance.waves.runWaves }, (_, i) => runs.filter((r) => r.wavesCleared >= i + 1).length);
  console.log(
    `== ${players}p: held out ${held}/${runs.length}; cleared by wave ${byWave.join("/")}; waves cleared ${cleared.join(",")}; ` +
      `earned mean ${mean.toFixed(0)} (min ${Math.min(...earned)}, max ${Math.max(...earned)})`,
  );
}
