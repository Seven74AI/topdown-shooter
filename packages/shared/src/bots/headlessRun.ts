import type { Balance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { setInput, step, type World } from "../core/world";
import type { DistrictMap } from "../map/districtMap";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { createHeadlessWorld, type BuildCommand, type InputLog } from "../replay/inputLog";
import { botConfigOf, botInput, botViewFromWorld, createBotView, type BotView } from "./botPolicy";
import { botBuildPhase, createBotShopResult } from "./botShop";
import { zombieTypeIndex } from "../zombies/zombieTypes";

/**
 * Story 3.10: one seeded headless run with bots (the Epic 2 retro A10 sim, grown up): the real
 * balance and every real system, `players` bots on the Story 2.10 policy, Pistol starts. On the first
 * tick of every build phase each bot shops from `list` (default `bots.json › shoppingList`) through
 * the real shop and placement rules (`botBuildPhase`) and taps Ready, so a build phase lasts one
 * tick (nothing moves in a build anyway; the heal and returns happen at its start). The run goes
 * until Results (held out or wiped) or `maxTicks`. For sims and balance sweeps (tests,
 * `tools/sims`); not used by the game.
 */
/** Story 5.7: the Brute's type index (the sims log its spawns and kills). */
const BRUTE_TYPE = zombieTypeIndex("brute");

export interface HeadlessRunOptions {
  balance: Balance;
  seed: number;
  players: number;
  list?: readonly string[];
  /** Story 4.1: the district (default `DOWNTOWN_MAP`, the game's map; `replayRun` replays on Downtown). */
  map?: DistrictMap;
  /** Safety stop (default 20 min of game time); a run that hits it reports `timedOut`. */
  maxTicks?: number;
  /**
   * Story 4.4: when given (from `createInputLog(seed, players)`), every input and build action is
   * appended to it with its tick, and `endTick` is set, so `replayRun` can play the run again.
   */
  record?: InputLog;
  /** Story 4.4: called with the World when the run stops (e.g. for `worldDigest`). */
  onEnd?: (world: World) => void;
}

export interface HeadlessWaveLog {
  wave: number;
  size: number;
  /** Ticks from `wave.started` to `wave.ended` (or to the wipe). */
  ticks: number;
  downs: number;
  revives: number;
  /** Players standing when the wave ended (or 0 for the wiped wave). */
  standing: number;
}

export interface HeadlessRunLog {
  seed: number;
  players: number;
  /** The run ended because wave `runWaves` was cleared. */
  heldOut: boolean;
  wiped: boolean;
  /** The tick limit stopped it (neither held out nor wiped). */
  timedOut: boolean;
  /** Waves whose `wave.ended` fired. */
  wavesCleared: number;
  /** The wave the team reached (`waves.number` at the end). */
  reached: number;
  ticks: number;
  earned: number[];
  wallet: number[];
  kills: number[];
  /** Weapons bought by each bot, with the wave whose build phase it was, e.g. "smg@W2" (Story 5.1: "upgrade:smg@W3"). */
  purchases: string[][];
  buildingsPlaced: number[];
  spent: number[];
  /** Money paid to the whole team by reason (kill, assist, revive, wave bonus). */
  earnedBy: { kill: number; assist: number; revive: number; wave: number; refund: number };
  /** Turrets' kills (they pay the owner `buildingKillShare`; included in `earnedBy.kill`). */
  turretKills: number;
  /** Story 5.3: players' kills by weapon id (liveness of a new weapon in the sims). */
  killsByWeapon: Record<string, number>;
  /** Story 5.1: weapon upgrades bought by each bot. */
  upgrades: number[];
  /** Story 5.1: players' kills with a weapon above level I (liveness of upgrades in the sims). */
  upgradedKills: number;
  waves: HeadlessWaveLog[];
  /** Story 5.7 (liveness): Brutes spawned (by wave), killed, and the money paid in the ticks of their kills. */
  brutes: { spawnedInWave: number[]; killed: number; killPay: number };
}

export function runHeadless(opts: HeadlessRunOptions): HeadlessRunLog {
  const { balance, seed, players } = opts;
  const list = opts.list ?? balance.bots.shoppingList;
  const maxTicks = opts.maxTicks ?? 20 * 60 * 20;
  const rec = opts.record;
  if (rec && (rec.seed !== seed >>> 0 || rec.players !== players)) throw new Error("runHeadless: record log is for another seed or team");
  // Lobby → the first build phase, like the server's run start (shared with `replayRun`). Story 4.1: on Downtown by default.
  const { world, ids } = createHeadlessWorld(balance, seed, players, opts.map);
  const recordBuild = rec ? (cmd: BuildCommand): void => void rec.commands.push({ ...cmd, tick: world.tick }) : undefined;
  const cfg = botConfigOf(balance);
  const views: BotView[] = ids.map(() => createBotView());
  const inputs: PlayerInput[] = ids.map(() => ({ ...NEUTRAL_INPUT }));
  const shop = createBotShopResult();
  const swapNext = ids.map(() => false);
  const log: HeadlessRunLog = {
    seed,
    players,
    heldOut: false,
    wiped: false,
    timedOut: false,
    wavesCleared: 0,
    reached: 0,
    ticks: 0,
    earned: [],
    wallet: [],
    kills: ids.map(() => 0),
    purchases: ids.map(() => []),
    buildingsPlaced: ids.map(() => 0),
    spent: ids.map(() => 0),
    earnedBy: { kill: 0, assist: 0, revive: 0, wave: 0, refund: 0 },
    turretKills: 0,
    killsByWeapon: {},
    upgrades: ids.map(() => 0),
    upgradedKills: 0,
    waves: [],
    brutes: { spawnedInWave: [], killed: 0, killPay: 0 },
  };
  let bruteKillTick = -1;
  let current: HeadlessWaveLog | null = null;
  let waveStart = 0;
  const standing = (): number => {
    let n = 0;
    for (const p of world.players.values()) if (p.status === "alive") n++;
    return n;
  };
  world.events.subscribe((e: SimEvent) => {
    switch (e.type) {
      case "wave.started":
        current = { wave: e.number, size: e.size, ticks: 0, downs: 0, revives: 0, standing: 0 };
        waveStart = world.tick;
        log.waves.push(current);
        break;
      case "wave.ended":
        log.wavesCleared = e.number;
        if (current) {
          current.ticks = world.tick - waveStart;
          current.standing = standing();
        }
        break;
      case "player.downed":
        if (current) current.downs++;
        break;
      case "player.revived":
        if (current) current.revives++;
        break;
      case "money.earned":
        log.earnedBy[e.reason] += e.amount; // Story 4.5: refunds are not in `earned` (fiveWaveSim checks the other four)
        if (world.tick === bruteKillTick && (e.reason === "kill" || e.reason === "assist")) log.brutes.killPay += e.amount;
        break;
      case "zombie.brute_spawned":
        log.brutes.spawnedInWave.push(world.waves.number);
        break;
      case "zombie.killed": {
        if (e.buildingId !== undefined) log.turretKills++;
        if (world.zombies.type[e.zombieId] === BRUTE_TYPE) {
          log.brutes.killed++;
          bruteKillTick = world.tick;
        }
        const k = e.killerId === null || e.buildingId !== undefined ? -1 : ids.indexOf(e.killerId);
        if (k >= 0) {
          log.kills[k] = (log.kills[k] as number) + 1;
          log.killsByWeapon[e.weapon] = (log.killsByWeapon[e.weapon] ?? 0) + 1;
          const lo = world.players.get(e.killerId as string)?.loadout;
          const slot = lo ? (lo.slots[0].weapon === e.weapon ? lo.slots[0] : lo.slots[1]?.weapon === e.weapon ? lo.slots[1] : null) : null;
          if (slot && slot.level > 1) log.upgradedKills++;
        }
        break;
      }
      case "team.wiped":
        if (current) current.ticks = world.tick - waveStart;
        break;
      default:
        break;
    }
  });
  let lastPhase = "";
  let seq = 0;
  while (world.tick < maxTicks && world.run.phase !== "results") {
    if (world.run.phase === "build" && lastPhase !== "build") {
      const wave = world.waves.number + 1;
      ids.forEach((id, i) => {
        botBuildPhase(world, id, list, shop, true, recordBuild);
        for (const w of shop.bought) (log.purchases[i] as string[]).push(`${w}@W${wave}`);
        log.buildingsPlaced[i] = (log.buildingsPlaced[i] as number) + shop.buildings;
        log.spent[i] = (log.spent[i] as number) + shop.spent;
        log.upgrades[i] = (log.upgrades[i] as number) + shop.upgrades;
        if (shop.swap) swapNext[i] = true;
      });
    }
    lastPhase = world.run.phase;
    seq++;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as string;
      const view = views[i] as BotView;
      const input = inputs[i] as PlayerInput;
      botViewFromWorld(world, id, view);
      botInput(view, cfg, seq, input);
      if (swapNext[i] && world.run.phase === "wave") {
        input.swap = true; // the first wave tick (a swap in the one-tick build would be fine too)
        swapNext[i] = false;
      }
      setInput(world, id, input);
      rec?.commands.push({ kind: "input", playerId: id, input: { ...input }, tick: world.tick });
    }
    step(world, TICK_DT_S);
  }
  if (rec) rec.endTick = world.tick;
  opts.onEnd?.(world);
  log.heldOut = world.run.heldOut;
  log.wiped = world.teamWiped;
  log.timedOut = world.run.phase !== "results";
  log.reached = world.waves.number;
  log.ticks = world.tick;
  log.earned = ids.map((id) => world.players.get(id)?.earned ?? 0);
  log.wallet = ids.map((id) => world.players.get(id)?.wallet ?? 0);
  return log;
}

/** One line per run for test output and `tools/sims`. */
export function formatRunLine(r: HeadlessRunLog): string {
  const end = r.heldOut ? "HELD OUT" : r.wiped ? `wiped in W${r.reached}` : `timed out in W${r.reached}`;
  const buys = r.purchases.map((p) => (p.length ? p.join("+") : "-")).join(", ");
  return (
    `${r.players}p seed ${r.seed}: ${end} (cleared ${r.wavesCleared}); earned ${r.earned.join("/")}; kills ${r.kills.join("/")}; ` +
    `wallet ${r.wallet.join("/")}; weapons ${buys}; buildings ${r.buildingsPlaced.join("/")}; ` +
    `downs/revives by wave ${r.waves.map((w) => `${w.downs}/${w.revives}`).join(" ")}; ` +
    `team money kill/assist/revive/wave ${r.earnedBy.kill}/${r.earnedBy.assist}/${r.earnedBy.revive}/${r.earnedBy.wave} (refunds ${r.earnedBy.refund}); turret kills ${r.turretKills}`
  );
}
