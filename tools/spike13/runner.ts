// SPIKE-13-1: the iOS spike's runner (branch spike-13-1 only, never merged). Runs on the macOS CI runner after the app
// is installed in a booted Simulator. It starts a LOCAL test server (never production) and a control server the app
// polls for commands, drives the app through checks F1–F10 with `xcrun simctl`, a bot as the second player, and
// writes every result to <out>: logs.ndjson (the app's SPIKE13 lines), server.log, summary.json and the screenshots.
//   npx tsx tools/spike13/runner.ts --udid <sim> --bundle io.sevend.hordes.spike --out spike-out
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RunStateView } from "@topdown/shared";
import { BotClient } from "../bots/botClient";

const ROOT = join(import.meta.dirname, "..", "..");
const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? (process.argv[i + 1] ?? d) : d;
};
const UDID = arg("udid", "booted");
const BUNDLE = arg("bundle", "io.sevend.hordes.spike");
const OUT = resolve(arg("out", join(ROOT, "spike-out")));
const SERVER_PORT = 2667;
const CTL_PORT = 2668;
mkdirSync(OUT, { recursive: true });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const stamp = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
const say = (s: string): void => console.log(`[runner ${stamp()}] ${s}`);

// ---- the app's results: from the control server's /log AND the app's stdout file (whichever arrives) ----
interface Entry { key: string; value: unknown; via: string; at: string; phase: string }
const entries: Entry[] = [];
const seen = new Set<string>();
let phase = "init";
function add(key: string, value: unknown, via: string, n: number): void {
  const id = `${phase}|${n}|${key}`;
  if (seen.has(id)) return;
  seen.add(id);
  const e = { key, value, via, at: stamp(), phase };
  entries.push(e);
  appendFileSync(join(OUT, "logs.ndjson"), `${JSON.stringify(e)}\n`);
  console.log(`  [app ${e.at} ${phase}] ${key} ${JSON.stringify(value).slice(0, 1500)}`);
}
let stdoutFile = "";
let stdoutRead = 0;
function pollStdout(): void {
  if (!stdoutFile || !existsSync(stdoutFile)) return;
  const text = readFileSync(stdoutFile, "utf8");
  const lines = text.slice(stdoutRead).split("\n");
  if (!text.endsWith("\n")) lines.pop();
  stdoutRead += lines.reduce((n, l) => n + l.length + 1, 0);
  for (const l of lines) {
    const m = /SPIKE13 (\S+) (\d+) (.*)$/.exec(l);
    if (!m) continue;
    let v: unknown = m[3];
    try {
      v = JSON.parse(m[3] as string);
    } catch {
      // keep the raw text
    }
    add(m[1] as string, v, "stdout", Number(m[2]));
  }
}
const latest = (key: string): Entry | undefined => {
  pollStdout();
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]!.key === key && entries[i]!.phase === phase) return entries[i];
  return undefined;
};
async function waitKey(key: string, ms: number, pred: (v: unknown) => boolean = () => true): Promise<Entry | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    pollStdout();
    const e = entries.find((x) => x.phase === phase && x.key === key && pred(x.value));
    if (e) return e;
    await sleep(250);
  }
  say(`TIMEOUT waiting ${ms / 1000} s for ${key}`);
  return null;
}

// ---- control server ----
const queue: { op: string; arg?: string }[] = [];
const ctl = createServer((req, res) => {
  const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "cache-control": "no-store" };
  if (req.method === "OPTIONS") return void res.writeHead(204, h).end();
  if (req.url?.startsWith("/cmd")) {
    const c = queue.shift() ?? {};
    if ("op" in c) say(`cmd → app: ${JSON.stringify(c)}`);
    return void res.writeHead(200, { ...h, "content-type": "application/json" }).end(JSON.stringify(c));
  }
  if (req.url?.startsWith("/log") && req.method === "POST") {
    let body = "";
    req.on("data", (d: Buffer) => (body += d.toString()));
    req.on("end", () => {
      try {
        const m = JSON.parse(body) as { key: string; value: unknown; n: number };
        add(m.key, m.value, "ctl", m.n);
      } catch {
        // ignore
      }
      res.writeHead(204, h).end();
    });
    return;
  }
  res.writeHead(404, h).end();
});
const cmd = (op: string, a?: string): void => void queue.push(a === undefined ? { op } : { op, arg: a });

// ---- the local test server (never production; B5) ----
let server: ChildProcess | null = null;
const pgDir = mkdtempSync(join(tmpdir(), "spike13-pg-"));
async function startServer(publicOrigin: string | null): Promise<void> {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => server!.once("exit", r));
  }
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(SERVER_PORT), HOST: "127.0.0.1", PGLITE_DIR: pgDir, LOG_LEVEL: "info", NODE_ENV: "development", SPIKE13: "1" };
  if (publicOrigin) env.PUBLIC_ORIGIN = publicOrigin;
  else delete env.PUBLIC_ORIGIN;
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: join(ROOT, "apps", "server"), env, stdio: ["ignore", "pipe", "pipe"] });
  const log = (d: Buffer): void => {
    appendFileSync(join(OUT, "server.log"), `[${phase}] ${d.toString()}`);
    for (const l of d.toString().split("\n")) if (l.trim()) console.log(`  [server ${phase}] ${l.slice(0, 400)}`);
  };
  server.stdout?.on("data", log);
  server.stderr?.on("data", log);
  const end = Date.now() + 90_000;
  while (Date.now() < end) {
    const ok = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return say(`server up (PUBLIC_ORIGIN=${publicOrigin ?? "unset"})`);
    await sleep(500);
  }
  throw new Error("server never became healthy");
}

// ---- the Simulator ----
const simctl = (...a: string[]): string => {
  try {
    return execFileSync("xcrun", ["simctl", ...a], { encoding: "utf8", timeout: 120_000 });
  } catch (e) {
    say(`simctl ${a.join(" ")} failed: ${String(e).slice(0, 300)}`);
    return "";
  }
};
const shots: string[] = [];
function shot(name: string): void {
  const p = join(OUT, `${name}.png`);
  simctl("io", UDID, "screenshot", p);
  shots.push(`${name}.png`);
  say(`screenshot ${name}.png`);
}
const timings: Record<string, number> = {};
function launch(tag: string, terminate = true): void {
  stdoutFile = join(OUT, `app-${tag}.stdout.log`);
  stdoutRead = 0;
  const a = ["launch"];
  if (terminate) a.push("--terminate-running-process");
  a.push(`--stdout=${stdoutFile}`, `--stderr=${stdoutFile}`, UDID, BUNDLE);
  say(`launch ${tag}: ${simctl(...a).trim()}`);
}
async function boot(tag: string): Promise<boolean> {
  const t = Date.now();
  launch(tag);
  const e = await waitKey("boot", 180_000);
  timings[`boot_${tag}_s`] = (Date.now() - t) / 1000;
  return e !== null;
}

// ---- the run ----
const results: Record<string, unknown> = {};
async function main(): Promise<void> {
  await new Promise<void>((r) => ctl.listen(CTL_PORT, "127.0.0.1", () => r()));
  say(`control server on ${CTL_PORT}`);

  // ===== Phase A: dev server (every origin allowed): F1, F3, F4 (write), F5, F6 (a), F7, F8, F9, F10 =====
  phase = "A";
  await startServer(null);
  if (!(await boot("A"))) throw new Error("the app never reported boot (phase A)");
  await sleep(6000); // the start screen settles (fonts, loading screen gone)
  shot("01-start-screen");
  cmd("probe");
  await waitKey("F5_accountSession", 90_000);
  cmd("audio_input");
  await waitKey("F3_after", 30_000);
  cmd("create", "Spike");
  const created = await waitKey("F6_created", 60_000);
  const code = (created?.value as { code?: string } | undefined)?.code ?? null;
  results.F6a_code = code;
  await sleep(1500);
  shot("02-lobby");
  let bot: BotClient | null = null;
  if (code) {
    bot = await BotClient.connect({ url: `http://127.0.0.1:${SERVER_PORT}`, name: "Bot", roomId: code, log: (l) => console.log(`  [bot] ${JSON.stringify(l)}`) });
    const S = (): RunStateView | null => (bot?.room.state as RunStateView | undefined) ?? null;
    const until = async (what: string, fn: () => boolean, ms: number): Promise<boolean> => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (fn()) return true;
        await sleep(200);
      }
      say(`TIMEOUT ${what}`);
      return false;
    };
    await until("2 players", () => (S()?.players?.size ?? 0) === 2, 30_000);
    cmd("lobby_ready");
    await until("both ready", () => {
      let n = 0;
      S()?.players?.forEach((p) => void (p.ready && n++));
      return n === 2;
    }, 30_000);
    cmd("start");
    results.F6a_build = await until("build phase", () => S()?.phase === "build", 60_000);
    await sleep(5000); // the Game scene and the HUD's first layout
    shot("03-hud-build");
    cmd("shop");
    await waitKey("F9_shop", 30_000);
    shot("04-shop");
    cmd("build_ready");
    results.F6a_wave1 = await until("wave 1", () => S()?.phase === "wave" && S()!.wave === 1, 90_000);
    results.F6a_state = { phase: S()?.phase, wave: S()?.wave, remaining: S()?.remaining };
    await sleep(4000);
    shot("05-hud-wave");
    // F10: app switch (Settings to the front for 15 s), then back
    cmd("state");
    await waitKey("state", 15_000);
    simctl("launch", UDID, "com.apple.Preferences");
    await sleep(15_000);
    shot("06-other-app");
    const back = Date.now();
    simctl("launch", UDID, BUNDLE); // brings the running app back to the front (no relaunch)
    const vis = await waitKey("F10_visibility", 45_000, (v) => (v as { hidden?: boolean }).hidden === false);
    timings.F10_back_to_visible_s = vis ? (Date.now() - back) / 1000 : -1;
    shot("07-back-from-switch");
    await sleep(10_000);
    shot("07b-back-from-switch-10s");
    cmd("state");
    await sleep(3000);
    results.F6a_after_switch = { phase: S()?.phase, wave: S()?.wave, players: S()?.players?.size };
    await bot.stop().catch(() => {});
  }
  simctl("terminate", UDID, BUNDLE);
  await sleep(2000);

  // ===== Phase B: relaunch (F4 read-back) against PUBLIC_ORIGIN=https://hordes.sevend.io (F6 b). The server only
  // compares that string with the app's Origin header; nothing is sent to that host (it is blackholed in /etc/hosts). =====
  phase = "B";
  await startServer("https://hordes.sevend.io");
  if (await boot("B")) {
    await sleep(4000);
    cmd("probe");
    await waitKey("F5_accountSession", 90_000);
    cmd("create", "Spike");
    await waitKey("F6_created", 60_000);
    await sleep(3000);
    shot("08-online-refused");
  }
  simctl("terminate", UDID, BUNDLE);
  await sleep(2000);

  // ===== Phase C: F2 stress (?stress=150&debug=1) =====
  phase = "C";
  await startServer(null);
  if (await boot("C")) {
    cmd("stress", "150");
    await waitKey("F2", 120_000);
    await sleep(12_000);
    shot("09-stress-150");
    await waitKey("F2_done", 90_000);
    cmd("state");
    await sleep(2000);
  }
  simctl("terminate", UDID, BUNDLE);
}

main()
  .catch((e) => {
    say(`ERROR ${String(e)}`);
    results.error = String(e);
  })
  .finally(() => {
    pollStdout();
    const summary = { results, timings, shots, entries: entries.length, keys: [...new Set(entries.map((e) => `${e.phase}:${e.key}`))] };
    writeFileSync(join(OUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    say(`summary: ${JSON.stringify({ results, timings })}`);
    server?.kill("SIGTERM");
    ctl.close();
    setTimeout(() => process.exit(results.error ? 1 : 0), 1000);
  });
