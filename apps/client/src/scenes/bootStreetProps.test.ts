import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Story 9.14 reviews H1 / NEW-1 / NEW-2 / NEW-3: the street props image never holds up the title or the start handlers
 * (Story 8.1: a reload that takes its seat back asks for the Game scene during the title); the first start request is
 * kept and run once the image settles (loaded, failed or timed out), exactly once, while Boot still runs; nothing
 * brings the start screen back meanwhile; and an image that lands too late is dropped.
 */
const opts = { skips: false };
vi.mock("phaser", () => ({ Scene: class {}, Scale: { Events: { RESIZE: "resize" } }, Scenes: { Events: { SHUTDOWN: "shutdown" } } }));
vi.mock("../audio/ambience", () => ({ prewarmAmbience: () => undefined }));
vi.mock("../debug/urlOptions", () => ({ urlOptions: () => ({}), skipsStartScreen: () => opts.skips }));
vi.mock("../display", () => ({ dpr: () => 1 }));
vi.mock("../render/city/streetProps.webp?url", () => ({ default: "/streetProps.webp" }));

import { BootScene } from "./BootScene";
import { uiStore, type UiScreen } from "../ui/uiState";
import { STREET_PROPS_KEY, STREET_PROPS_TIMEOUT_MS, resetStreetPropsForTests, streetPropsState, takeStreetProps } from "../render/city/streetPropsAtlas";
import type { NetSession } from "../net/session";

/** The game-wide texture manager (outlives a scene, like Phaser's). */
class Textures {
  readonly keys = new Set<string>();
  private readonly once = new Map<string, (() => void)[]>();
  exists = (k: string): boolean => this.keys.has(k);
  remove = (k: string): boolean => this.keys.delete(k);
  get = (): { getSourceImage: () => object } => ({ getSourceImage: () => ({}) });
  on = (): void => undefined;
  addListener(ev: string, fn: () => void): void {
    this.once.set(ev, [...(this.once.get(ev) ?? []), fn]);
  }
  /** Phaser's `once`. */
  readonly onceFn = (ev: string, fn: () => void): void => this.addListener(ev, fn);
  /** The loader decoded the image: the texture appears (Phaser emits `addtexture-<key>`). */
  add(k: string): void {
    this.keys.add(k);
    const l = this.once.get(`addtexture-${k}`) ?? [];
    this.once.delete(`addtexture-${k}`);
    for (const fn of l) fn();
  }
}

interface Fake {
  boot: BootScene;
  started: unknown[][];
  queued: string[];
  texts: string[];
  timers: { fn: () => void; removed: boolean }[];
  /** The scene's loader fails the image (its `loaderror`). */
  fail(): void;
  setActive(a: boolean): void;
}

function makeBoot(textures: Textures, boot = new BootScene()): Fake {
  const started: unknown[][] = [];
  const queued: string[] = [];
  const texts: string[] = [];
  const timers: { fn: () => void; removed: boolean }[] = [];
  const errors: ((f: { key?: string }) => void)[] = [];
  let active = true;
  const text = (_x: number, _y: number, s: string) => {
    texts.push(s);
    const t = { setOrigin: () => t, setPosition: () => t };
    return t;
  };
  Object.assign(boot, {
    add: { text },
    scale: { width: 844, height: 390, on: () => undefined, off: () => undefined },
    events: { once: () => undefined },
    time: {
      delayedCall: (_ms: number, fn: () => void) => {
        const t = { fn, removed: false, remove: () => (t.removed = true) };
        timers.push(t);
        return t;
      },
    },
    sys: { isActive: () => active },
    scene: { start: (...a: unknown[]) => started.push(a) },
    textures: { exists: textures.exists, remove: textures.remove, get: textures.get, once: textures.onceFn },
    load: {
      image: (k: string) => queued.push(k),
      on: (ev: string, fn: (f: { key?: string }) => void) => ev === "loaderror" && errors.push(fn),
      start: () => undefined,
    },
  });
  return {
    boot,
    started,
    queued,
    texts,
    timers,
    fail: () => {
      for (const fn of errors) fn({ key: STREET_PROPS_KEY });
    },
    setActive: (a) => (active = a),
  };
}

/** The title's delayed step fires (unless it was removed). */
const fireTitle = (f: Fake): void => {
  for (const t of f.timers) if (!t.removed) t.fn();
};

describe("Story 9.14 (reviews H1, NEW-1..3): Boot and the street props image", () => {
  let textures: Textures;
  let screens: UiScreen[];
  let unsub: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreetPropsForTests();
    opts.skips = false;
    textures = new Textures();
    screens = [];
    unsub = uiStore.subscribe((s) => screens.push(s));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    unsub();
    vi.useRealTimers();
    vi.restoreAllMocks();
    uiStore.handle("startOnline", undefined);
    uiStore.handle("startSolo", undefined);
  });

  it("takes startOnline during the title before the image is in, says Loading…, and starts the run once it lands", () => {
    const f = makeBoot(textures);
    f.boot.create();
    expect(f.queued).toEqual([STREET_PROPS_KEY]);
    expect(streetPropsState()).toBe("loading");
    const session = {} as NetSession;
    uiStore.request("startOnline", session); // a reload taking its seat back, during the title
    expect(f.started).toEqual([]); // kept, not dropped
    expect(f.texts).toContain("Loading…");
    expect(screens.at(-1)).toEqual({ kind: "playing", menu: "closed", online: true }); // no dead start screen
    textures.add(STREET_PROPS_KEY);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    expect(streetPropsState()).toBe("ready");
  });

  it("NEW-1: the title's delayed step after a taken start does nothing: no start screen, no handlers, one start", () => {
    const f = makeBoot(textures);
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    expect(f.timers.every((t) => t.removed)).toBe(true); // the timer is cancelled
    const n = screens.length;
    for (const t of f.timers) t.fn(); // even if it fired anyway
    expect(screens.length).toBe(n); // the UI was not reset to the start screen
    uiStore.request("startSolo"); // a tap: no handler any more
    uiStore.request("startOnline", {} as NetSession);
    textures.add(STREET_PROPS_KEY);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]); // exactly one start, the first request
  });

  it("NEW-1: with ?solo (skipsStartScreen) and a resumed seat, the online start wins and solo never starts", () => {
    opts.skips = true;
    const f = makeBoot(textures);
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    for (const t of f.timers) t.fn();
    textures.add(STREET_PROPS_KEY);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
  });

  it("NEW-1: two start requests (solo from the start screen, then a late online one) give one start", () => {
    const f = makeBoot(textures);
    f.boot.create();
    fireTitle(f); // the start screen is up
    uiStore.request("startSolo");
    uiStore.request("startOnline", {} as NetSession);
    uiStore.request("startSolo");
    textures.add(STREET_PROPS_KEY);
    expect(f.started).toEqual([["Game", { mode: "solo" }]]);
  });

  it("Boot started again while the image is still loading (Leave / back to the start screen) still starts the run once", () => {
    const boot = new BootScene();
    const f1 = makeBoot(textures, boot);
    f1.boot.create();
    fireTitle(f1);
    const f2 = makeBoot(textures, boot); // the same scene object, started again (Phaser reuses it)
    f2.boot.create({ start: true });
    expect(f2.queued).toEqual([]); // no second download
    uiStore.request("startSolo");
    expect(f2.started).toEqual([]);
    textures.add(STREET_PROPS_KEY); // heard on the texture manager, even though the first Boot's loader was reset
    expect(f2.started).toEqual([["Game", { mode: "solo" }]]);
  });

  it("the waiter does not start the run when Boot is no longer the running scene", () => {
    const f = makeBoot(textures);
    f.boot.create();
    fireTitle(f);
    uiStore.request("startSolo");
    f.setActive(false);
    textures.add(STREET_PROPS_KEY);
    expect(f.started).toEqual([]);
  });

  it("a failed download starts the run anyway (code drawings), warns once, and is not queued again", () => {
    const f = makeBoot(textures);
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    f.fail();
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    expect(streetPropsState()).toBe("failed");
    expect(console.warn).toHaveBeenCalledTimes(1);
    const again = makeBoot(textures);
    again.boot.create({ start: true });
    expect(again.queued).toEqual([]);
    uiStore.request("startSolo");
    expect(again.started).toEqual([["Game", { mode: "solo" }]]); // nothing to wait for: no Loading… either
    expect(again.texts).not.toContain("Loading…");
  });

  it("NEW-3: a hung download times out, the run starts, and an image that lands later is dropped from the texture manager", () => {
    const f = makeBoot(textures);
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    vi.advanceTimersByTime(STREET_PROPS_TIMEOUT_MS - 1);
    expect(f.started).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    textures.add(STREET_PROPS_KEY); // long after Boot shut down
    expect(textures.keys.has(STREET_PROPS_KEY)).toBe(false);
    expect(takeStreetProps(f.boot)).toBeNull();
  });

  it("no download once the downtown atlas exists", () => {
    textures.keys.add("atlas_downtown");
    const f = makeBoot(textures);
    f.boot.create();
    expect(f.queued).toEqual([]);
    expect(streetPropsState()).toBe("failed");
  });
});
