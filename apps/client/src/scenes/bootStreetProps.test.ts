import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Story 9.14 review H1: the street props image must never hold up the title or the start handlers (Story 8.1: a
 * reload that takes its seat back asks for the Game scene during the title), and a request that comes before the
 * image is in is kept and run once it settles (loaded, failed, or timed out).
 */
vi.mock("phaser", () => ({ Scene: class {}, Scale: { Events: { RESIZE: "resize" } }, Scenes: { Events: { SHUTDOWN: "shutdown" } } }));
vi.mock("../audio/ambience", () => ({ prewarmAmbience: () => undefined }));
vi.mock("../debug/urlOptions", () => ({ urlOptions: () => ({}), skipsStartScreen: () => false }));
vi.mock("../display", () => ({ dpr: () => 1 }));
vi.mock("../render/city/streetProps.webp?url", () => ({ default: "/streetProps.webp" }));

import { BootScene } from "./BootScene";
import { uiStore } from "../ui/uiState";
import { STREET_PROPS_KEY, STREET_PROPS_TIMEOUT_MS, resetStreetPropsForTests, streetPropsState, takeStreetProps } from "../render/city/streetPropsAtlas";
import type { NetSession } from "../net/session";

interface Fake {
  boot: BootScene;
  started: unknown[][];
  queued: string[];
  loaderStarted: number;
  textures: Set<string>;
  complete(): void;
}

function makeBoot(): Fake {
  const boot = new BootScene();
  const started: unknown[][] = [];
  const queued: string[] = [];
  const textures = new Set<string>();
  const onComplete: (() => void)[] = [];
  let loaderStarted = 0;
  const text = { setOrigin: () => text, setPosition: () => text };
  Object.assign(boot, {
    add: { text: () => text },
    scale: { width: 844, height: 390, on: () => undefined, off: () => undefined },
    events: { once: () => undefined },
    time: { delayedCall: () => undefined },
    scene: { start: (...a: unknown[]) => started.push(a) },
    textures: { exists: (k: string) => textures.has(k), remove: (k: string) => textures.delete(k), get: () => ({ getSourceImage: () => ({}) }) },
    load: {
      image: (k: string) => queued.push(k),
      once: (ev: string, fn: () => void) => ev === "complete" && onComplete.push(fn),
      start: () => loaderStarted++,
    },
  });
  const f: Fake = {
    boot,
    started,
    queued,
    get loaderStarted() {
      return loaderStarted;
    },
    textures,
    complete: () => {
      for (const fn of onComplete.splice(0)) fn();
    },
  };
  return f;
}

describe("Story 9.14 (review H1): Boot and the street props image", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreetPropsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    uiStore.handle("startOnline", undefined);
    uiStore.handle("startSolo", undefined);
  });

  it("takes startOnline before the image has loaded (the title and handlers do not wait), and starts the run when it lands", () => {
    const f = makeBoot();
    f.boot.create();
    expect(f.queued).toEqual([STREET_PROPS_KEY]);
    expect(f.loaderStarted).toBe(1); // a background download from create(): no preload holds the scene
    expect(streetPropsState()).toBe("loading");
    const session = {} as NetSession;
    uiStore.request("startOnline", session); // a reload taking its seat back, during the title
    expect(f.started).toEqual([]); // kept, not dropped
    f.textures.add(STREET_PROPS_KEY);
    f.complete();
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    expect(streetPropsState()).toBe("ready");
  });

  it("a failed download starts the run anyway (code drawings), once, and is not queued again on the next Boot", () => {
    const f = makeBoot();
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    f.complete(); // the loader finished without the texture: an error
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    expect(streetPropsState()).toBe("failed");
    expect(console.warn).toHaveBeenCalledTimes(1);
    const again = makeBoot();
    again.boot.create({ start: true });
    expect(again.queued).toEqual([]);
    uiStore.request("startSolo");
    expect(again.started).toEqual([["Game", { mode: "solo" }]]); // nothing to wait for
  });

  it("a hung download times out: the run starts, and an image that lands later is dropped, never used", () => {
    const f = makeBoot();
    f.boot.create();
    const session = {} as NetSession;
    uiStore.request("startOnline", session);
    vi.advanceTimersByTime(STREET_PROPS_TIMEOUT_MS - 1);
    expect(f.started).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(f.started).toEqual([["Game", { mode: "online", session }]]);
    f.textures.add(STREET_PROPS_KEY);
    f.complete();
    expect(f.textures.has(STREET_PROPS_KEY)).toBe(false);
    expect(takeStreetProps(f.boot)).toBeNull();
  });

  it("no download once the downtown atlas exists", () => {
    const f = makeBoot();
    f.textures.add("atlas_downtown");
    f.boot.create();
    expect(f.queued).toEqual([]);
    expect(streetPropsState()).toBe("failed");
  });
});
