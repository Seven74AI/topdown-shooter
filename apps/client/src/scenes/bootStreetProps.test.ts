import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Story 9.14 (B26, reviews H1 / NEW-1 / NEW-3 / re-review B): the street props image never holds anything up. The Boot
 * scene starts its download and starts the Game scene at once on the first start request (Story 8.1: a reload that
 * takes its seat back asks for it during the title), exactly once; a run that starts before the image is in draws its
 * street props from code (`spriteAtlas.test` › B26), the image is kept for the next run whenever it lands, and a
 * download that ends without a picture (an error, or an image that doesn't decode) fails at once.
 */
const opts = { skips: false };
vi.mock("phaser", () => ({ Scene: class {}, Scale: { Events: { RESIZE: "resize" } }, Scenes: { Events: { SHUTDOWN: "shutdown" } } }));
vi.mock("../audio/ambience", () => ({ prewarmAmbience: () => undefined }));
vi.mock("../debug/urlOptions", () => ({ urlOptions: () => ({}), skipsStartScreen: () => opts.skips }));
vi.mock("../display", () => ({ dpr: () => 1 }));
vi.mock("../render/city/streetProps.webp?url", () => ({ default: "/streetProps.webp" }));

import { BootScene } from "./BootScene";
import { uiStore, type UiScreen } from "../ui/uiState";
import { STREET_PROPS_KEY, resetStreetPropsForTests, streetPropsState, takeStreetProps } from "../render/city/streetPropsAtlas";
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
  timers: { fn: () => void; removed: boolean }[];
  /** The scene's loader fails the image (its `loaderror`). */
  fail(): void;
  /** The scene's loader finishes its queue (`complete`). */
  complete(): void;
}

function makeBoot(textures: Textures, boot = new BootScene()): Fake {
  const started: unknown[][] = [];
  const queued: string[] = [];
  const timers: { fn: () => void; removed: boolean }[] = [];
  const errors: ((f: { key?: string }) => void)[] = [];
  const completes: (() => void)[] = [];
  const text = () => {
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
    scene: { start: (...a: unknown[]) => started.push(a) },
    textures: { exists: textures.exists, remove: textures.remove, get: textures.get, once: textures.onceFn },
    load: {
      image: (k: string) => queued.push(k),
      on: (ev: string, fn: (f: { key?: string }) => void) => ev === "loaderror" && errors.push(fn),
      once: (ev: string, fn: () => void) => ev === "complete" && completes.push(fn),
      start: () => undefined,
    },
  });
  return {
    boot,
    started,
    queued,
    timers,
    fail: () => {
      for (const fn of errors) fn({ key: STREET_PROPS_KEY });
    },
    complete: () => {
      for (const fn of completes.splice(0)) fn();
    },
  };
}

/** The title's delayed step fires (unless it was removed). */
const fireTitle = (f: Fake): void => {
  for (const t of f.timers) if (!t.removed) t.fn();
};

describe("Story 9.14 (B26): Boot never waits for the street props image", () => {
  let textures: Textures;
  let screens: UiScreen[];
  let unsub: () => void;
  beforeEach(() => {
    resetStreetPropsForTests();
    opts.skips = false;
    textures = new Textures();
    screens = [];
    unsub = uiStore.subscribe((s) => screens.push(s));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    unsub();
    vi.restoreAllMocks();
    uiStore.handle("startOnline", undefined);
    uiStore.handle("startSolo", undefined);
  });

  it("starts the download and, on startOnline during the title (8.1 resume), starts the run at once while it loads", () => {
    const f = makeBoot(textures);
    f.boot.create();
    expect(f.queued).toEqual([STREET_PROPS_KEY]);
    expect(streetPropsState()).toBe("loading");
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]); // no wait: Game's own handlers take over, as on master
    expect(streetPropsState()).toBe("loading");
    expect(takeStreetProps(f.boot)).toBeNull(); // this run draws from code
  });

  it("8.1 resume during the title starts once: the title's delayed step is cancelled and does nothing if it fires", () => {
    opts.skips = true; // ?solo too: still only the online start
    const f = makeBoot(textures);
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    expect(f.timers.every((t) => t.removed)).toBe(true);
    const n = screens.length;
    for (const t of f.timers) t.fn(); // even if it fired anyway
    expect(screens.length).toBe(n); // no start screen over the run
    uiStore.request("startSolo");
    uiStore.request("startOnline", {} as NetSession);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
  });

  it("solo from the start screen starts at once, once", () => {
    const f = makeBoot(textures);
    f.boot.create();
    fireTitle(f);
    uiStore.request("startSolo");
    uiStore.request("startSolo");
    expect(f.started).toEqual([["Game", { mode: "solo" }]]);
  });

  it("an image that lands after the run started (Boot gone) is kept for the next run; Boot again starts no second download", () => {
    const boot = new BootScene();
    const f1 = makeBoot(textures, boot);
    f1.boot.create();
    fireTitle(f1);
    uiStore.request("startSolo");
    textures.add(STREET_PROPS_KEY); // heard on the game's texture manager, after Boot shut down
    expect(streetPropsState()).toBe("ready");
    expect(textures.keys.has(STREET_PROPS_KEY)).toBe(true); // not dropped: the next run's
    const f2 = makeBoot(textures, boot); // Leave → Boot again (Phaser reuses the scene object)
    f2.boot.create({ start: true });
    expect(f2.queued).toEqual([]);
    uiStore.request("startSolo");
    expect(f2.started).toEqual([["Game", { mode: "solo" }]]);
  });

  it("a failed download (loaderror) fails at once, warns once, and is not queued again", () => {
    const f = makeBoot(textures);
    f.boot.create();
    f.fail();
    expect(streetPropsState()).toBe("failed");
    expect(console.warn).toHaveBeenCalledTimes(1);
    const again = makeBoot(textures);
    again.boot.create({ start: true });
    expect(again.queued).toEqual([]);
  });

  it("re-review B: an image that downloads but doesn't decode (no loaderror, no texture) fails as soon as the load ends", () => {
    const f = makeBoot(textures);
    f.boot.create();
    f.complete();
    expect(streetPropsState()).toBe("failed");
    expect(console.warn).toHaveBeenCalledTimes(1);
    textures.add(STREET_PROPS_KEY); // nothing more happens after a failure
    expect(streetPropsState()).toBe("failed");
    expect(takeStreetProps(f.boot)).toBeNull();
  });

  it("the load ending with the texture in is a success (not a failure)", () => {
    const f = makeBoot(textures);
    f.boot.create();
    textures.add(STREET_PROPS_KEY);
    f.complete();
    expect(streetPropsState()).toBe("ready");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
