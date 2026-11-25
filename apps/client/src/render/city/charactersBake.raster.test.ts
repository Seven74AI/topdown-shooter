/**
 * Story 9.13 (AC 3; T5): the characters' bake housekeeping, as `buildingsBake.raster.test.ts` checks the 9.11 one:
 * the main-thread fallback's slices and time guard, the worker's results (stale generation dropped, failure hands
 * the frames back, deadline, frozen tab, idle close), a body request jumping the queue, and a graphics restore that
 * keeps the pictures (re-bakes only when wiped). A real Canvas 2D in node (`@napi-rs/canvas`, tests only).
 */
import { createCanvas } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BAKE_MS_PER_FRAME,
  SHEET_MS_PER_FRAME,
  WORKER_TIMEOUT_MS,
  allTasks,
  charArt,
  charBakeProgress,
  charFx,
  clearCharCacheForTests,
  gunFrameOf,
  loopReady,
  newCharBake,
  newSheet,
  pumpCharBake,
  rebakeCharsAfterCacheLoss,
  receiveCharWorkerResult,
  requestBodyRelight,
  setCharBakeForTests,
  wipeKeptForTests,
  workerFailed,
  type CharBake,
  type CharWorkerResult,
} from "./charactersAtlas";
import { charSheets, frameSide, isWaveOneFrame, walkFrame } from "./charactersFrames";
import { DEFAULT_RESOLVED_LOOK } from "./survivorLook";

const make = (w: number, h: number): HTMLCanvasElement => createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;
const AXE = gunFrameOf("fire_axe");
const axeSheet = (): string => (charArt(AXE) as NonNullable<ReturnType<typeof charArt>>).sheet;
function axeBake(): { b: CharBake; canvas: HTMLCanvasElement } {
  const canvas = make(1, 1);
  const sheet = newSheet(axeSheet(), canvas);
  const b = newCharBake(new Map([[sheet.key, sheet]]), make, [{ kind: "frame", frame: AXE, plain: false }]);
  return { b, canvas };
}
const opaque = (c: HTMLCanvasElement): number => {
  const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 200) n++; // the axe is a thin picture: a few hundred solid px
  return n;
};
/** A fake worker answer: blank pixels of the right sizes. */
function answer(gen: number, frame = AXE): CharWorkerResult {
  const n = frameSide(2.7);
  const px = (w: number, h: number): ImageData => {
    const c = make(w, h);
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  };
  return { gen, kind: "frame", frame, plain: false, base: px(n, n), glow: null, sheen: px(92 * 8, 92), veins: null, bloater: null };
}

describe("Story 9.13: the character bake (main-thread fallback and worker housekeeping)", () => {
  beforeEach(() => clearCharCacheForTests());

  it("main thread: resumable slices under the time guard; the relit picture lands in its own sheet with its layers", () => {
    const { b, canvas } = axeBake();
    let t = 0;
    let frames = 0;
    while (pumpCharBake(b, Infinity, BAKE_MS_PER_FRAME, () => (t += 0.05))) {
      frames++;
      expect(frames).toBeLessThan(5000);
    }
    expect(frames, "spread over many frames").toBeGreaterThan(5);
    expect(opaque(canvas)).toBeGreaterThan(300);
    expect(charFx(AXE)?.sheen).toBe(true);
    expect(b.stats.onMain).toBe(1);
    // a clock moving 10 ms per read stops each call after one step
    clearCharCacheForTests();
    const { b: b2 } = axeBake();
    let t2 = 0;
    pumpCharBake(b2, Infinity, BAKE_MS_PER_FRAME, () => (t2 += 10));
    expect(b2.job).not.toBeNull();
  });

  it("worker: a result of an older generation is dropped; the current one lands at the next pump", () => {
    const { b, canvas } = axeBake();
    b.useWorker = true;
    b.inFlight = b.queue;
    b.queue = [];
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    b.gen = 2;
    receiveCharWorkerResult(b, answer(1), 0);
    expect(b.arrived.length).toBe(0);
    receiveCharWorkerResult(b, answer(2), 0);
    expect(b.arrived.length).toBe(1);
    pumpCharBake(b, Infinity, BAKE_MS_PER_FRAME, () => 1);
    expect(b.inFlight.length).toBe(0);
    expect(opaque(canvas)).toBeGreaterThan(300);
    expect(charBakeProgress().landed).toBe(1);
  });

  it("worker silent past the deadline: closed, its frames go back to the main thread; a frozen tab pushes the deadline", () => {
    const { b } = axeBake();
    let terminated = 0;
    b.useWorker = true;
    b.worker = { terminate: () => terminated++, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    b.inFlight = b.queue;
    b.queue = [];
    b.workerDeadline = WORKER_TIMEOUT_MS;
    b.lastPump = 1;
    // the tab froze for a minute: not the worker's fault
    pumpCharBake(b, 0, 0, () => 60_000);
    expect(b.worker).not.toBeNull();
    // then frames every 0.5 s: it is given up on once the (pushed) deadline passes
    let t = 60_000;
    while (b.worker && t < 200_000) {
      t += 500;
      pumpCharBake(b, 0, 0, () => t);
    }
    expect(t).toBeGreaterThan(60_000 + WORKER_TIMEOUT_MS - 1000);
    expect(t).toBeLessThan(60_000 + WORKER_TIMEOUT_MS + 2000);
    expect(b.worker).toBeNull();
    expect(terminated).toBe(1);
    expect(b.useWorker).toBe(false);
    expect(b.queue.length + (b.job ? 1 : 0)).toBe(1);
  });

  it("worker error: workerFailed hands everything back (bodies first) and the main thread finishes", () => {
    const { b, canvas } = axeBake();
    b.useWorker = true;
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    b.inFlight = [...b.queue, { kind: "body", body: { id: 9, key: "p", look: DEFAULT_RESOLVED_LOOK } }];
    b.queue = [];
    workerFailed(b);
    expect(b.queue[0]?.kind).toBe("body");
    expect(b.inFlight.length).toBe(0);
    let t = 0;
    while (pumpCharBake(b, Infinity, 50, () => (t += 0.05))) if (t > 1e6) break;
    expect(opaque(canvas)).toBeGreaterThan(300);
  });

  it("idle: a worker with nothing in flight and nothing queued is closed", () => {
    const { b } = axeBake();
    let terminated = 0;
    b.useWorker = true;
    b.queue = [];
    b.worker = { terminate: () => terminated++, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    pumpCharBake(b, 0, 0, () => 1);
    expect(terminated).toBe(1);
    expect(b.worker).toBeNull();
  });

  it("a survivor body asked for jumps the queue; a newer request for the same body replaces the older", () => {
    const { b } = axeBake();
    setCharBakeForTests(b);
    let got = 0;
    expect(requestBodyRelight("p1", DEFAULT_RESOLVED_LOOK, () => got--)).toBe(true);
    requestBodyRelight("p1", DEFAULT_RESOLVED_LOOK, () => got++);
    expect(b.queue.filter((t) => t.kind === "body").length).toBe(1);
    expect(b.queue[0]?.kind).toBe("body");
    let t = 0;
    while (pumpCharBake(b, Infinity, 50, () => (t += 0.05))) if (t > 1e6) break;
    expect(got).toBe(1);
  });

  it("B25: the queue serves the first build phase first (Walkers, guns), then runners, crawlers, spitters, brutes, bloaters", () => {
    const order = allTasks().filter((t) => t.kind === "frame" && !t.plain).map((t) => (t.kind === "frame" ? t.frame : ""));
    const first = (re: RegExp): number => order.findIndex((f) => re.test(f));
    const last = (re: RegExp): number => order.length - 1 - [...order].reverse().findIndex((f) => re.test(f));
    expect(last(/^zombie_walker_/)).toBeLessThan(first(/^survivorgun_/));
    expect(last(/^survivorgun_/)).toBeLessThan(first(/^zombie_runner_/));
    for (const [a, b] of [["runner", "crawler"], ["crawler", "spitter"], ["spitter", "brute"], ["brute", "bloater"]]) expect(last(new RegExp(`^zombie_${a}_`))).toBeLessThan(first(new RegExp(`^zombie_${b}_`)));
    expect(order.filter((f) => isWaveOneFrame(f)).length).toBe(40 + 9);
  });

  it("review M1: a look's loop (and FX) is published only after its sheet's upload, even when a burst lands into two sheets", () => {
    const sheets = new Map<string, ReturnType<typeof newSheet>>();
    const uploads: string[] = [];
    for (const v of [0, 1]) {
      const sh = newSheet(`chars_walker_${"ab"[v]}`, make(1, 1));
      sh.tex = { refresh: () => uploads.push(sh.key) } as unknown as NonNullable<typeof sh.tex>;
      sheets.set(sh.key, sh);
    }
    const b = newCharBake(sheets, make, []);
    b.useWorker = true;
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    const n = frameSide(1.55);
    const px = (w: number, h: number): ImageData => (make(w, h).getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, w, h);
    for (const v of [0, 1]) {
      for (let k = 0; k < 10; k++) {
        const frame = walkFrame("walker", v, k);
        b.inFlight.push({ kind: "frame", frame, plain: false });
        receiveCharWorkerResult(b, { gen: 0, kind: "frame", frame, plain: false, base: px(n, n), glow: null, sheen: k === 0 ? px(53 * 8, 53) : null, veins: null, bloater: null }, 0);
      }
    }
    expect(loopReady("walker", 0) || loopReady("walker", 1)).toBe(false);
    pumpCharBake(b, Infinity, Infinity, () => 1); // both looks land, ONE sheet is uploaded
    expect(uploads.length).toBe(1);
    const first = uploads[0] === "chars_walker_a" ? 0 : 1;
    expect(loopReady("walker", first)).toBe(true);
    expect(loopReady("walker", 1 - first), "the other look waits for its own upload").toBe(false);
    expect(charFx(walkFrame("walker", 1 - first, 0))).toBeUndefined();
    pumpCharBake(b, Infinity, Infinity, () => 2);
    expect(uploads.length).toBe(2);
    expect(loopReady("walker", 1 - first)).toBe(true);
    expect(charFx(walkFrame("walker", 1 - first, 0))?.sheen).toBe(true);
  });

  it("review M2: minutes idle, then a body request: a silent worker is still given up on ~20 s later", () => {
    const { b } = axeBake();
    let t = 0;
    while (pumpCharBake(b, Infinity, 50, () => (t += 0.05))) if (t > 1e6) break; // baked, idle
    pumpCharBake(b, 0, 0, () => t + 1000); // an idle frame
    t += 300_000; // five minutes later
    pumpCharBake(b, 0, 0, () => t); // still idle
    b.useWorker = true;
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    setCharBakeForTests(b);
    requestBodyRelight("p1", DEFAULT_RESOLVED_LOOK, () => {});
    expect(b.inFlight.length).toBe(1); // sent to the (silent) worker
    b.workerDeadline = t + WORKER_TIMEOUT_MS; // sendToWorker's deadline on this test's clock
    const sent = t;
    while (b.worker && t < sent + 120_000) {
      t += 500;
      pumpCharBake(b, 0, 0, () => t);
    }
    expect(b.worker).toBeNull();
    expect(t - sent).toBeLessThanOrEqual(WORKER_TIMEOUT_MS + 1000);
  });

  it("review M3: the sheets' setup runs in chunks (SHEET_MS_PER_FRAME), before any picture lands; the bake isn't idle until all exist", () => {
    const b = newCharBake(new Map(), make, []);
    const made: string[] = [];
    let landedWhilePaging = 0;
    b.makeSheet = (key) => {
      made.push(key);
      if (charBakeProgress().landed > 0) landedWhilePaging++;
      const sh = newSheet(key, make(1, 1));
      b.sheets.set(key, sh);
      return sh;
    };
    b.inFlight.push({ kind: "frame", frame: AXE, plain: false });
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    b.useWorker = true;
    receiveCharWorkerResult(b, answer(0), 0);
    let t = 0;
    const clock = (): number => (t += 5); // each sheet "costs" 5 ms: a chunk is a few sheets
    pumpCharBake(b, Infinity, 50, clock);
    expect(made.length).toBeGreaterThan(0);
    expect(made.length).toBeLessThanOrEqual(Math.ceil(SHEET_MS_PER_FRAME / 5) + 1);
    expect(b.setupFrame).toBe(true);
    expect(b.arrived.length, "the picture waits for the setup").toBe(1);
    let frames = 1;
    while (pumpCharBake(b, Infinity, 50, clock)) if (++frames > 200) break;
    expect(made.length).toBe(charSheets().length);
    expect(new Set(made).size).toBe(made.length);
    expect(landedWhilePaging).toBe(0);
    expect(charBakeProgress().landed).toBe(1);
    expect(b.stats.setupFrames).toBeGreaterThan(3);
  });

  it("review L2: a worker that fails after answering doesn't get its answered frames baked again", () => {
    const { b } = axeBake();
    b.useWorker = true;
    b.worker = { terminate() {}, postMessage() {}, onmessage: null, onerror: null } as unknown as Worker;
    b.inFlight = b.queue;
    b.queue = [];
    receiveCharWorkerResult(b, answer(0), 0);
    workerFailed(b);
    expect(b.queue.length).toBe(0);
    pumpCharBake(b, Infinity, 50, () => 1);
    expect(charBakeProgress().landed).toBe(1);
  });

  it("restore: kept pictures are pixels; the dropped sheen/vein layers are baked again; if pixels are wiped all are queued again", () => {
    const { b } = axeBake();
    let t = 0;
    while (pumpCharBake(b, Infinity, 50, () => (t += 0.05))) if (t > 1e6) break;
    // B26: base and glow are kept as pixels (repainted); the sheen / vein pictures aren't kept, so the frames that had
    // them are baked again — and only those, without dropping what the views use meanwhile
    expect(rebakeCharsAfterCacheLoss(b)).toBe(1);
    expect(b.queue).toEqual([{ kind: "frame", frame: AXE, plain: false }]);
    expect(charFx(AXE)).toBeDefined();
    expect(rebakeCharsAfterCacheLoss(b), "not queued twice").toBe(0);
    while (pumpCharBake(b, Infinity, 50, () => (t += 0.05))) if (t > 1e7) break;
    // simulate pixels gone (the check stays, as 9.11's sentinel): the cache drops and every frame is queued again
    wipeKeptForTests();
    const gen = b.gen;
    expect(rebakeCharsAfterCacheLoss(b)).toBe(allTasks().length);
    expect(b.gen).toBe(gen + 1);
    expect(charFx(AXE)).toBeUndefined();
  });
});

