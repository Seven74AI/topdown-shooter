import type { KeyboardMouse } from "../input/KeyboardMouse";

/** The HUD fields the building keys press (`HudModel` has them all). */
export interface BuildKeysHud {
  rotatePressed: boolean;
  confirmPressed: boolean;
  /** Story 5.20: the undo chip ↶'s press (its own path checks it is shown and sends the take-back). */
  undoPressed: boolean;
}

/** One reused answer: the build-bar tile a digit picked (−1 = none), whether M was pressed, and (Story 10.10) whether B was. */
export interface BuildKeysOut {
  slot: number;
  pickUp: boolean;
  panel: boolean;
}

/**
 * Story 5.23 (AC 10–12): the building keys for one frame, before the placement step. Every latch is
 * taken each frame, so a press in a wave or under the menu (`blocked`) never fires later. R and
 * Space press ⟳ and Place only while `holding`; Z / Ctrl+Z press 5.20's undo chip (the chip ignores
 * it when nothing can be undone); the digit, M and (Story 10.10) B are handed back to the scene.
 */
export function routeBuildKeys(kb: KeyboardMouse, m: BuildKeysHud, holding: boolean, blocked: boolean, out: BuildKeysOut): BuildKeysOut {
  const rotate = kb.takeRotate();
  const place = kb.takePlace();
  const slot = kb.takeBuild();
  const undo = kb.takeUndo();
  const pickUp = kb.takePickUp();
  const panel = kb.takeBuildPanel();
  if (holding && !blocked) {
    if (rotate) m.rotatePressed = true;
    if (place) m.confirmPressed = true;
  }
  if (undo && !blocked) m.undoPressed = true;
  out.slot = slot;
  out.pickUp = pickUp && !blocked;
  out.panel = panel && !blocked && !holding; // Story 10.10 (AC 9): B toggles the Build panel (hands empty)
  return out;
}
