import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 10.10 (brief R2: a wiring test per hookup): the scene lines that connect the tested Build-button helpers
 * (`buildBar.ts`: quickType, panelStaysOpen, togglePanelKey, dropQuietPresses, panelTapOutside, buildPanelSlots)
 * to the game. Each expectation fails when its line is deleted.
 */
const client = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("Story 10.10 client wiring", () => {
  it("GameScene: the quick tile follows my confirmed placements; the panel's close causes, Build / B toggles, Esc first; quiet-window presses dropped", () => {
    const src = client("scenes", "GameScene.ts");
    expect(src).toContain("if (e.ownerId === localId) this.lastPlacedType = e.buildingType;"); // review 3: the server's building.placed, never the Place
    expect(src.match(/this\.lastPlacedType = /g)?.length).toBe(2); // only the event and the per-run reset (never on the Place)
    expect(src).toContain("m.buildQuick = quickType(m.buildItems, this.lastPlacedType);");
    expect(src).toContain("m.buildPanelOpen = panelStaysOpen(m.buildPanelOpen, m.buildBar, r.pick !== \"\", m.ping.open, m.buildItems.length);");
    expect(src).toContain("if (k.panel) togglePanelKey(this.hudModel);");
    expect(src).toMatch(/if \(m\.buildPanelPressed\) \{\s+m\.buildPanelPressed = false;[^\n]*\n\s+togglePanelKey\(m\);/);
    expect(src).toMatch(/if \(menuKey && this\.hudModel\.buildPanelOpen\) \{\s+this\.hudModel\.buildPanelOpen = false;\s+menuKey = false;/);
    // review 1, 2: dropped before swap / quick-use reach the router (and before ↶ and Build are read later in the frame)
    expect(src.indexOf("dropQuietPresses(this.hudModel, this.barQuiet(host));")).toBeGreaterThan(-1);
    expect(src.indexOf("dropQuietPresses(this.hudModel, this.barQuiet(host));")).toBeLessThan(src.indexOf("router.build(this.input_, this.hudModel.swapPressed"));
  });

  it("HudScene: Build goes through the model; a touch while open follows panelTapOutside (only KEEP / CONSUME swallow it); the quick type on the quick tile's spot", () => {
    const src = client("scenes", "HudScene.ts");
    expect(src).toContain("this.model.buildPanelPressed = true;");
    expect(src).not.toContain("this.model.buildPanelOpen = !this.model.buildPanelOpen");
    expect(src).toContain("open && onPanelCard(this.panel, p.x, p.y), p.wasTouch && p.x < this.scale.width / 2);");
    expect(src).toMatch(/if \(outside === PANEL_TAP_CONSUME \|\| outside === PANEL_TAP_KEEP\) \{\s+this\.buttons\.claim\(p\.id\);/);
    expect(src).toContain("buildPanelSlots(items.length, quick, this.barPage, this.barSlots);");
    expect(src).toContain("const shown = m.undoVisible && this.barMode() !== BAR_OPEN;");
  });
});
