import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 7.12 (Epic 7 brief R2: a wiring test per hookup). Each line that connects a tested loot-bag
 * model to the game is checked here, so deleting one fails a test: the mirror copy (NetSimHost), the
 * practice rule and the `?loot=` switch (LocalSimHost / GameScene), the view made and updated every
 * frame, the cue on the events, the HUD line and its icon (HudScene), the server's salt and DEV_LOOT.
 */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", ...p), "utf8");

describe("Story 7.12: the loot bag is wired in", () => {
  it("NetSimHost copies the room's lootBag record into the mirror every state, and ages loot events", () => {
    const src = read("apps", "client", "src", "sim", "NetSimHost.ts");
    expect(src).toContain("mirrorLootBag(this.world, state);");
    expect(src).toMatch(/e\.type === "loot\.dropped" \|\| e\.type === "loot\.found"\) \{[^}]*e\.ageS = /);
  });

  it("practice makes no plan unless ?loot= forces one (D2)", () => {
    const host = read("apps", "client", "src", "sim", "LocalSimHost.ts");
    expect(host).toContain("loot: { off: true }");
    expect(host).toContain("forceLootPlan(this.world, opts.devLoot[0], opts.devLoot[1])");
    expect(read("apps", "client", "src", "scenes", "GameScene.ts")).toContain("devLoot: opts.stress === null ? opts.loot : null");
  });

  it("GameScene makes the view, updates it every frame after the event view, cues the events, and shows the line", () => {
    const src = read("apps", "client", "src", "scenes", "GameScene.ts");
    const made = src.indexOf("this.lootView = new LootBagView(this, host.world);");
    expect(made).toBeGreaterThan(src.indexOf("this.eventView = new EventView(this, host.world);"));
    const evUpd = src.indexOf("this.eventView?.update(");
    const upd = src.indexOf("this.lootView?.update(host.serverTick,");
    expect(evUpd).toBeGreaterThan(0);
    expect(upd).toBeGreaterThan(evUpd);
    expect(src.slice(upd, upd + 300)).toContain("this.eventView.controlRects(), this.eventView.edgeArrowAt()");
    expect(src).toContain('e.type === "loot.found" || e.type === "loot.dropped"');
    expect(src).toMatch(/lootCue\(e, localId, this\.lootNameOf, this\.slotOfPlayer/);
    expect(src).toContain("if (cue.sound !== \"\") playSfx(cue.sound);");
    expect(src).toContain("this.hudModel.toastLoot = loot;");
    expect(src).toContain("this.lootView?.destroy();");
  });

  it("HudScene colours the loot line and draws its icon from layoutLootLine", () => {
    const src = read("apps", "client", "src", "scenes", "HudScene.ts");
    expect(src).toContain("this.drawLootIcon(m.toastLoot && m.toastText !== \"\");");
    expect(src).toContain("layoutLootLine(this.scale.width, this.insets, k, this.toastText.width, this.lootLineRect, boss, this.scale.height)");
    expect(src).toContain("SLOT_COLOR_CSS[m.toastSlot]");
  });

  it("the server salts every run and reads DEV_LOOT (dev only); the plan's salt is logged, never synced", () => {
    const room = read("apps", "server", "src", "rooms", "RunRoom.ts");
    expect(room).toContain("const lootSalt = randomUint32();");
    expect(room).toMatch(/lootSalt,\s*\n\s*lootPrevVariant: lastLootVariant,\s*\n\s*devLoot: lootPick\.plan,/);
    expect(room).toContain('this.log.info({ runSeed, lootSalt, players: players.length }, "run_started");');
    const schema = read("apps", "server", "src", "rooms", "schema", "RunState.ts");
    expect(schema).not.toMatch(/loot(Salt|Plan|Wave|KillFrac|ItemRoll)/i);
    expect(read("apps", "server", "src", "rooms", "schema", "syncState.ts")).toContain("syncLootBag(state, world);");
  });
});
