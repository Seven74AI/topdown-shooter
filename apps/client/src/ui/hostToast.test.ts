import { describe, expect, it } from "vitest";
import { HOST_TOAST_TEXT, HostToastWatch, hostToast } from "./hostToast";

describe("hostToast (Story 8.3 H1, AC 9)", () => {
  it("true only when the host slot changes TO my slot after the first patch", () => {
    expect(hostToast(0, 2, 2, false)).toBe(true);
    expect(hostToast(0, 1, 2, false)).toBe(false); // moved to someone else
    expect(hostToast(2, 2, 2, false)).toBe(false); // already host: no change
    expect(hostToast(2, 0, 2, false)).toBe(false); // moved away from me
  });

  it("never on the first patch (a lobby creator, a late joiner, a restarted scene)", () => {
    expect(hostToast(null, 0, 0, true)).toBe(false);
    expect(hostToast(1, 0, 0, true)).toBe(false);
    expect(hostToast(null, 0, 0, false)).toBe(false);
  });

  it("no slot of mine yet: never", () => {
    expect(hostToast(0, 1, undefined, false)).toBe(false);
    expect(hostToast(0, 1, null, false)).toBe(false);
  });

  it("the text", () => {
    expect(HOST_TOAST_TEXT).toBe("You are now the host");
  });
});

describe("HostToastWatch", () => {
  it("a creator never toasts; a guest toasts once when the role moves to it, and not again", () => {
    const creator = new HostToastWatch();
    expect(creator.observe(0, 0)).toBe(false);
    expect(creator.observe(0, 0)).toBe(false);
    const guest = new HostToastWatch();
    expect(guest.observe(0, undefined)).toBe(false); // before run.joined
    expect(guest.observe(0, 1)).toBe(false); // first patch with my slot
    expect(guest.observe(0, 1)).toBe(false);
    expect(guest.observe(1, 1)).toBe(true); // the host left: I am the host now
    expect(guest.observe(1, 1)).toBe(false); // once
    expect(guest.observe(0, 1)).toBe(false); // moved on (old host back? D8 says it never moves back; still no toast)
    expect(guest.observe(1, 1)).toBe(true); // moves to me again later: a new toast
  });

  it("reset: the next patch is a first patch again", () => {
    const w = new HostToastWatch();
    w.observe(0, 1);
    w.reset();
    expect(w.observe(1, 1)).toBe(false);
  });
});
