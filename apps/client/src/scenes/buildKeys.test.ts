import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, startBuild, type SystemFn } from "@topdown/shared";
import { KeyboardMouse } from "../input/KeyboardMouse";
import { routeBuildKeys, type BuildKeysHud, type BuildKeysOut } from "./buildKeys";
import { UndoChip, type UndoPendingView } from "./undoChip";

const balance = loadBalance();
const noop: SystemFn = () => {};

/** Story 5.23 (AC 10–12): the building keys → the HUD presses; Z / Ctrl+Z reach 5.20's real undo. */
describe("Story 5.23: routeBuildKeys", () => {
  const hud = (): BuildKeysHud => ({ rotatePressed: false, confirmPressed: false, undoPressed: false });
  const out = (): BuildKeysOut => ({ slot: -1, pickUp: false });

  it("R / Space press ⟳ / Place only while holding; a digit and M are handed back; everything is taken every frame", () => {
    const kb = new KeyboardMouse();
    const m = hud();
    kb.keyDown("KeyR", false, "r");
    kb.keyDown("Space", false, " ");
    kb.keyDown("Digit4", false, "4");
    kb.keyDown("KeyM", false, "m");
    const o = routeBuildKeys(kb, m, false, false, out());
    expect([m.rotatePressed, m.confirmPressed, o.slot, o.pickUp]).toEqual([false, false, 3, true]); // not holding: R / Space do nothing
    kb.releaseAll();
    kb.keyDown("KeyR", false, "r");
    kb.keyDown("Space", false, " ");
    routeBuildKeys(kb, m, true, false, o);
    expect([m.rotatePressed, m.confirmPressed, o.slot, o.pickUp]).toEqual([true, true, -1, false]);
  });

  it("blocked (a wave, the menu, the shop): presses are dropped, never kept for later", () => {
    const kb = new KeyboardMouse();
    const m = hud();
    kb.keyDown("KeyR", false, "r");
    kb.pressUndo();
    kb.keyDown("KeyM", false, "m");
    const o = routeBuildKeys(kb, m, true, true, out());
    expect([m.rotatePressed, m.undoPressed, o.pickUp]).toEqual([false, false, false]);
    routeBuildKeys(kb, m, true, false, o); // unblocked next frame: nothing left over
    expect([m.rotatePressed, m.undoPressed]).toEqual([false, false]);
  });

  it("Z (QWERTY) and Ctrl+Z (AZERTY's letter z) press the undo chip, which takes back my last Place", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: noop } });
    addPlayer(world, "local", 30, 16);
    startBuild(world);
    const r = placeBuilding(world, "local", { type: "wood_barricade", gx: 20, gy: 20, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const pending: UndoPendingView = { builtId: (o) => (o === 1 ? r.value.id : 0), waiting: () => false };
    const chip = new UndoChip();
    const sent: number[] = [];
    const W = balance.controls.build.undoWindowMs;
    const T = balance.controls.build.pendingTimeoutMs;
    chip.placed(1, 0, world.waves.number);
    chip.update(world, "local", pending, 100, W, T, true, true, (id) => sent.push(id));
    const kb = new KeyboardMouse();
    const m = hud();
    kb.keyDown("KeyZ", false, "z"); // QWERTY plain Z
    routeBuildKeys(kb, m, false, false, out());
    expect(m.undoPressed).toBe(true);
    // the scene's undo step (GameScene.updateUndo): the press → the building's id to sell
    m.undoPressed = false;
    expect(chip.press(120)).toBe(r.value.id);
    // AZERTY: the Z key walks (KeyW); Ctrl+Z arrives as pressUndo (desktopInput) and still presses undo
    kb.releaseAll();
    kb.keyDown("KeyW", false, "z");
    routeBuildKeys(kb, m, false, false, out());
    expect(m.undoPressed).toBe(false);
    kb.pressUndo();
    routeBuildKeys(kb, m, false, false, out());
    expect(m.undoPressed).toBe(true);
    expect(chip.press(130)).toBe(0); // nothing left to undo: the chip ignores a second press
  });
});
