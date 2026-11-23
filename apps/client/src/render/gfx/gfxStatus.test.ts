import { describe, expect, it } from "vitest";
import { CANVAS_MODE_TEXT, GFX_RESET_TEXT, LostWatchdog, RESTORE_WAIT_MS, gfxStatus, rendererKind } from "./gfxStatus";

describe("rendererKind (Story 4.13)", () => {
  it("names Phaser 4.2.1's renderer types", () => {
    // Phaser.CANVAS = 1, Phaser.WEBGL = 2, Phaser.HEADLESS = 3 (node_modules/phaser/src/const.js)
    expect(rendererKind(2)).toBe("WebGL");
    expect(rendererKind(1)).toBe("Canvas");
    expect(rendererKind(3)).toBe("Headless");
    expect(rendererKind(0)).toBe("unknown"); // Phaser.AUTO is never a live renderer's type
    expect(rendererKind(undefined)).toBe("unknown");
  });
});

describe("gfxStatus", () => {
  it("prints the renderer, then lost / restored counts once something happened", () => {
    gfxStatus.renderer = "WebGL";
    expect(gfxStatus.line()).toBe("renderer WebGL");
    gfxStatus.lostCount = 1;
    gfxStatus.lost = true;
    expect(gfxStatus.line()).toBe("renderer WebGL · context lost 1 · restored 0 · LOST NOW");
    gfxStatus.lost = false;
    gfxStatus.restoreCount = 1;
    expect(gfxStatus.line()).toBe("renderer WebGL · context lost 1 · restored 1");
    gfxStatus.lostCount = 0;
    gfxStatus.restoreCount = 0;
  });

  it("publishes the notice to subscribers until dismissed", () => {
    const seen: (string | null)[] = [];
    const off = gfxStatus.subscribe((n) => seen.push(n?.text ?? null));
    gfxStatus.showNotice({ text: CANVAS_MODE_TEXT, action: "dismiss" });
    gfxStatus.showNotice(null);
    off();
    gfxStatus.showNotice({ text: GFX_RESET_TEXT, action: "reload" });
    expect(seen).toEqual([CANVAS_MODE_TEXT, null]);
    expect(gfxStatus.getNotice()?.action).toBe("reload");
    gfxStatus.showNotice(null);
  });

  it("the canvas-mode text says what to do", () => {
    expect(CANVAS_MODE_TEXT).toContain("Graphics acceleration is off");
    expect(CANVAS_MODE_TEXT).toContain("Fully close and reopen your browser");
  });
});

describe("LostWatchdog", () => {
  it("expires after RESTORE_WAIT_MS of visible time while lost", () => {
    const w = new LostWatchdog();
    w.lost(1000, true);
    expect(w.expired(1000 + RESTORE_WAIT_MS - 1)).toBe(false);
    expect(w.expired(1000 + RESTORE_WAIT_MS)).toBe(true);
  });

  it("time in the background does not count (Android restores only once the page is shown)", () => {
    const w = new LostWatchdog(5000);
    w.lost(0, false); // lost while switching apps
    expect(w.expired(60_000)).toBe(false); // a minute in the background
    w.visibility(60_000, true); // back in the app
    expect(w.expired(64_999)).toBe(false);
    expect(w.expired(65_000)).toBe(true);
    w.visibility(65_500, false); // hidden again: the clock stops
    expect(w.expired(90_000)).toBe(false);
  });

  it("a restore clears it", () => {
    const w = new LostWatchdog(5000);
    w.lost(0, true);
    w.restored();
    expect(w.isLost).toBe(false);
    expect(w.expired(10_000)).toBe(false);
  });
});
