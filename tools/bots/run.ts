/**
 * Headless bot players for repeatable load tests (Story 2.10, AC 4).
 *
 *   npm run bots -- --room ABCD --count 3                   # fill a browser host's room
 *   npm run bots -- --count 4 --scenario net150 --until-wave 4   # 4 bots: create, start, measure
 *   npm run bots -- --count 4 --scenario net150 --lag 150 --jitter 20 --loss 1   # on the lossy line
 *
 * Options:
 *   --url <http(s)://…>   game server (default http://localhost:2567; production: https://hordes.sevend.io/api)
 *   --origin <origin>     Origin header for a server with an Origin check (e.g. https://hordes.sevend.io)
 *   --room <CODE>         join this room; without it the first bot creates one and starts it
 *                         once every bot is in and Ready
 *   --count <1–4>         bots (default 3)
 *   --scenario net150     with create: the fixed test scenario (server needs ALLOW_TEST_SCENARIOS=1)
 *   --until-wave <N>      leave after wave N ended (default: run until Ctrl-C or the run ends)
 *   --max-seconds <S>     leave after S seconds whatever happens (default 900)
 *   --hold-fire <S>       don't fire for the first S seconds of each wave, so the horde reaches the
 *                         150-alive cap (the worst case for bandwidth; default 0)
 *   --lag <ms>            Story 8.8: put a lagged TCP line between the bots and a LOCAL --url
 *                         (round trip, ms; in-process, built on tools/netaudit/lagLine.ts)
 *   --jitter <ms>         spread of each one-way delay on that line (± half; default 0)
 *   --loss <pct>          head-of-line stalls on that line: per chunk, in BOTH directions, that
 *                         chunk and everything behind it waits --stall ms (TCP retransmit; 0–20 %)
 *   --stall <ms>          the extra wait of a stalled chunk (default 200, 0–1000)
 *                         e.g. --lag 150 --jitter 20 --loss 1 (the network pass's lossy line).
 *                         Refused for a remote --url. The summary adds a `bots_line` line with the
 *                         stalls injected per direction.
 *   --cut-bot <N>         Story 8.1: bot N (1-based) connects through a line that can be cut both ways
 *   --cut-at <S>          … cut S seconds after the run started (default 30) …
 *   --cut-for <S>         … for S seconds (default 8): no bytes, no close. The bot's own 3 s watchdog,
 *                         token reconnect and guest-token takeover bring it back; it logs
 *                         `bot_reconnected` (after X ms, via token | guest) and a `bot_cut` line.
 *
 * Prints one JSON line per bot per wave (`bot_wave`) and, at the end, a `bots_summary` line and
 * (Story 3.10) a `bots_economy` line: the run's end (extracted / wiped, wave) and per bot its kills,
 * money earned (to compare with the GDD target), wallet, weapons bought and buildings placed. The bots
 * shop from `bots.json › shoppingList` in every build phase.
 */
import { readFileSync } from "node:fs";
import { C2S, MAX_PLAYERS, isRoomCode, isTestScenario, normalizeRoomCode, type TestScenario } from "@topdown/shared";
import { BotClient, type BotWaveStats } from "./botClient";
import { startCutLine, type CutLine } from "../netaudit/cutLine";
import { startLagLine, type LagLine } from "../netaudit/lagLine";
import { lineUrl, parseLine, type LineArgs } from "./lineArgs";

interface Args {
  url: string;
  origin?: string;
  room?: string;
  count: number;
  scenario?: TestScenario;
  untilWave: number;
  maxSeconds: number;
  holdFireS: number;
  /** Story 8.8: the lagged / lossy line in front of a local --url (null = straight to --url). */
  line: LineArgs | null;
  /** Story 8.1: the cut switch (bot index 1-based, start and length in seconds); 0 = off. */
  cutBot: number;
  cutAtS: number;
  cutForS: number;
}

/** Flags that take a value. Anything else (but --help / -h) is refused. */
const FLAGS = ["url", "origin", "room", "count", "scenario", "until-wave", "max-seconds", "hold-fire", "lag", "jitter", "loss", "stall", "cut-bot", "cut-at", "cut-for"] as const;

/** The usage text: this file's header comment. */
function usage(): string {
  const src = readFileSync(new URL(import.meta.url), "utf8");
  const header = src.slice(src.indexOf("/**") + 3, src.indexOf("*/"));
  return header
    .split("\n")
    .map((l) => l.replace(/^ \* ?/, ""))
    .join("\n")
    .trim();
}

function parseArgs(argv: readonly string[]): Args {
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] as string;
    if (!flag.startsWith("--") || !(FLAGS as readonly string[]).includes(flag.slice(2))) throw new Error(`unknown option ${flag} (see --help)`);
    if (argv[i + 1] === undefined || (argv[i + 1] as string).startsWith("--")) throw new Error(`${flag} needs a value`);
  }
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const count = Number(get("count") ?? 3);
  if (!Number.isInteger(count) || count < 1 || count > MAX_PLAYERS) throw new Error(`--count must be 1–${MAX_PLAYERS}`);
  const roomRaw = get("room");
  const room = roomRaw === undefined ? undefined : normalizeRoomCode(roomRaw);
  if (room !== undefined && !isRoomCode(room)) throw new Error(`--room ${roomRaw} is not a room code`);
  const scenario = get("scenario");
  if (scenario !== undefined && !isTestScenario(scenario)) throw new Error(`--scenario ${scenario} is unknown`);
  const origin = get("origin");
  const url = get("url") ?? "http://localhost:2567";
  return {
    url,
    ...(origin ? { origin } : {}),
    ...(room ? { room } : {}),
    count,
    ...(scenario ? { scenario } : {}),
    untilWave: Number(get("until-wave") ?? Infinity),
    maxSeconds: Number(get("max-seconds") ?? 900),
    holdFireS: Number(get("hold-fire") ?? 0),
    line: parseLine(get, url),
    cutBot: cutBotOf(get("cut-bot"), count),
    cutAtS: Number(get("cut-at") ?? 30),
    cutForS: Number(get("cut-for") ?? 8),
  };
}

/** Story 8.8: starts the line in front of the local --url; returns the URL the bots use instead. */
async function startLine(args: Args, log: (line: Record<string, unknown>) => void): Promise<{ url: string; line: LagLine | null }> {
  if (!args.line) return { url: args.url, line: null };
  const u = new URL(args.url);
  const target = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const line = await startLagLine({ listen: 0, targetHost: u.hostname === "localhost" ? "127.0.0.1" : u.hostname.replace(/^\[|\]$/g, ""), target, ...args.line });
  log({ msg: "bots_line_on", via: line.port, target, ...args.line });
  return { url: lineUrl(args.url, line.port), line };
}

/** Story 8.1: `--cut-bot` must name one of the bots. */
function cutBotOf(raw: string | undefined, count: number): number {
  if (raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > count) throw new Error(`--cut-bot must be 1–${count}`);
  return n;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const r1 = (n: number): number => Math.round(n * 10) / 10;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const args = parseArgs(argv);
  const log = (line: Record<string, unknown>): void => console.log(JSON.stringify(line));
  const bots: BotClient[] = [];
  const { url, line } = await startLine(args, log);
  const base = { url, ...(args.origin ? { origin: args.origin } : {}), log, holdFireS: args.holdFireS };
  // Story 8.1: the cut bot's line: a local TCP pass-through in front of the bots' URL (chained BEFORE 8.8's lag line when it is on).
  let cutLine: CutLine | null = null;
  const urlFor = async (bot: number): Promise<string> => {
    if (bot !== args.cutBot) return url;
    const u = new URL(url);
    cutLine = await startCutLine({ targetHost: u.hostname === "localhost" ? "127.0.0.1" : u.hostname, target: Number(u.port || (u.protocol === "https:" ? 443 : 80)) });
    u.hostname = "127.0.0.1";
    u.port = String(cutLine.port);
    return u.toString().replace(/\/$/, "");
  };
  let roomId = args.room;
  if (!roomId) {
    const host = await BotClient.connect({ ...base, url: await urlFor(1), name: "Bot 1", ...(args.scenario ? { scenario: args.scenario } : {}) });
    bots.push(host);
    roomId = host.roomId;
    log({ msg: "room_created", roomId, scenario: args.scenario ?? null });
  }
  for (let i = bots.length; i < args.count; i++) {
    bots.push(await BotClient.connect({ ...base, url: await urlFor(i + 1), name: `Bot ${i + 1}`, roomId }));
  }
  log({ msg: "bots_joined", roomId, count: bots.length });

  const startedAt = performance.now();
  const timeUp = (): boolean => performance.now() - startedAt > args.maxSeconds * 1000;
  // We created the room: the host bot starts it once everyone is in and Ready.
  if (!args.room) {
    const host = bots[0] as BotClient;
    while (!timeUp()) {
      const s = host.room.state;
      let ready = 0;
      s?.players?.forEach((p) => {
        if (p.ready) ready++;
      });
      if (host.isHost && s?.players?.size === bots.length && ready === bots.length) break;
      await sleep(100);
    }
    host.room.send(C2S.RUN_START, {});
    log({ msg: "run_start_sent", roomId });
  }

  const cutOn = cutLine as CutLine | null;
  if (cutOn && args.cutBot > 0) {
    const bot = bots[args.cutBot - 1] as BotClient;
    setTimeout(() => {
      const me = bot.room.state?.players?.get(bot.playerId);
      const at = { hp: me?.hp, wallet: me?.wallet, weapon0: me?.weapon0, weapon1: me?.weapon1, wave: bot.room.state?.wave, phase: bot.room.state?.phase };
      log({ msg: "bot_cut_started", bot: bot.name, forS: args.cutForS, at });
      const endsAt = performance.now() + args.cutForS * 1000;
      void cutOn.cut(args.cutForS * 1000).then(async () => {
        log({ msg: "bot_cut_ended", bot: bot.name, stats: cutOn.stats() });
        while (bot.link !== "ok" && performance.now() - endsAt < 60_000) await sleep(50);
        await sleep(300); // the next patch
        const now = bot.room.state?.players?.get(bot.playerId);
        log({
          msg: "bot_cut",
          bot: bot.name,
          backAfterCutEndMs: Math.round(performance.now() - 300 - endsAt),
          reconnects: bot.reconnects,
          at,
          now: { hp: now?.hp, wallet: now?.wallet, weapon0: now?.weapon0, weapon1: now?.weapon1, held: now?.heldUntilTick },
        });
      });
    }, args.cutAtS * 1000);
  }

  let stopping = false;
  const stop = async (reason: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    summary(bots, reason, log);
    if (line && args.line) log({ msg: "bots_line", ...args.line, ...line.stats() }); // Story 8.8: stalls per direction
    await Promise.all(bots.map((b) => b.stop()));
    await line?.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("interrupted"));
  for (;;) {
    await sleep(250);
    const phase = bots[0]?.room.state?.phase;
    if (bots.every((b) => b.lastEndedWave >= args.untilWave)) return stop(`wave ${args.untilWave} ended`);
    if (phase === "results") return stop(`run ended (${bots[0]?.room.state?.resultEnding || "wiped"})`); // Story 6.11
    const closed = bots.find((b) => b.closed)?.closed;
    if (closed) return stop(`room closed (code ${closed.code}${closed.reason ? `: ${closed.reason}` : ""})`);
    if (timeUp()) return stop(`--max-seconds ${args.maxSeconds} reached`);
  }
}

/** One line with every wave's per-bot numbers and the mean over bots. */
function summary(bots: readonly BotClient[], reason: string, log: (line: Record<string, unknown>) => void): void {
  const byWave = new Map<number, BotWaveStats[]>();
  for (const b of bots) for (const w of b.waves) byWave.set(w.wave, [...(byWave.get(w.wave) ?? []), w]);
  const waves = [...byWave.entries()].map(([wave, rows]) => ({
    wave,
    bots: rows.length,
    seconds: r1(mean(rows.map((r) => r.seconds))),
    meanAvgDownKBps: r1(mean(rows.map((r) => r.avgDownKBps))),
    maxPeakDownKBps: Math.max(...rows.map((r) => r.peakDownKBps)),
    meanAvgUpKBps: r1(mean(rows.map((r) => r.avgUpKBps))),
    meanRttMs: Math.round(mean(rows.map((r) => r.rttMs))),
    meanZombiesInFrame: r1(mean(rows.map((r) => r.avgZombiesInFrame))),
    kills: rows.reduce((a, r) => a + r.kills, 0),
    downs: rows.reduce((a, r) => a + r.downs, 0),
    revives: rows.reduce((a, r) => a + r.revives, 0),
  }));
  log({ msg: "bots_summary", reason, roomId: bots[0]?.roomId, waves });
  const state = bots[0]?.room.state;
  log({
    msg: "bots_economy",
    phase: state?.phase,
    ending: state?.resultEnding ?? "", // Story 6.11
    resultWave: state?.resultWave ?? 0,
    bots: bots.map((b) => {
      const p = state?.players?.get(b.playerId);
      return {
        bot: b.name,
        playerId: b.playerId,
        kills: p?.kills ?? 0,
        earned: p?.earned ?? 0,
        wallet: p?.wallet ?? 0,
        spent: b.spent,
        weapons: b.purchases,
        buildings: b.buildingsPlaced,
      };
    }),
  });
}

/** Join refusals arrive as SDK errors with a code (e.g. 526 invalid_options); print what there is. */
function errorText(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o === "object" && (o.code !== undefined || o.message)) {
    return [o.code !== undefined ? `code ${String(o.code)}` : "", typeof o.message === "string" ? o.message : ""].filter(Boolean).join(": ");
  }
  return String(e);
}

main().catch((e: unknown) => {
  console.error(`bots: ${errorText(e)}`);
  process.exit(1);
});
