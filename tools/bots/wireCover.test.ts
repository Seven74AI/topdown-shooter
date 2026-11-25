import { describe, expect, it } from "vitest";
import {
  BUILD_GRID_M,
  NEUTRAL_INPUT,
  TICK_DT_S,
  TICK_RATE_HZ,
  addBuildingAt,
  addPlayer,
  applyTestScenario,
  botConfigOf,
  botInput,
  botViewFromWorld,
  createBotView,
  createWorld,
  loadBalance,
  runHeadless,
  setInput,
  spawnZombie,
  step,
  type BotView,
  type Box,
  type PlayerInput,
  type World,
} from "@topdown/shared";
import { bulletBoxes, fillWireShot, wireLineClear } from "./wireCover";

/**
 * Investigation cut-test-stall-2026-11-25 (docs/investigations/cut-test-stall-2026-11-25.md): cut.test's
 * "wave 4 never ends" is a stand-off. Spitters spit over the bots' own wood barricades (acid ignores
 * barricades) and hold their spot; the networked bots (`tools/bots`, no cover knowledge) fire at the
 * nearest zombie into the barricade forever. These tests replay that bot headless: its view rebuilt as
 * the wire gives it, with and without the barricade lines `wireCover.ts` now adds.
 */
const balance = loadBalance();
const cfg = botConfigOf(balance);

/** What `botClient.step` knows: positions only (no cover, no Spitter / rusher marks, no World errands). */
function asWireView(world: World, view: BotView, fix: boolean, boxes: Box[]): void {
  view.knowsCover = false;
  view.shotZombie = null;
  view.throwTarget = null;
  view.zombie.holdsSpot = false;
  view.zombie.rushing = false;
  view.huntStepX = view.huntStepY = view.laneOutX = view.laneOutY = view.errandX = view.errandY = 0;
  view.errandStop = false;
  if (!fix) return;
  const z = world.zombies;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    xs.push(z.x[id] as number);
    ys.push(z.y[id] as number);
  }
  fillWireShot(view, xs, ys, xs.length, boxes, bulletBoxes(balance, world.buildings.list, boxes));
}

/** One bot at (10, 10), a wood barricade [9, 11] × [11.5, 12], a Spitter 5 m behind it; god mode. */
function standoff(fix: boolean, seconds: number): number {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  world.debug.godMode = true;
  addPlayer(world, "p0", 10, 10);
  expect(addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 9 / BUILD_GRID_M, gy: 11.5 / BUILD_GRID_M, rot: 0, hp: 200 })).not.toBeNull();
  spawnZombie(world, "spitter", 10, 15);
  const view = createBotView();
  const input: PlayerInput = { ...NEUTRAL_INPUT };
  const boxes: Box[] = [];
  for (let t = 0; t < Math.round(seconds / TICK_DT_S); t++) {
    botViewFromWorld(world, "p0", view);
    asWireView(world, view, fix, boxes);
    botInput(view, cfg, t + 1, input);
    setInput(world, "p0", input);
    step(world, TICK_DT_S);
  }
  return world.zombies.aliveCount;
}

/** The net150 run (god mode, from wave 4) with wire-view bots: wave 4's length in s, or null if it ran past `capS`. */
function wave4Seconds(seed: number, fix: boolean, capS: number): number | null {
  const boxes: Box[] = [];
  let start = -1;
  let ended = -1;
  const stop = new Error("stop");
  try {
    runHeadless({
      balance,
      seed,
      players: 4,
      god: true,
      setup: (w) => applyTestScenario(w, "net150"),
      viewHook: (w, _id, view) => asWireView(w, view, fix, boxes),
      onTick: (w) => {
        if (start < 0 && w.run.phase === "wave" && w.waves.number === 4) start = w.tick;
        if (start >= 0 && w.run.phase !== "wave") {
          ended = w.tick;
          throw stop;
        }
        if (start >= 0 && w.tick - start > capS * TICK_RATE_HZ) throw stop;
      },
    });
  } catch (e) {
    if (e !== stop) throw e;
  }
  return ended < 0 ? null : (ended - start) / TICK_RATE_HZ;
}

describe("tools/bots cover over the wire (cut-test stall)", () => {
  it("the line test: a barricade between stops the line, beside it does not", () => {
    const boxes: Box[] = [];
    const n = bulletBoxes(balance, [{ type: "wood_barricade", gx: 18, gy: 23, rot: 0 }], boxes); // [9, 11] × [11.5, 12]
    expect(n).toBe(1);
    expect(wireLineClear(boxes, n, 10, 10, 10, 15)).toBe(false);
    expect(wireLineClear(boxes, n, 10, 10, 14, 10)).toBe(true);
  });

  it("a Spitter behind a barricade: the wire bot without cover never kills it; with the barricade lines it strafes and does", () => {
    expect(standoff(false, 60)).toBe(1); // the stall's mechanism, deterministic
    expect(standoff(true, 60)).toBe(0);
  });

  it("net150 seed 3 (a stalled wave 4 headless): stuck past 300 s without cover; ends with it", () => {
    expect(wave4Seconds(3, false, 300)).toBeNull();
    const s = wave4Seconds(3, true, 300);
    expect(s).not.toBeNull();
  }, 120_000);
});
