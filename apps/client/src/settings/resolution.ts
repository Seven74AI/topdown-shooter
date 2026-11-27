import { RESOLUTION_DPR, type PlayerSettings } from "@topdown/shared";
import { dpr, setDprCap } from "../display";
import { getSettings, subscribeSettings } from "./settings";

/** What `bindResolution` needs of the game: Phaser's scale manager (tests pass a fake). */
export interface ResizableGame {
  scale: { resize(w: number, h: number): unknown; setZoom(z: number): unknown };
}

/** The canvas in device px for the current `dpr()`: CSS viewport × dpr (Phaser 4 has no `resolution` option). */
export function deviceSize(cssW: number, cssH: number): [number, number] {
  return [Math.round(cssW * dpr()), Math.round(cssH * dpr())];
}

/** Applies the setting's cap to `dpr()`; returns true when it changed. */
export function applyResolutionCap(s: Pick<PlayerSettings, "resolution">): boolean {
  const before = dpr();
  setDprCap(RESOLUTION_DPR[s.resolution]);
  return dpr() !== before;
}

/**
 * Story 10.2-Q2 A (AC 4): the Resolution setting caps the canvas's device pixel ratio (Sharp 2 / Balanced 1.5 /
 * Fast 1). Call once before the game is made (so the first canvas has the right size), then `bind` with the game: a
 * change re-sizes the canvas at once, without a reload. The scenes' RESIZE handlers re-lay the HUD out from `dpr()`
 * (CSS sizes are kept: sticks, buttons and hit areas are `CSS px × dpr()`). Returns the unsubscribe.
 */
export function bindResolution(game: ResizableGame, viewport: () => [number, number]): () => void {
  applyResolutionCap(getSettings());
  return subscribeSettings((s) => {
    if (!applyResolutionCap(s)) return;
    game.scale.resize(...deviceSize(...viewport()));
    game.scale.setZoom(1 / dpr());
  });
}
