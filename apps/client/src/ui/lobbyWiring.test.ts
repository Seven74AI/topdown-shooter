/**
 * Story 7.9 T6 (retro R2): the lobby card's survivor comes from the player's look, and the screen is placed by
 * `lobbyLayout` (the R9 test's numbers are what the screen draws). Source checks: deleting a hookup fails here.
 */
import { describe, expect, it } from "vitest";
import screen from "./LobbyScreen.tsx?raw";
import connection from "../net/connection.ts?raw";
import { fakePlayer } from "../net/fakeRoom";
import { snapshotLobby } from "../net/lobbyStore";

describe("lobby look wiring (Story 7.9 T6)", () => {
  it("each filled card draws survivorPortraitUrl(p.look) inside the slot ring", () => {
    expect(screen).toMatch(/const url = survivorPortraitUrl\(p\.look\);/);
    expect(screen).toMatch(/<img class="lobby-card__survivor" src=\{url\}/);
    expect(screen).toMatch(/borderColor: SLOT_COLOR_CSS\[slot\]/);
  });
  it("the screen is placed from lobbyLayout(viewport, safe-area insets)", () => {
    expect(screen).toMatch(/const L = lobbyLayout\(vp\.w, vp\.h, vp\.inset\);/);
    for (const part of ["L.code", "L.district", "L.leave", "L.copy", "L.share", "L.ready", "L.start", "c.card", "c.picture", "c.bar", "c.name"]) expect(screen).toContain(part);
  });
  it("'You' is the white tag + keyline class, never the accent", () => {
    expect(screen).toMatch(/lobby-card--you/);
    expect(screen).toMatch(/lobby__tag lobby__tag--you/);
  });
  it("the lobby rows carry each player's look, and a look change redraws the lobby", () => {
    const s = snapshotLobby("ABCD", { phase: "lobby", hostSlot: 0, players: new Map([["p0", fakePlayer(0, { look: "v1|top:hoodie" })]]) } as never, "p0");
    expect(s.players[0]?.look).toBe("v1|top:hoodie");
    expect(connection).toMatch(/\$\.listen\(player, "look", onChange\)/);
  });
});
