import { COSMETIC_SLOTS, DEFAULT_LOOK, STARTER_PARTS, encodeLook, type PlayerState, type SurvivorLook } from "@topdown/shared";
import type { PlayerView } from "./PlayerView";

/** Spacing of the extra survivors beside mine (m). */
const DEV_LOOK_SPACING_M = 1.2;
/** Fixed seed: the same random looks every time (perf before/after compare like with like). */
const DEV_LOOK_SEED = 0x7e9;

/** `count` random starter looks from a fixed seed (dev switch only: never the simulation's streams). */
export function devLookCodes(count: number, seed = DEV_LOOK_SEED): string[] {
  let s = seed >>> 0;
  const next = (n: number): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return Math.floor((s / 2 ** 32) * n);
  };
  const hex = (): string => `#${next(0x1000000).toString(16).padStart(6, "0")}`;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const parts = {} as Record<(typeof COSMETIC_SLOTS)[number], string>;
    for (const slot of COSMETIC_SLOTS) parts[slot] = STARTER_PARTS[slot][next(STARTER_PARTS[slot].length)] ?? DEFAULT_LOOK[slot];
    const look: SurvivorLook = { ...parts, colours: { top: hex(), hair: hex(), accent: hex() } };
    out.push(encodeLook(look));
  }
  return out;
}

type Mirror = { prevX: number; x: number; prevY: number; y: number; facingX: number; facingY: number; status: PlayerState["status"]; slowTicksLeft: number; loadout: PlayerState["loadout"] };

/**
 * Story 7.9 (AC 14): `?devlooks=N` — extra standing survivors next to mine, each with its own random starter look and
 * body texture, copying my pose and weapon (views only: the World never sees them). For the `?stress=150` FPS check.
 * Views are made on the first update; each frame copies a few numbers into a reused state (no allocation).
 */
export class DevLooks {
  private readonly ids: string[];
  private readonly codes: string[];
  private readonly mirrors: Mirror[];
  private views: PlayerView[] | null = null;

  constructor(
    count: number,
    private readonly make: () => PlayerView,
    private readonly syncLook: (view: PlayerView, id: string, code: string) => void,
  ) {
    this.codes = devLookCodes(count);
    this.ids = this.codes.map((_, i) => `devlook${i + 1}`);
    this.mirrors = this.codes.map(() => ({ prevX: 0, x: 0, prevY: 0, y: 0, facingX: 1, facingY: 0, status: "alive", slowTicksLeft: 0, loadout: { slots: [], active: 0 } as unknown as PlayerState["loadout"] }));
  }

  update(me: PlayerState, alpha: number, timeMs: number): void {
    const views = (this.views ??= this.codes.map((_, i) => {
      const v = this.make();
      v.setSlot((i + 1) % 4);
      return v;
    }));
    for (let i = 0; i < views.length; i++) {
      const m = this.mirrors[i] as Mirror;
      const dx = (i + 1) * DEV_LOOK_SPACING_M;
      m.prevX = me.prevX + dx;
      m.x = me.x + dx;
      m.prevY = me.prevY;
      m.y = me.y;
      m.facingX = me.facingX;
      m.facingY = me.facingY;
      m.loadout = me.loadout;
      const v = views[i] as PlayerView;
      this.syncLook(v, this.ids[i] as string, this.codes[i] as string);
      v.update(m as unknown as PlayerState, alpha, timeMs);
    }
  }

  destroy(): void {
    for (const v of this.views ?? []) v.destroy();
    this.views = null;
  }
}
