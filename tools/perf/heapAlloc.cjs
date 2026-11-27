/* global require, process, console, window */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script (Playwright is preinstalled, not a dependency) */
// Story 10.3 (deferred-work D13): what a release build allocates per 10 s in 10.2's stress scenes, by function. CDP
// `HeapProfiler.startSampling` (every allocation, collected or not) over 10 s after the warm-up, on
// 10.2's `?stress=150` scenes (FIRE=1: `&stressfire=1`, the survivor holds fire) at 1×. TOP=8: functions listed.
//
//   NODE_PATH=$(npm root -g) node tools/perf/heapAlloc.cjs base=dist:/tmp/dist-base branch=dist:apps/client/dist [rounds]
const { chromium } = require("playwright");
const { openPage, serveTargets, SCENES } = require("./fps.cjs");

const WARM_MS = Number(process.env.WARM_MS || 8000);
const SAMPLE_MS = 10000;

function selfSizes(profile, n) {
  const self = new Map();
  let total = 0;
  // A built-in (no url: `filter`, `push`, `sort`) is listed under its caller, so the line names who allocates.
  const walk = (node, parent) => {
    const cf = node.callFrame;
    const here = `${cf.functionName || "(anon)"} ${(cf.url || "").split("/").pop()}${process.env.LINES ? `:${cf.lineNumber + 1}` : ""}`;
    const k = cf.url ? here : `${parent} > ${cf.functionName}`;
    self.set(k, (self.get(k) || 0) + node.selfSize);
    total += node.selfSize;
    for (const c of node.children) walk(c, cf.url ? here : parent);
  };
  walk(profile.head, "(root)");
  const mb = (b) => +(b / 1048576).toFixed(2);
  return { totalMB: mb(total), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, b]) => ({ fn, mb: mb(b) })) };
}

async function main() {
  const served = await serveTargets(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
  const rounds = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 1);
  const browser = await chromium.launch();
  for (let r = 0; r < rounds; r++) {
    for (const scene of (process.env.SCENES || "stage1,wave9").split(",")) for (const [label, url] of r % 2 ? [...served.targets].reverse() : served.targets) {
      const { page, cdp } = await openPage(browser, `${url}/${SCENES[scene].query}${process.env.FIRE ? "&stressfire=1&loadout=assault_rifle:4" : ""}`, 1, 2);
      await page.waitForTimeout(WARM_MS);
      await cdp.send("HeapProfiler.enable");
      await cdp.send("HeapProfiler.startSampling", { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.waitForTimeout(SAMPLE_MS);
      const { profile } = await cdp.send("HeapProfiler.stopSampling");
      const probe = await page.evaluate(() => window.__stress(1000));
      await page.close();
      console.log(JSON.stringify({ round: r + 1, label, scene, alive: probe.alive, ...selfSizes(profile, Number(process.env.TOP || 8)) }));
    }
  }
  await browser.close();
  await served.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
