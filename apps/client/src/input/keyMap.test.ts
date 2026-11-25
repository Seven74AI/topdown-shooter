import { describe, expect, it } from "vitest";
import { KEY_MAP, buildSlot, keyAction, letterAction } from "./keyMap";
import { KeyboardMouse } from "./KeyboardMouse";
import { InputRouter } from "./InputRouter";
import { TouchSticks } from "./TouchSticks";
import { attachDesktopInput } from "./desktopInput";

/**
 * Story 5.23 (AC 10–13, D15–D17): the building keys. A press reaches the game as (code, key): the
 * physical key and the layout's letter. Rows: what each layout sends for the letter printed on the key.
 */
const LAYOUTS: Record<string, Record<string, string>> = {
  // letter → code
  qwerty: { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD", q: "KeyQ", e: "KeyE", r: "KeyR", z: "KeyZ", m: "KeyM", y: "KeyY" },
  azerty: { z: "KeyW", q: "KeyA", s: "KeyS", d: "KeyD", a: "KeyQ", e: "KeyE", r: "KeyR", w: "KeyZ", m: "Semicolon", y: "KeyY" },
  qwertz: { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD", q: "KeyQ", e: "KeyE", r: "KeyR", z: "KeyY", m: "KeyM", y: "KeyZ" },
};

describe("Story 5.23: the key map", () => {
  it("R rotates, Space places, 1–7 (row and numpad) pick tiles 0–6; 8 and 0 are unbound", () => {
    expect([keyAction("KeyR"), keyAction("Space"), keyAction("Digit1"), keyAction("Numpad7")]).toEqual(["rotate", "place", "build", "build"]);
    expect([buildSlot("Digit1"), buildSlot("Digit7"), buildSlot("Numpad3"), buildSlot("Digit8"), buildSlot("KeyR")]).toEqual([0, 6, 2, -1, -1]);
    expect([keyAction("Digit8"), keyAction("Digit0")]).toEqual([undefined, undefined]);
  });

  it("the E consumable (5.12), Q swap, WASD and Esc keep their keys; no new binding on them", () => {
    expect([KEY_MAP.KeyE, KEY_MAP.KeyQ, KEY_MAP.KeyW, KEY_MAP.Escape]).toEqual(["consumable", "swap", "up", "menu"]);
    const counts = new Map<string, number>();
    for (const code of Object.keys(KEY_MAP)) counts.set(code, (counts.get(code) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  });

  it("per layout: walking, swap, E, R, undo and pick-up land on the right letters (D15–D17)", () => {
    const act = (layout: string, letter: string) => letterAction((LAYOUTS[layout] as Record<string, string>)[letter] as string, letter);
    // QWERTY: WASD walk; Q swap; E consumable; R rotate; Z undo; M pick up
    expect(["w", "a", "s", "d", "q", "e", "r", "z", "m"].map((l) => act("qwerty", l))).toEqual(["up", "left", "down", "right", "swap", "consumable", "rotate", "undo", "pickUp"]);
    // AZERTY: ZQSD walk (positional); the A key swaps; E stays the consumable; R rotates; Z walks (not undo: Ctrl+Z); M picks up
    expect(["z", "q", "s", "d", "a", "e", "r", "m"].map((l) => act("azerty", l))).toEqual(["up", "left", "down", "right", "swap", "consumable", "rotate", "pickUp"]);
    expect(act("azerty", "w")).toBeUndefined(); // the W key sends KeyZ with the letter w: nothing (undo is Ctrl+Z there)
    // QWERTZ: Z sits on KeyY → undo; Y sits on KeyZ → nothing
    expect([act("qwertz", "z"), act("qwertz", "y"), act("qwertz", "e"), act("qwertz", "m")]).toEqual(["undo", undefined, "consumable", "pickUp"]);
  });
});

describe("Story 5.23: KeyboardMouse latches (AC 10–12)", () => {
  it("each building key latches once per press; auto-repeat and a held key add nothing; keyUp by code", () => {
    const k = new KeyboardMouse();
    expect(k.keyDown("KeyR", false, "r")).toBe(true);
    expect(k.keyDown("KeyR", true, "r")).toBe(true);
    expect([k.takeRotate(), k.takeRotate()]).toEqual([true, false]);
    k.keyUp("KeyR");
    k.keyDown("Space", false, " ");
    k.keyDown("Space", true, " ");
    expect([k.takePlace(), k.takePlace()]).toEqual([true, false]);
    k.keyDown("Digit3", false, "3");
    expect([k.takeBuild(), k.takeBuild()]).toEqual([2, -1]);
    k.keyDown("KeyZ", false, "z");
    k.keyDown("KeyM", false, "m");
    expect([k.takeUndo(), k.takePickUp(), k.takeUndo(), k.takePickUp()]).toEqual([true, true, false, false]);
    expect(k.keyUp("KeyZ")).toBe(true);
    expect(k.keyDown("KeyX", false, "x")).toBe(false);
  });

  it("AZERTY's Z walks up and never undoes; its release ends the walk", () => {
    const k = new KeyboardMouse();
    k.keyDown("KeyW", false, "z");
    expect([k.moveVector().y, k.takeUndo()]).toEqual([-1, false]);
    k.keyUp("KeyW");
    expect(k.moveVector().y).toBe(0);
  });

  it("a repeat after a blur re-holds the key but latches nothing; releaseAll clears every latch", () => {
    const k = new KeyboardMouse();
    k.keyDown("Space", true, " ");
    expect(k.takePlace()).toBe(false);
    k.keyDown("KeyR", false, "r");
    k.keyDown("Digit1", false, "1");
    k.pressUndo();
    k.releaseAll();
    expect([k.takeRotate(), k.takeBuild(), k.takeUndo()]).toEqual([false, -1, false]);
  });
});

describe("Story 5.23: desktop wiring — Ctrl/Cmd+Z on every layout (D15)", () => {
  function rig() {
    const listeners = new Map<string, (e: Event) => void>();
    const win = {
      addEventListener: (t: string, f: (e: Event) => void) => listeners.set(t, f),
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as EventTarget;
    const doc = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true } as unknown as EventTarget;
    const router = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    attachDesktopInput(router, win, doc, null);
    const key = (e: Record<string, unknown>) => {
      let prevented = false;
      (listeners.get("keydown") as (e: Event) => void)({ repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, preventDefault: () => (prevented = true), ...e } as unknown as Event);
      return prevented;
    };
    return { router, key };
  }

  it("Ctrl+Z (QWERTY), Ctrl+Z on AZERTY (code KeyW, letter z) and Cmd+Z undo; other shortcuts stay the browser's", () => {
    const r = rig();
    expect(r.key({ code: "KeyZ", key: "z", ctrlKey: true })).toBe(true);
    expect(r.router.kbm.takeUndo()).toBe(true);
    expect(r.key({ code: "KeyW", key: "z", ctrlKey: true })).toBe(true); // AZERTY
    expect([r.router.kbm.takeUndo(), r.router.kbm.moveVector().y]).toEqual([true, 0]); // and no walking
    expect(r.key({ code: "KeyZ", key: "z", metaKey: true })).toBe(true);
    expect(r.router.kbm.takeUndo()).toBe(true);
    expect(r.key({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true })).toBe(false); // redo: the browser's
    expect(r.key({ code: "KeyR", key: "r", ctrlKey: true })).toBe(false); // reload stays the browser's
    expect([r.router.kbm.takeUndo(), r.router.kbm.takeRotate()]).toEqual([false, false]);
  });

  it("review M1: a focused DOM button keeps Space / R / digits (no game action, no preventDefault); walking still works", () => {
    const r = rig();
    const button = { tagName: "BUTTON", getAttribute: () => null };
    expect(r.key({ code: "Space", key: " ", target: button })).toBe(false);
    expect(r.key({ code: "KeyR", key: "r", target: { tagName: "A", getAttribute: () => null } })).toBe(false);
    expect(r.key({ code: "Digit1", key: "1", target: { tagName: "DIV", getAttribute: (n: string) => (n === "role" ? "button" : null) } })).toBe(false);
    expect(r.key({ code: "Digit2", key: "2", target: { tagName: "SELECT", getAttribute: () => null } })).toBe(false);
    expect([r.router.kbm.takePlace(), r.router.kbm.takeRotate(), r.router.kbm.takeBuild()]).toEqual([false, false, -1]);
    expect(r.key({ code: "KeyW", key: "w", target: button })).toBe(true); // movement is still game input
    expect(r.router.kbm.moveVector().y).toBe(-1);
    expect(r.key({ code: "Space", key: " ", target: { tagName: "CANVAS", getAttribute: () => null } })).toBe(true); // on the game: places
    expect(r.router.kbm.takePlace()).toBe(true);
  });

  it("review L10: a non-Latin layout (Russian: KeyZ sends я) still undoes with Ctrl+Z by the key's US letter", () => {
    const r = rig();
    expect(r.key({ code: "KeyZ", key: "я", ctrlKey: true })).toBe(true);
    expect(r.router.kbm.takeUndo()).toBe(true);
    expect(r.key({ code: "KeyM", key: "ь" })).toBe(true); // plain: M by the US letter too
    expect(r.router.kbm.takePickUp()).toBe(true);
  });

  it("a plain press passes the layout letter: AZERTY's M (Semicolon) picks up; Space prevents the page scroll", () => {
    const r = rig();
    expect(r.key({ code: "Semicolon", key: "m" })).toBe(true);
    expect(r.router.kbm.takePickUp()).toBe(true);
    expect(r.key({ code: "Space", key: " " })).toBe(true);
    expect(r.key({ code: "Digit9", key: "9" })).toBe(false);
  });
});

describe("Story 5.23 (D12): the router counts real mouse moves (the cursor follow's trigger)", () => {
  it("a mouse move to a new spot counts; the same spot or a touch doesn't", () => {
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    r.pointerMove(1, 100, 100, false, false);
    const n = r.mouseMoves;
    r.pointerMove(1, 100, 100, false, false);
    expect(r.mouseMoves).toBe(n);
    r.pointerMove(1, 101, 100, false, false);
    expect(r.mouseMoves).toBe(n + 1);
    r.pointerMove(2, 300, 200, true, false);
    expect(r.mouseMoves).toBe(n + 1);
  });
});

describe("Story 8.7: F opens the ping wheel", () => {
  it("F is bound to ping (KeyF on every layout: AZERTY / QWERTZ keep F there), once per press, never by auto-repeat; blur clears it", () => {
    expect(keyAction("KeyF")).toBe("ping");
    expect(letterAction("KeyF", "f")).toBe("ping");
    const k = new KeyboardMouse();
    expect(k.keyDown("KeyF")).toBe(true);
    expect(k.heldCountOf("ping")).toBe(1);
    expect(k.keyDown("KeyF", true)).toBe(true); // auto-repeat
    expect([k.takePing(), k.takePing()]).toEqual([true, false]);
    k.keyUp("KeyF");
    expect(k.heldCountOf("ping")).toBe(0);
    k.keyDown("KeyF");
    k.releaseAll();
    expect(k.takePing()).toBe(false);
    expect(k.heldCountOf("ping")).toBe(0);
  });
});
