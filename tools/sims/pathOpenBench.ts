/**
 * Story 12.1 (AC 9, AC 16): the placement path check (`buildings/pathOpen.ts › sealsPath`) timed in
 * headless Chromium at 1× and 4× CPU (`Emulation.setCPUThrottlingRate`), on Downtown and on a 70 × 70 m
 * (140 × 140 cells) map: fully cold, per server placement, per new ghost spot, ghost held still (ms per
 * check, 24 walls, 400 random wood spots), and (Story 12.1 H1) a build start whose stage seals a 100-wall ring
 * round the pad (ms per `changeDecayStage`, the re-check included). Record the machine load with the numbers.
 *
 *   npx tsx tools/sims/pathOpenBench.ts
 */
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({ entryPoints: [new URL("./pathOpenBench.entry.ts", import.meta.url).pathname], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "warning" });
const code = bundle.outputFiles[0]?.text ?? "";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: code });
const cdp = await page.context().newCDPSession(page);
for (const rate of [1, 4]) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const r = await page.evaluate(() => (globalThis as unknown as { runPathOpenBench: () => unknown }).runPathOpenBench());
  process.stdout.write(`CPU ×${rate} ${JSON.stringify(r)}\n`);
}
await browser.close();
