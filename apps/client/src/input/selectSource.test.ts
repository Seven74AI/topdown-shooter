import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT } from "@topdown/shared";
import { MOUSE_SWITCH_PX, selectSource } from "./selectSource";
import { InputRouter, type MutablePlayerInput } from "./InputRouter";
import { TouchSticks } from "./TouchSticks";
import { attachDesktopInput, MOUSE_MODE_CLASS } from "./desktopInput";

const W = 800;
const input = (): MutablePlayerInput => ({ ...NEUTRAL_INPUT });

describe("selectSource", () => {
  it("a touch-down always picks touch", () => {
    expect(selectSource("mouse", "touchDown")).toBe("touch");
    expect(selectSource("touch", "touchDown")).toBe("touch");
  });

  it("a key or a mouse button picks keyboard + mouse", () => {
    expect(selectSource("touch", "key")).toBe("mouse");
    expect(selectSource("touch", "mouseButton")).toBe("mouse");
  });

  it("mouse movement counts only past the threshold", () => {
    expect(selectSource("touch", "mouseMove", MOUSE_SWITCH_PX)).toBe("touch");
    expect(selectSource("touch", "mouseMove", MOUSE_SWITCH_PX + 0.5)).toBe("mouse");
    expect(selectSource("mouse", "mouseMove", 0)).toBe("mouse");
  });
});

describe("InputRouter", () => {
  const router = () => new InputRouter(new TouchSticks(100, 0.1, 0.3));

  it("starts on touch and builds the input from the sticks", () => {
    const r = router();
    r.pointerDown(1, 100, 300, true, 0, false, W);
    r.pointerMove(1, 200, 300, true, false);
    const out = r.build(input(), false, 0, 0, Number.NaN, Number.NaN);
    expect(out.moveX).toBeCloseTo(1, 9);
    expect(out.isMouse).toBe(false);
  });

  it("a mouse click never creates a stick; it fires toward the cursor with isMouse", () => {
    const r = router();
    r.pointerDown(0, 100, 300, false, 0, false, W);
    expect(r.sticks.move).toBeNull();
    expect(r.isMouse).toBe(true);
    r.keyDown("KeyW");
    const out = r.build(input(), false, 5, 5, 8, 9);
    expect(out).toMatchObject({ moveX: 0, moveY: -1, fire: true, isMouse: true });
    expect(out.aimX).toBeCloseTo(0.6, 9);
    expect(out.aimY).toBeCloseTo(0.8, 9);
    r.pointerUp(0, false, false);
    expect(r.build(input(), false, 5, 5, 8, 9).fire).toBe(false);
  });

  it("Esc (the in-run menu, Story 2.11) keeps touch mode", () => {
    const r = router();
    expect(r.keyDown("Escape")).toBe(true);
    expect(r.isMouse).toBe(false);
    expect(r.kbm.takeMenu()).toBe(true);
  });

  it("a mouse click on a HUD button switches to mouse but does not fire", () => {
    const r = router();
    r.pointerDown(0, 700, 300, false, 0, true, W);
    const out = r.build(input(), true, 0, 0, 1, 0);
    expect(out).toMatchObject({ fire: false, swap: true, isMouse: true });
  });

  it("right click does not fire", () => {
    const r = router();
    r.pointerDown(0, 700, 300, false, 2, false, W);
    expect(r.build(input(), false, 0, 0, 1, 0).fire).toBe(false);
  });

  it("switches back to touch on a touch-down, and to mouse after > 4 px of mouse movement", () => {
    const r = router();
    const seen: string[] = [];
    r.onSourceChange = (s) => seen.push(s);
    r.keyDown("KeyD");
    expect(r.isMouse).toBe(true);
    r.pointerDown(2, 600, 200, true, 0, false, W);
    expect(r.isMouse).toBe(false);
    r.pointerMove(0, 3, 0, false, false); // first sighting of the mouse: anchor
    r.pointerMove(0, 6, 0, false, false); // 3 px: jitter
    expect(r.isMouse).toBe(false);
    r.pointerMove(0, 8, 0, false, false); // 5 px from the anchor
    expect(r.isMouse).toBe(true);
    expect(r.sticks.aim).toBeNull(); // the mouse took over: the resting thumb no longer aims
    expect(seen).toEqual(["mouse", "touch", "mouse"]);
  });

  it("Q gives exactly one swap sample", () => {
    const r = router();
    r.keyDown("KeyQ");
    expect(r.build(input(), false, 0, 0, 1, 0).swap).toBe(true);
    expect(r.build(input(), false, 0, 0, 1, 0).swap).toBe(false);
  });

  it("aims even with a still mouse when the survivor moves", () => {
    const r = router();
    r.pointerMove(0, 10, 10, false, false);
    r.keyDown("KeyD");
    const a = r.build(input(), false, 0, 0, 10, 0);
    expect(a.aimX).toBeCloseTo(1, 9);
    const b = r.build(input(), false, 20, 0, 10, 0); // survivor walked past the cursor
    expect(b.aimX).toBeCloseTo(-1, 9);
  });
});

describe("attachDesktopInput", () => {
  const key = (type: string, code: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

  it("routes keys, releases on blur, blocks the context menu and toggles the cursor class", () => {
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    const win = new EventTarget();
    const doc = new EventTarget();
    const classes = new Set<string>();
    const gameEl = Object.assign(new EventTarget(), {
      classList: {
        toggle: (n: string, on?: boolean) => (on ? classes.add(n) : classes.delete(n), !!on),
        remove: (n: string) => void classes.delete(n),
      },
    });
    const detach = attachDesktopInput(r, win, doc, gameEl);
    const down = key("keydown", "KeyW");
    win.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(classes.has(MOUSE_MODE_CLASS)).toBe(true);
    expect(r.build(input(), false, 0, 0, 1, 0).moveY).toBe(-1);
    const other = key("keydown", "KeyZ");
    win.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    win.dispatchEvent(key("keydown", "KeyA", { ctrlKey: true })); // browser shortcut: ignored
    expect(r.build(input(), false, 0, 0, 1, 0).moveX).toBe(0); // Ctrl+A did not press A
    win.dispatchEvent(new Event("blur"));
    expect(r.build(input(), false, 0, 0, 1, 0).moveX).toBe(0);
    expect(r.build(input(), false, 0, 0, 1, 0).moveY).toBe(0);
    const menu = new Event("contextmenu", { cancelable: true });
    gameEl.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    r.pointerDown(1, 10, 10, true, 0, false, W);
    expect(classes.has(MOUSE_MODE_CLASS)).toBe(false);
    detach();
    win.dispatchEvent(key("keydown", "KeyS"));
    expect(r.isMouse).toBe(false);
    expect(r.onSourceChange).toBeNull();
  });

  const setupDom = () => {
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { hidden: false });
    const detach = attachDesktopInput(r, win, doc, null);
    return { r, win, doc, detach };
  };

  it("releases keys when the tab is hidden", () => {
    const { r, win, doc, detach } = setupDom();
    win.dispatchEvent(key("keydown", "KeyD"));
    expect(r.build(input(), false, 0, 0, 1, 0).moveX).toBe(1);
    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(r.build(input(), false, 0, 0, 1, 0).moveX).toBe(0);
    detach();
  });

  it("ignores keys typed into a text field", () => {
    const { r, win, detach } = setupDom();
    const ev = key("keydown", "KeyW");
    Object.defineProperty(ev, "target", { value: { tagName: "INPUT" } });
    win.dispatchEvent(ev);
    expect(r.build(input(), false, 0, 0, 1, 0).moveY).toBe(0);
    detach();
  });

  it("releases movement when Cmd lifts (macOS sends no keyup for keys released under Cmd)", () => {
    const { r, win, detach } = setupDom();
    win.dispatchEvent(key("keydown", "KeyD"));
    win.dispatchEvent(key("keyup", "MetaLeft"));
    expect(r.build(input(), false, 0, 0, 1, 0).moveX).toBe(0);
    detach();
  });

  it("holds a key that was already down when focus came back (repeat-only keydowns)", () => {
    const { r, win, detach } = setupDom();
    win.dispatchEvent(key("keydown", "KeyW"));
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(key("keydown", "KeyW", { repeat: true }));
    expect(r.build(input(), false, 0, 0, 1, 0).moveY).toBe(-1);
    win.dispatchEvent(key("keydown", "KeyQ", { repeat: true })); // never a swap edge
    expect(r.build(input(), false, 0, 0, 1, 0).swap).toBe(false);
    detach();
  });
});

describe("InputRouter mouse button across a touch", () => {
  it("keeps firing when the mouse comes back with the left button still held", () => {
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    r.pointerDown(0, 400, 200, false, 0, false, W); // mouse: left down → mouse mode, firing
    r.pointerDown(1, 100, 300, true, 0, false, W); // a touch takes over (clears the cached button)
    r.pointerUp(1, true, false);
    r.pointerMove(0, 420, 200, false, false, true); // mouse moves > 4 px, button still held
    expect(r.isMouse).toBe(true);
    expect(r.build(input(), false, 0, 0, 1, 0).fire).toBe(true);
  });
});

