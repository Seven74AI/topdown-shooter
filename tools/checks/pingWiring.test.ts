import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 8.7 (brief R2: a wiring test per hookup): each line that connects a tested ping model to the game. Deleting
 * any of them fails here (the models themselves are unit-tested: pingModel, pingWheel, pingArrows, pingFrame).
 */
const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), "utf8");

describe("Story 8.7: pings are wired end to end", () => {
  it("server: ping.send through the guard's own 'ping' bucket, drops counted, pingDropped in net_stats", () => {
    const src = read("apps", "server", "src", "rooms", "RunRoom.ts");
    expect(src).toMatch(/this\.onMessage\(C2S\.PING_SEND, this\.net\.guard\(pingSendSchema, \(c, m\) => this\.onPing\(c, m\), "ping", \(c\) => this\.countPingDrop\(c\)\)\)/);
    expect(src).toMatch(/this\.broadcast\(S2C\.PING_SHOWN, g\)/);
    expect(src).toMatch(/pingDropped: this\.pingDropped\.get\(member\.playerId\) \?\? 0/);
  });

  it("client net: the inbox listens to ping.shown from the join; NetSimHost sends ping.send", () => {
    const session = read("apps", "client", "src", "net", "session.ts");
    expect(session).toMatch(/room\.onMessage\(S2C\.PING_SHOWN, \(m: unknown\) => this\.receivePingShown\(m\)\)/);
    expect(session).toMatch(/this\.pings\.receive\(m, performance\.now\(\)\)/);
    expect(session).toMatch(/this\.pings\.clearSlot\(playerSlotOf\(left\.playerId\)\)/);
    expect(session).toMatch(/this\.pings\.clearAll\(\)/);
    expect(read("apps", "client", "src", "sim", "NetSimHost.ts")).toMatch(/this\.session\.room\.send\(C2S\.PING_SEND, this\.pingMsg\)/);
  });

  it("GameScene: the frame step before the build keys, the view (online), the chirp", () => {
    const src = read("apps", "client", "src", "scenes", "GameScene.ts");
    const frame = src.indexOf("pingFrame(this.hudModel, router.kbm, host,");
    const build = src.indexOf("this.buildKeys(host, router, menuOpen || shopOpen);");
    expect(frame).toBeGreaterThan(0);
    expect(frame, "the ping step takes 1–4 before the build keys").toBeLessThan(build);
    expect(src).toMatch(/this\.pingView = host\.pings \? new PingView\(this\) : null;/);
    expect(src).toMatch(/this\.updatePings\(host\.pings, ev\.x, ev\.y, ev\.width\)/);
    expect(src).toMatch(/playSfx\(p\.kind === 0 \? "ping_double" : "ping", pingPan\(sx, sw\), PING_SFX_VOLUME\)/);
    expect(src).toMatch(/if \(menuKey && this\.hudModel\.ping\.open\) \{/); // Esc closes the wheel before the menu
    // review M2 / M3 / L6 / L7 / B16: the mode keep-offs (with the lite set) reach the view; the arrow mask reaches the HUD
    expect(src).toMatch(/fillPingKeepOffs\(ev\?\.controlRects\(\) \?\? \[\], mode, sw, sh, this\.eventInsets, k, this\.pingKeepOffs, this\.pingKeepOffsLite\)/);
    expect(src).toMatch(/this\.pingView\?\.update\(pings, now, vx, vy, vw, sw, sh, k, this\.eventInsets, keepOffs, rect, this\.pingKeepOffsLite\)/);
    expect(src).toMatch(/m\.pingArrowSlots = this\.pingView\?\.arrowMask\(\) \?\? 0;/);
    expect(src).toMatch(/mode\.flag = flag \?/);
    expect(src).toMatch(/mode\.loot = badge \?/);
    expect(src).toMatch(/mode\.wheel = m\.pingButton && m\.ping\.open;/);
    expect(src).toMatch(/mode\.wheelColumn = m\.pingWheelColumn;/); // the layout the HUD shows (frozen while open)
  });

  it("HudScene: the button + wheel are made, laid out, drawn; a tap off the wheel closes it; the open wheel hides swap and the build bar (quick-use stays)", () => {
    const src = read("apps", "client", "src", "scenes", "HudScene.ts");
    expect(src).toMatch(/this\.pingHud = new PingHud\(this, this\.buttons, this\.model\)/);
    expect(src).toMatch(/this\.pingHud\.layout\(this\.scale\.width, this\.insets, k\)/);
    expect(src).toMatch(/this\.pingHud\.draw\(this\.time\.now, this\.model\.pingSlot\)/);
    expect(src).toMatch(/this\.pingHud\.pointerDown\(this\.buttons\.hit\(p\.x, p\.y, this\.scale\.width\)\)/);
    expect(src.match(/!this\.pingHud\.wheelOpen/g)?.length).toBe(2); // swap + build bar (B5 amended: quick-use stays)
    expect(src).toMatch(/fitWaveText\(this\.scale\.width, this\.insets, dpr\(\), fullW, compactW, this\.waveFit\)/);
    expect(src).toMatch(/if \(\(m\.pingArrowSlots & \(1 << slot\)\) !== 0\) \{\s*if \(arrow\.visible\) arrow\.setVisible\(false\);/); // review M2
  });

  it("re-review nit: the chip layout changes only while the wheel is shut, and the model carries it", () => {
    const src = read("apps", "client", "src", "scenes", "PingHud.ts");
    expect(src).toMatch(/if \(column !== this\.column && !m\.ping\.open\) \{/);
    expect(src).toMatch(/m\.pingWheelColumn = this\.column;/);
  });

  it("the view puts every ping object above the darkness", () => {
    const src = read("apps", "client", "src", "render", "PingView.ts");
    expect(src).toMatch(/aboveDarkness\(scene\.add\.image\(0, 0, ATLAS_PING, frame\)\.setVisible\(false\), "ping"\)/);
    expect(src.match(/scene\.add\./g)?.length, "every object goes through img()").toBe(1);
  });
});
