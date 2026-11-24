/**
 * Epic 5 balance pass: seeded headless bot runs (the same loop as `runHeadless`: real balance, real
 * systems, bots on the Story 2.10 policy, shopping through `botBuildPhase`) that also log, per player:
 * money earned in each wave by reason, the wallet at the start of every build phase (before
 * shopping), how many of that build's 6 cards the wallet could buy, and what was bought. Prints a
 * summary per team size and writes the raw numbers as JSON (`--out`).
 *
 *   npx tsx tools/sims/balancePass.ts --players 1,2,3,4 --seeds 1-8 --out /tmp/bp.json
 *   npx tsx tools/sims/balancePass.ts --set economy.waveClearBonusPerWave=15 --list smg,wood_barricade
 *
 * Bots never dodge: survival is a weak signal, not difficulty evidence.
 */
import { writeFileSync } from "node:fs";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  botBuildPhase,
  botConfigOf,
  botInput,
  botViewFromWorld,
  bundledBalanceFiles,
  cardPrice,
  createBotShopResult,
  createBotView,
  createHeadlessWorld,
  loadBalance,
  offerFor,
  setInput,
  setLoadout,
  step,
  withOverrides,
  type BalanceOverride,
  type BotView,
  type PlayerInput,
  type SimEvent,
} from "@topdown/shared";

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

/** The card-minded list of `economy/sixWaveSim.test.ts` (Story 5.13). */
const CARD_LIST = ["smg", "wood_barricade", "running_shoes", "wood_barricade", "body_armor_1", "auto_turret", "shotgun", "revive_kit", "body_armor_2", "assault_rifle"];

const overrides: BalanceOverride[] = arg("set").map((s) => {
  const [lhs, value] = s.split("=");
  const dot = (lhs as string).indexOf(".");
  return [(lhs as string).slice(0, dot) as BalanceOverride[0], (lhs as string).slice(dot + 1), Number(value)] as const;
});
/**
 * `--tenwave`: Story 6.1's planned 10-wave run (waves 7–10 mix from its F2, two Brutes in each);
 * `--god`: bots can't die (Story 6.1 D2: every run plays every wave, for the earnings check).
 */
const tenWave = process.argv.includes("--tenwave");
const god = process.argv.includes("--god");
const raw = withOverrides(bundledBalanceFiles(), overrides) as unknown as Record<string, Record<string, unknown>>;
if (tenWave) {
  const w = raw.waves as { runWaves: number; mix: Record<string, number>[]; fixed: Record<string, number>[] };
  w.runWaves = 10;
  w.mix.push(
    { walker: 38, runner: 22, crawler: 15, spitter: 10, bloater: 15 },
    { walker: 35, runner: 24, crawler: 15, spitter: 11, bloater: 15 },
    { walker: 40, runner: 18, crawler: 17, spitter: 10, bloater: 15 },
    { walker: 38, runner: 22, crawler: 15, spitter: 10, bloater: 15 },
  );
  w.fixed.push({ brute: 2 }, { brute: 2 }, { brute: 2 }, { brute: 2 });
}
const balance = loadBalance(raw as unknown as Parameters<typeof loadBalance>[0]);
const teamSizes = range(arg("players")[0] ?? "1,2,3,4");
const seeds = range(arg("seeds")[0] ?? "1-6");
const listArg = arg("list")[0];
const list = listArg === undefined ? CARD_LIST : listArg === "" ? [] : listArg.split(",");
const outPath = arg("out")[0];
/** `--loadout smg:3` or `shotgun:2,machete`: every bot starts with it (weapon comparison; combine with `--list ""`). */
const loadoutArg = arg("loadout")[0];
const loadout = loadoutArg?.split(",").map((w) => {
  const [id, lv] = w.split(":");
  return { id: id as string, level: Number(lv ?? 1) };
});

interface PlayerLog {
  /** [wave-1] → { kill, assist, revive, wave } */
  byWave: { kill: number; assist: number; revive: number; wave: number }[];
  /** [build] wallet before shopping */
  walletAtBuild: number[];
  /** [build] cards on offer the wallet could buy (before shopping) */
  affordableCards: number[];
  /** [build] cheapest card price on offer */
  cheapestCard: number[];
  /** [build] items bought */
  boughtAtBuild: string[][];
  buildingsAtBuild: number[];
}
interface RunLog {
  players: number;
  seed: number;
  heldOut: boolean;
  wavesCleared: number;
  reached: number;
  downsByWave: number[];
  waveTicks: number[];
  waveSize: number[];
  killsByWeapon: Record<string, number>;
  turretKills: number;
  p: PlayerLog[];
}

function run(players: number, seed: number): RunLog {
  const { world, ids } = createHeadlessWorld(balance, seed, players);
  if (god) world.debug.godMode = true;
  if (loadout)
    for (const id of ids) {
      const pl = world.players.get(id);
      const a = loadout[0] as { id: string; level: number };
      const b = loadout[1];
      if (pl) setLoadout(balance, pl.loadout, [a.id, b?.id ?? null], [a.level, b?.level ?? 1]);
    }
  const cfg = botConfigOf(balance);
  const views: BotView[] = ids.map(() => createBotView());
  const inputs: PlayerInput[] = ids.map(() => ({ ...NEUTRAL_INPUT }));
  const shop = createBotShopResult();
  const swapNext = ids.map(() => false);
  const log: RunLog = {
    players,
    seed,
    heldOut: false,
    wavesCleared: 0,
    reached: 0,
    downsByWave: [],
    waveTicks: [],
    waveSize: [],
    killsByWeapon: {},
    turretKills: 0,
    p: ids.map(() => ({ byWave: [], walletAtBuild: [], affordableCards: [], cheapestCard: [], boughtAtBuild: [], buildingsAtBuild: [] })),
  };
  let waveStart = 0;
  world.events.subscribe((e: SimEvent) => {
    const w = Math.max(0, world.waves.number - 1);
    switch (e.type) {
      case "wave.started":
        waveStart = world.tick;
        log.waveSize[e.number - 1] = e.size;
        log.downsByWave[e.number - 1] = 0;
        break;
      case "wave.ended":
        log.wavesCleared = e.number;
        log.waveTicks[e.number - 1] = world.tick - waveStart;
        break;
      case "player.downed":
        log.downsByWave[w] = (log.downsByWave[w] ?? 0) + 1;
        break;
      case "money.earned": {
        if (e.reason === "refund") break;
        const k = ids.indexOf(e.playerId);
        if (k < 0) break;
        const bw = (log.p[k] as PlayerLog).byWave;
        while (bw.length <= w) bw.push({ kill: 0, assist: 0, revive: 0, wave: 0 });
        const row = bw[w] as Record<string, number>;
        row[e.reason] = (row[e.reason] ?? 0) + e.amount;
        break;
      }
      case "zombie.killed": {
        if (e.buildingId !== undefined) log.turretKills++;
        else if (e.killerId !== null) log.killsByWeapon[e.weapon] = (log.killsByWeapon[e.weapon] ?? 0) + 1;
        break;
      }
      default:
        break;
    }
  });
  let lastPhase = "";
  let seq = 0;
  const maxTicks = (tenWave ? 60 : 20) * 60 * 20;
  while (world.tick < maxTicks && world.run.phase !== "results") {
    if (world.run.phase === "build" && lastPhase !== "build") {
      const build = world.waves.number;
      ids.forEach((id, i) => {
        const pl = world.players.get(id);
        const L = log.p[i] as PlayerLog;
        const offer = offerFor(world, id);
        const wallet = pl?.wallet ?? 0;
        L.walletAtBuild[build] = wallet;
        let afford = 0;
        let cheapest = Infinity;
        if (offer)
          for (const c of offer.cards) {
            if (c === "") continue;
            const price = cardPrice(balance, c, offer.build) ?? Infinity;
            cheapest = Math.min(cheapest, price);
            if (price <= wallet) afford++;
          }
        L.affordableCards[build] = afford;
        L.cheapestCard[build] = cheapest;
        botBuildPhase(world, id, list, shop, true);
        L.boughtAtBuild[build] = [...shop.bought];
        L.buildingsAtBuild[build] = shop.buildings;
        if (shop.swap) swapNext[i] = true;
      });
    }
    lastPhase = world.run.phase;
    seq++;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as string;
      botViewFromWorld(world, id, views[i] as BotView);
      const input = inputs[i] as PlayerInput;
      botInput(views[i] as BotView, cfg, seq, input);
      if (swapNext[i] && world.run.phase === "wave") {
        input.swap = true;
        swapNext[i] = false;
      }
      setInput(world, id, input);
    }
    step(world, TICK_DT_S);
  }
  log.heldOut = world.run.heldOut;
  log.reached = world.waves.number;
  return log;
}

const all: RunLog[] = [];
const fmt = (xs: number[]) => xs.map((x) => (Number.isFinite(x) ? Math.round(x) : "-")).join(" / ");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
console.log(`${tenWave ? "10 waves; " : ""}${god ? "god mode; " : ""}overrides: ${overrides.map((o) => o.join(" ")).join("; ") || "none"}; list: ${list.join(",") || "(none)"}${loadoutArg ? `; loadout ${loadoutArg}` : ""}`);
for (const players of teamSizes) {
  const runs = seeds.map((s) => run(players, s));
  all.push(...runs);
  const W = balance.waves.runWaves;
  // Per-wave earnings per player (players in runs that reached that wave's end).
  const perWave: number[] = [];
  const perWaveKill: number[] = [];
  const perWaveAssist: number[] = [];
  for (let w = 0; w < W; w++) {
    const xs: number[] = [];
    const ks: number[] = [];
    const as: number[] = [];
    for (const r of runs)
      if (r.wavesCleared > w)
        for (const p of r.p) {
          const b = p.byWave[w];
          if (!b) continue;
          xs.push(b.kill + b.assist + b.revive + b.wave);
          ks.push(b.kill);
          as.push(b.assist);
        }
    perWave.push(mean(xs));
    perWaveKill.push(mean(ks));
    perWaveAssist.push(mean(as));
  }
  const wallets: number[] = [];
  const afford: number[] = [];
  for (let b = 0; b < W; b++) {
    const xs: number[] = [];
    const as: number[] = [];
    for (const r of runs)
      for (const p of r.p)
        if (p.walletAtBuild[b] !== undefined) {
          xs.push(p.walletAtBuild[b] as number);
          as.push(p.affordableCards[b] as number);
        }
    wallets.push(mean(xs));
    afford.push(mean(as));
  }
  const held = runs.filter((r) => r.heldOut).length;
  const totals = runs.filter((r) => r.heldOut).flatMap((r) => r.p.map((p) => p.byWave.reduce((a, b) => a + b.kill + b.assist + b.revive + b.wave, 0)));
  console.log(`\n== ${players}p (${runs.length} seeds): held out ${held}/${runs.length}; waves cleared ${runs.map((r) => r.wavesCleared).join(",")}`);
  console.log(`  earned per player per wave:  ${fmt(perWave)}  (kill ${fmt(perWaveKill)}; assist ${fmt(perWaveAssist)})`);
  console.log(`  run total per player (held-out runs): mean ${Math.round(mean(totals))} min ${Math.min(...totals)} max ${Math.max(...totals)}`);
  console.log(`  wallet at build 0..${W - 1}:      ${fmt(wallets)}`);
  console.log(`  affordable cards of 6:       ${afford.map((a) => (Number.isFinite(a) ? a.toFixed(1) : "-")).join(" / ")}`);
  console.log(`  wave seconds (mean):         ${Array.from({ length: W }, (_, w) => mean(runs.filter((r) => r.waveTicks[w] !== undefined).map((r) => (r.waveTicks[w] as number) * TICK_DT_S)).toFixed(0)).join(" / ")}`);
  console.log(`  downs by wave (sum):         ${Array.from({ length: W }, (_, w) => runs.reduce((a, r) => a + (r.downsByWave[w] ?? 0), 0)).join(" / ")}`);
  const kbw: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.killsByWeapon)) kbw[k] = (kbw[k] ?? 0) + v;
  console.log(`  kills by weapon: ${Object.entries(kbw).map(([k, v]) => `${k} ${v}`).join(", ")}; turret ${runs.reduce((a, r) => a + r.turretKills, 0)}`);
}
if (outPath) writeFileSync(outPath, JSON.stringify({ overrides, list, runs: all }, null, 0));
