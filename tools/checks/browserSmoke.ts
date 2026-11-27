import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer as netServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlayerStateView, RunStateView } from "@topdown/shared";
import { BotClient } from "../bots/botClient";
import { layoutBuildCluster, layoutBuildPanel, newBuildClusterLayout, newBuildPanelLayout, readyClearLeft, readyLeftX } from "../../apps/client/src/scenes/buildBar";
import { READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../../apps/client/src/ui/sizes";

/**
 * Story 10.5 (AC 7, NFR8; decision 10.5-B4): ONE browser smoke, run per browser:
 *
 *   npm run smoke:browsers -- --browser chromium|firefox|webkit|msedge [--out <dir>]
 *
 * It builds the client for release (`vite build`, temp dir) and serves it with `vite preview` (its `/api` proxied to the
 * server, as Caddy does), starts a test server (`apps/server`, temp PGlite) on its own free ports, then drives the
 * release client in the chosen browser with keyboard and mouse (a desktop window, 1280 × 720):
 *   start screen → Create game → lobby → Start → build → wave 1 cleared → build → shop: buy one item → place one
 *   barricade → wave 2 starts; and the rotate overlay in a portrait window.
 * A headless bot (`tools/bots/botClient.ts`, in-process) joins as the second player: a release client can't start a
 * game alone (`LobbyScreen` allows that only in dev builds, decision 10.5-B8) and it fights wave 1 with the browser's
 * player. Every step is ASSERTED from the room state the bot sees (phase, wave number, the browser player's wallet,
 * a building it owns) or the page's DOM; each step has 30 s, the whole run must end under 3 min. Writes
 * `<out>/smoke-<browser>.json` (per step: pass/fail, seconds; the browser's version) and a still per step.
 * Never `npm run dev` (fixed ports); every process it starts is stopped by its own handle.
 */
const ROOT = join(import.meta.dirname, "..", "..");
const CLIENT = join(ROOT, "apps", "client");
const STEP_MS = 30_000;
const RUN_MS = 180_000;
const W = 1280;
const H = 720;
const NAME = "Smoke";

type BrowserName = "chromium" | "firefox" | "webkit" | "msedge";
const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? dflt) : dflt;
};
const browserName = arg("browser", "chromium") as BrowserName;
if (!["chromium", "firefox", "webkit", "msedge"].includes(browserName)) throw new Error(`--browser: chromium | firefox | webkit | msedge, not ${browserName}`);
const OUT = arg("out", join(ROOT, "docs", "qa", "browsers", "smoke"));

interface Page {
  goto(u: string): Promise<unknown>;
  fill(sel: string, v: string): Promise<void>;
  click(sel: string, o?: object): Promise<void>;
  waitForSelector(sel: string, o?: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  textContent(sel: string): Promise<string | null>;
  isVisible(sel: string): Promise<boolean>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  screenshot(o: { path: string }): Promise<unknown>;
  evaluate(src: string): Promise<unknown>;
  on(ev: "console" | "pageerror", fn: (m: { type?(): string; text?(): string; message?: string }) => void): void;
  mouse: { move(x: number, y: number): Promise<void>; down(): Promise<void>; up(): Promise<void>; click(x: number, y: number): Promise<void> };
  keyboard: { down(k: string): Promise<void>; up(k: string): Promise<void>; press(k: string): Promise<void> };
}
type Browser = { newPage(o: object): Promise<Page>; version(): string; close(): Promise<void> };
type Launcher = { launch(o?: object): Promise<Browser> };

const freePort = (): Promise<number> =>
  new Promise((res, rej) => {
    const s = netServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(what: string, fn: () => boolean | Promise<boolean>, ms = STEP_MS): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`timed out (${ms / 1000} s) waiting for ${what}`);
}

interface StepResult {
  step: string;
  pass: boolean;
  seconds: number;
  detail: string;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const results: StepResult[] = [];
  const procs: ChildProcess[] = [];
  const dist = mkdtempSync(join(tmpdir(), "smoke-dist-"));
  const pgDir = mkdtempSync(join(tmpdir(), "smoke-pg-"));
  let preview: { close(): Promise<void> } | null = null;
  let browser: Browser | null = null;
  let bot: BotClient | null = null;
  let version = "";
  const errors: string[] = [];

  const step = async (name: string, fn: () => Promise<string | void>, page?: Page | null): Promise<void> => {
    const s = Date.now();
    try {
      const detail = await Promise.race([fn(), sleep(STEP_MS).then(() => Promise.reject(new Error(`step over ${STEP_MS / 1000} s`)))]);
      results.push({ step: name, pass: true, seconds: (Date.now() - s) / 1000, detail: detail ?? "" });
      console.log(`PASS ${name} (${((Date.now() - s) / 1000).toFixed(1)} s)${detail ? `: ${detail}` : ""}`);
    } catch (e) {
      results.push({ step: name, pass: false, seconds: (Date.now() - s) / 1000, detail: String(e instanceof Error ? e.message : e) });
      console.log(`FAIL ${name}: ${String(e)}`);
      throw e;
    } finally {
      if (page) await page.screenshot({ path: join(OUT, `${browserName}-${results.length}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) }).catch(() => {});
    }
  };

  try {
    const serverPort = await freePort();
    const clientPort = await freePort();
    // 1. the test server (dev, not production: the solo / dev switches stay off; temp PGlite)
    const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: join(ROOT, "apps", "server"),
      env: { ...process.env, PORT: String(serverPort), HOST: "127.0.0.1", PGLITE_DIR: pgDir, LOG_LEVEL: "warn", NODE_ENV: "development" },
      stdio: ["ignore", "inherit", "inherit"],
    });
    procs.push(server);
    // 2. the release client, served with /api proxied to the server
    const vite = await import("vite");
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production"; // a real release build (import.meta.env.DEV false)
    try {
      await vite.build({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), mode: "production", logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
    } finally {
      process.env.NODE_ENV = env;
    }
    const pv = await vite.preview({
      root: CLIENT,
      configFile: join(CLIENT, "vite.config.ts"),
      logLevel: "warn",
      build: { outDir: dist },
      preview: { host: "127.0.0.1", port: clientPort, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${serverPort}`, ws: true, rewrite: (p: string) => p.replace(/^\/api/, "") } } },
    });
    preview = { close: () => pv.close() };
    const base = `http://127.0.0.1:${clientPort}/`;
    await until("the server's /health", async () => (await fetch(`http://127.0.0.1:${serverPort}/health`).catch(() => null))?.ok === true, 60_000);

    // 3. the browser
    const pw = createRequire(import.meta.url)("playwright") as Record<"chromium" | "firefox" | "webkit", Launcher>;
    const launcher = browserName === "msedge" ? pw.chromium : pw[browserName];
    browser = await launcher.launch(browserName === "msedge" ? { channel: "msedge" } : {});
    version = browser.version();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message ?? ""}`));
    page.on("console", (m) => {
      if (m.type?.() === "error") errors.push(`console: ${m.text?.() ?? ""}`);
    });

    /** The live room state the bot sees (the takeover-safe `bot.room`); null before it joined. */
    const S = (): RunStateView | null => ((bot as BotClient | null)?.room.state as RunStateView | undefined) ?? null;
    const me = (): PlayerStateView | null => {
      let found: PlayerStateView | null = null;
      S()?.players?.forEach((p) => {
        if (p.name === NAME) found = p;
      });
      return found;
    };
    let myId = "";

    await step("start screen", async () => {
      await page.goto(base);
      await page.waitForSelector("#start-name", { timeout: STEP_MS });
      const title = await page.textContent("#start-title");
      if (title !== "Hordes") throw new Error(`start title "${title}"`);
      return `title ${title}`;
    }, page);

    let code = "";
    await step("create game → lobby", async () => {
      await page.fill("#start-name", NAME);
      await page.click("button:has-text('Create game')");
      await page.waitForSelector(".lobby__code", { timeout: STEP_MS });
      code = ((await page.textContent(".lobby__code")) ?? "").replace(/\s+/g, "");
      if (!/^[A-Z]{4}$/.test(code)) throw new Error(`room code "${code}"`);
      return `room ${code}`;
    }, page);

    await step("a bot joins; Ready; Start", async () => {
      bot = await BotClient.connect({ url: `http://127.0.0.1:${serverPort}`, name: "Bot", roomId: code, log: () => {} });
      await until("2 players in the room", () => (S()?.players?.size ?? 0) === 2);
      await page.click("button:has-text('Ready')");
      await until("both Ready", () => {
        let n = 0;
        S()?.players?.forEach((p) => void (p.ready && n++));
        return n === 2;
      });
      await page.click("button:has-text('Start')");
      await until("the run's first build phase", () => S()?.phase === "build");
      S()?.players?.forEach((p, id) => {
        if (p.name === NAME) myId = id;
      });
      if (!myId) throw new Error("my player is not in the room state");
      return `phase ${S()?.phase}`;
    }, page);

    // the Ready button where HudScene draws it (desktop: no safe-area insets)
    const readyAt = (): [number, number] => {
      const pn = layoutBuildPanel(W, H, 0, 0, 1, newBuildPanelLayout(), 0);
      const x = readyLeftX(W, READY_BUTTON_W_CSS_PX, readyClearLeft(pn), 1);
      const y = H - READY_BUTTON_BOTTOM_CSS_PX - READY_BUTTON_H_CSS_PX;
      return [x + READY_BUTTON_W_CSS_PX / 2, y + READY_BUTTON_H_CSS_PX / 2];
    };

    await step("Ready → wave 1", async () => {
      await page.waitForTimeout(1500); // the HUD's first layout after the run starts
      await page.mouse.click(...readyAt());
      await until("wave 1", () => S()?.phase === "wave" && S()!.wave === 1);
      return `wave ${S()?.wave}, ${S()?.remaining} zombies`;
    }, page);

    await step("wave 1 cleared (keyboard + mouse: walk, aim, fire)", async () => {
      // my survivor fights too: WASD steps and a held mouse button swept round the screen centre (auto-fire while aiming)
      const keys = ["KeyW", "KeyD", "KeyS", "KeyA"];
      let i = 0;
      await page.mouse.move(W / 2 + 200, H / 2);
      await page.mouse.down();
      try {
        const end = Date.now() + STEP_MS - 1000;
        while (Date.now() < end && !(S()?.phase === "build" && S()!.wave >= 1)) {
          const a = (i / 12) * Math.PI * 2;
          await page.mouse.move(W / 2 + Math.cos(a) * 220, H / 2 + Math.sin(a) * 220);
          if (i % 10 === 0) {
            const k = keys[(i / 10) % 4] as string;
            await page.keyboard.down(k);
            await page.waitForTimeout(150);
            await page.keyboard.up(k);
          }
          await page.waitForTimeout(60);
          i++;
        }
      } finally {
        await page.mouse.up();
      }
      if (S()?.phase !== "build") throw new Error(`still in ${S()?.phase}, wave ${S()?.wave}, ${S()?.remaining} left`);
      return `wave ${S()!.wave} ended, my kills ${me()?.kills ?? 0}, the bot's ${bot?.waves.at(-1)?.kills ?? "?"}`;
    }, page);

    await step("shop: buy one item (wallet goes down)", async () => {
      const before = me()?.wallet ?? 0;
      const cl = layoutBuildCluster(W, H, 0, 0, 1, newBuildClusterLayout());
      await page.mouse.click(cl.chipX + cl.chip / 2, cl.chipY + cl.chip / 2);
      await page.waitForSelector(".shop", { timeout: STEP_MS });
      await page.waitForSelector(".shop__item--upgrade:not([disabled]):not(.shop__item--short), .shop-card:not([disabled]):not(.shop-card--short)", { timeout: STEP_MS });
      const upgrade = ".shop__item--upgrade:not([disabled]):not(.shop__item--short)";
      if (await page.isVisible(upgrade)) await page.click(upgrade);
      else await page.click(".shop-card:not([disabled]):not(.shop-card--short)");
      if (await page.isVisible(".shop__choose")) await page.click(".shop__choose .shop__items .btn >> nth=0"); // a weapon card: which slot
      await until("the wallet to go down", () => (me()?.wallet ?? before) < before);
      const after = me()?.wallet ?? 0;
      await page.click(".shop__head button:has-text('Close')").catch(() => page.keyboard.press("Escape"));
      await until("the shop to close", async () => !(await page.isVisible(".shop")), 5000).catch(() => {});
      return `wallet ${before} → ${after}`;
    }, page);

    await step("place one barricade", async () => {
      const count = (): number => {
        let n = 0;
        S()?.buildings?.forEach((b) => void (b.owner === myId && n++));
        return n;
      };
      const before = count();
      await page.mouse.move(W / 2 + 120, H / 2 + 60); // the ghost follows the mouse
      await page.keyboard.press("Digit1"); // the first build type (the barricade) into the hand
      await page.waitForTimeout(300);
      for (const [dx, dy] of [[120, 60], [-140, 80], [100, -120], [-120, -100], [180, 0]] as const) {
        await page.mouse.move(W / 2 + dx, H / 2 + dy);
        await page.waitForTimeout(150);
        await page.keyboard.press("Space"); // place
        await page.waitForTimeout(400);
        if (count() > before) break;
      }
      await until("a building I own", () => count() > before, 8000);
      let type = "";
      S()?.buildings?.forEach((b) => {
        if (b.owner === myId) type = b.type;
      });
      await page.keyboard.press("Escape").catch(() => {});
      return `${count()} building(s) of mine (${type})`;
    }, page);

    await step("Ready → wave 2 starts", async () => {
      await page.waitForTimeout(300);
      await page.mouse.click(...readyAt());
      await until("wave 2", () => S()?.phase === "wave" && S()!.wave === 2);
      return `wave ${S()?.wave}`;
    }, page);

    await step("rotate overlay in a portrait window", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      if (!(await page.isVisible(".rotate-overlay"))) throw new Error("no rotate overlay in portrait");
      await page.setViewportSize({ width: W, height: H });
      return "shown";
    }, page);

    const total = (Date.now() - t0) / 1000;
    if (total > RUN_MS / 1000) throw new Error(`the whole run took ${total.toFixed(0)} s (> ${RUN_MS / 1000} s)`);
  } finally {
    const total = (Date.now() - t0) / 1000;
    const pass = results.length === 9 && results.every((r) => r.pass) && total <= RUN_MS / 1000;
    const report = { browser: browserName, version, os: `${process.platform} ${process.arch}`, date: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? "", seconds: total, pass, steps: results, pageErrors: errors.slice(0, 20) };
    writeFileSync(join(OUT, `smoke-${browserName}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${pass ? "PASS" : "FAIL"} ${browserName} ${version}: ${results.filter((r) => r.pass).length}/9 steps in ${total.toFixed(1)} s`);
    await (bot as BotClient | null)?.stop().catch(() => {});
    await browser?.close().catch(() => {});
    await preview?.close().catch(() => {});
    for (const p of procs) p.kill("SIGTERM");
    rmSync(dist, { recursive: true, force: true });
    await sleep(500);
    rmSync(pgDir, { recursive: true, force: true });
    process.exitCode = pass ? 0 : 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
