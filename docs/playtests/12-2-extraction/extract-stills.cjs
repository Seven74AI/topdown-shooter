// Story 12.2 stills: a solo extraction (walk, boarding, lift-off, fly-out). Usage: node extract.cjs <w> <h> <outDir> [startX startY]
const { chromium } = require("playwright");
const [w, h, out, sx, sy] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], Number(process.argv[5] ?? 9), Number(process.argv[6] ?? 26)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await pg.goto("http://localhost:5291/?solo&startwave=10&bosswave=99");
  await pg.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return !!(s && s.host); }, null, { timeout: 30000 });
  const world = (fn) => pg.evaluate(fn);
  await world(() => { window.__game.scene.getScene("Game").host.world.run.buildTicksLeft = 1; });
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.run.phase === "wave");
  await pg.keyboard.press("Backquote");
  await pg.getByRole("button", { name: "Skip wave" }).click();
  await pg.keyboard.press("Backquote");
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.run.phase === "vote");
  // Far from the pad, so the walk shows (the team start is 2 m from it).
  await pg.evaluate(([x, y]) => { const s = window.__game.scene.getScene("Game"); const p = s.host.world.players.get(s.host.localPlayerId); p.x = p.prevX = x; p.y = p.prevY = y; }, [sx, sy]);
  await sleep(2500); // the helicopter lands (2 s)
  await pg.screenshot({ path: `${out}/0-vote.png` });
  await pg.getByRole("button", { name: /extract/i }).first().click();
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.run.phase === "extract", null, { timeout: 5000 });
  const t0 = Date.now();
  const log = [];
  const stamp = async (name) => {
    const st = await world(() => { const s = window.__game.scene.getScene("Game"); const w = s.host.world; const p = w.players.get(s.host.localPlayerId); return { tick: w.tick, phase: w.run.phase, x: +p.x.toFixed(2), y: +p.y.toFixed(2), boarded: w.extract.boarded.size, lifted: w.extract.liftedAtTick, zombies: w.zombies.aliveCount, heli: s.heliView?.phase }; });
    log.push({ name, s: ((Date.now() - t0) / 1000).toFixed(1), ...st });
    await pg.screenshot({ path: `${out}/${name}.png` });
  };
  await sleep(1000);
  await stamp("1-walk");
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.extract.boarded.size > 0, null, { timeout: 12000 });
  await stamp("2-boarded");
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.extract.liftedAtTick >= 0, null, { timeout: 5000 });
  await sleep(700);
  await stamp("3-liftoff");
  await sleep(2500);
  await stamp("4-flyout");
  await sleep(3000);
  await stamp("5-flyout-late");
  await pg.waitForFunction(() => window.__game.scene.getScene("Game").host.world.run.phase === "results", null, { timeout: 12000 });
  await stamp("6-results");
  console.log(JSON.stringify(log, null, 0));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
