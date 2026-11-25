import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stories 7.7 + 7.11 + 7.12 (Epic 7 brief R2: a wiring test per hookup): each line that connects a tested model to
 * the game — the milestone counters in the economy pass, the meta writes in the bank, the leaver's meta, the
 * district at Start, the progress load at join, the lobby pick message, the Results rows and the lobby sheet.
 */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", ...p), "utf8");

describe("Stories 7.7 / 7.11 / 7.12 are wired in", () => {
  it("the economy pass counts the milestone events; the wave mask is set with 7.2's waves", () => {
    expect(read("packages", "shared", "src", "economy", "economy.ts")).toContain("countMilestoneEvent(world, e);");
    expect(read("packages", "shared", "src", "meta", "runRecord.ts")).toContain("p.waveMask = (p.waveMask | bit) >>> 0;");
  });

  it("the bank passes the meta writes into the transaction; the room passes a leaver's meta and the run's district", () => {
    const bank = read("apps", "server", "src", "meta", "banking.ts");
    expect(bank).toContain("repo.addSupplies(this.runId, accountId, pay, writes, this.deps.resumed === true || this.topUps.has(seatKeyOf(seat)))"); // Story 8.2: + the top-up flag (E8-J6), by seat (review H1); Story 8.6: every bank of a resumed run
    expect(bank).toContain("meta: { player: metaPlayer(p), facts }");
    const room = read("apps", "server", "src", "rooms", "RunRoom.ts");
    expect(room).toContain("meta: this.bank.seatMetaNow(world, p)");
    expect(room).toContain("district: this.state.district");
    expect(room).toContain("void this.loadMemberProgress(member, auth.rawLook);");
    expect(room).toContain("this.onMessage(C2S.LOBBY_DISTRICT, this.net.guard(lobbyDistrictSchema");
    expect(room).toMatch(/this\.memberProgress\.delete\(playerId\);[^\n]*\n\s*if \(this\.state\.phase === "lobby"\) this\.recomputeDistricts\(\);/); // review M3: on every final leave
    expect(room).toContain("void this.reloadProgress(members);"); // review M3: after lobby.return
    expect(room).toContain("const map = DISTRICT_MAPS[this.state.district] ?? DOWNTOWN_MAP;");
    expect(read("apps", "server", "src", "db", "progressRepo.ts")).toContain("const grant = meta && statsAfter ? meta.grant(statsAfter, owned, districtsBefore) : null;");
  });

  it("the client: Results rows from the message, the lobby's district line + sheet + notice", () => {
    const results = read("apps", "client", "src", "ui", "ResultsScreen.tsx");
    expect(results).toContain('data-testid="rewards-items"');
    expect(results).toContain('data-testid="rewards-unlocks"');
    expect(results).toContain("rewardsView(rewards, screen.online, screen.seed, undefined, (slot, seatId) => resultName(screen.rows, slot, seatId))"); // PR #9 review L1: by seat
    const lobby = read("apps", "client", "src", "ui", "LobbyScreen.tsx");
    expect(lobby).toContain("districtCards(lobby.district, lobby.districtsOpen, view.isHost)");
    expect(lobby).toContain("lobbyStore.pickDistrict(d.id);");
    expect(lobby).toContain("setNotice(districtResetText(lobby.districtReset))");
    expect(read("apps", "client", "src", "net", "connection.ts")).toContain('$.listen("district", onChange)');
  });
});
