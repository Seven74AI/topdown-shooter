// Story 12.3 stills: a solo extraction seen through the camera director (walk, last aboard, lift-off, fly-out, white, Results).
// Usage: node extract-stills.cjs <w> <h> <outDir> [port] [cut]   (a Vite dev server of apps/client on <port>, default 5293)
// "cut": the survivor is held off the pad so the walk times out (the black cut).
const { chromium } = require("playwright");
const [w, h, out, port, mode] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], Number(process.argv[5] ?? 5293), process.argv[6] ?? ""];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await pg.goto(`http://localhost:${port}/?solo&startwave=10&bosswave=99`);
  await pg.waitForFunction(() => { const s = window.__game?.scene?.getScene("Game"); return !!(s && s.host); }, null, { timeout: 60000 });
  const G = "window.__game.scene.getScene('Game')";
  const hideDev = () => pg.addStyleTag({ content: ".dev-gear, .dev-cheats { display: none !important; }" });
  await pg.evaluate(`${G}.host.world.run.buildTicksLeft = 1`);
  await pg.waitForFunction(`${G}.host.world.run.phase === "wave"`);
  await pg.keyboard.press("Backquote");
  await pg.getByRole("button", { name: "Skip wave" }).click();
  await pg.keyboard.press("Backquote");
  await pg.waitForFunction(`${G}.host.world.run.phase === "vote"`, null, { timeout: 20000 });
  // Far from the pad (south-west), so the walk and its framing show.
  await pg.evaluate(`(() => { const s = ${G}; const p = s.host.world.players.get(s.host.localPlayerId); p.x = p.prevX = 9; p.y = p.prevY = 26; })()`);
  await sleep(2500); // the helicopter lands (2 s)
  await pg.getByRole("button", { name: /extract/i }).first().click();
  await pg.waitForFunction(`${G}.host.world.run.phase === "extract"`, null, { timeout: 5000 });
  await hideDev(); // the dev-build ⚙ (not in release)
  if (mode === "cut") await pg.evaluate(`(() => { const s = ${G}; const id = s.host.localPlayerId; window.__hold = setInterval(() => { const p = s.host.world.players.get(id); if (!s.host.world.extract.boarded.has(id)) { p.x = p.prevX = 9; p.y = p.prevY = 26; } }, 10); })()`);
  const log = [];
  const stamp = async (name) => {
    await pg.evaluate("window.__game.loop.sleep()"); // freeze this frame: the still matches the logged shot
    const st = await pg.evaluate(`(() => { const s = ${G}; const w = s.host.world; const o = s.director.out; const cam = s.cameras.main; return { tick: w.tick, phase: w.run.phase, shot: o.phase, walkS: +o.walkS.toFixed(2), flyS: +o.flyS.toFixed(2), zoom: +o.zoom.toFixed(3), bars: +o.bars.toFixed(3), fade: o.fadeAlpha.toFixed(2) + (o.fadeRgb === 0xffffff ? " white" : " black"), fog: +o.fogLift.toFixed(2), dawnX: +o.dawnX.toFixed(1), cx: +o.centreX.toFixed(1), cy: +o.centreY.toFixed(1), view: [+cam.worldView.x.toFixed(1), +cam.worldView.y.toFixed(1), +cam.worldView.width.toFixed(1), +cam.worldView.height.toFixed(1)], crew: s.crewView?.visible, zombies: w.zombies.aliveCount }; })()`);
    log.push({ name, ...st });
    await pg.screenshot({ path: `${out}/${name}.png` });
    await pg.evaluate("window.__game.loop.wake()");
  };
  await sleep(300);
  await stamp("1-walk-bars-in");
  await sleep(1500);
  await stamp("2-walk");
  if (mode === "cut") {
    await pg.waitForFunction(`${G}.director.out.walkS > 7.9`, null, { timeout: 12000 });
    await stamp("3-cut-black");
    await pg.waitForFunction(`${G}.director.out.walkS > 8.55`, null, { timeout: 5000 });
    await stamp("4-cut-fade-in");
    await pg.evaluate("clearInterval(window.__hold)");
  } else {
    await pg.waitForFunction(`${G}.director.out.aboardS >= 0.3`, null, { timeout: 12000 });
    await stamp("3-last-aboard");
  }
  await pg.waitForFunction(`${G}.director.out.flyS >= 0.6`, null, { timeout: 5000 });
  await stamp("5-liftoff");
  await pg.waitForFunction(`${G}.director.out.flyS >= 3`, null, { timeout: 5000 });
  await stamp("6-flyout-zoomed-out");
  await pg.waitForFunction(`${G}.director.out.flyS >= ${G}.director.out.whiteEndS - 0.4`, null, { timeout: 8000 });
  await stamp("7-fade-to-white");
  await pg.waitForFunction(`${G}.host.world.run.phase === "results"`, null, { timeout: 12000 });
  await sleep(500);
  await stamp("8-results");
  console.log(JSON.stringify(log));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
