import { describe, expect, it } from "vitest";
import type { StatsRun, StatsSeat } from "./runResultsRepo";
import { formatStats, isoWeek, parseStatsArgs } from "./statsCommand";

/** Story 10.7 (AC 8; Q1 = C, Q2 = A, Q3 = A): the stats text on fixture rows. */
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
let n = 0;
const run = (endedAt: Date, waveReached: number, ending: StatsRun["ending"], over: Partial<StatsRun> = {}): StatsRun => ({ id: `r${++n}`, endedAt, ending, extracted: ending === "extracted", waveReached, playerCount: 0, ...over });
const seats = (r: StatsRun, members: (string | null)[], loadouts: string[] = []): StatsSeat[] => members.map((m, i) => ({ runId: r.id, member: m, loadout: loadouts[i] ?? "" }));

describe("Story 10.7: npm run stats", () => {
  it("an empty database: one line, no table", () => {
    expect(formatStats([], [])).toEqual(["No finished runs yet"]);
  });

  it("--since parses a real date (local midnight); anything else is the usage", () => {
    expect(parseStatsArgs([])).toEqual({ since: null });
    expect(parseStatsArgs(["--since", "2026-11-01"])).toEqual({ since: new Date(2026, 10, 1) });
    for (const bad of [["--since"], ["--since", "2026-13-01"], ["--since", "2026-02-30"], ["2026-11-01"], ["--since", "x", "y"]]) expect("error" in parseStatsArgs(bad)).toBe(true);
  });

  it("ISO weeks are Monday-based (Sunday is the previous week; 1 Jan 2027 is in 2026-W53)", () => {
    expect(isoWeek(day(2026, 11, 23))).toEqual({ key: "2026-W48", monday: "Mon 23 Nov" });
    expect(isoWeek(day(2026, 11, 29)).key).toBe("2026-W48");
    expect(isoWeek(day(2026, 11, 30)).key).toBe("2026-W49");
    expect(isoWeek(day(2027, 1, 1)).key).toBe("2026-W53");
    expect(isoWeek(day(2027, 1, 4)).key).toBe("2027-W01");
  });

  it("the four tables: weeks with abandoned apart, groups' first 3 runs (merged = same member, deleted alone), first extraction, weapons > 50 % flagged; abandoned left out of the last three", () => {
    const r1 = run(day(2026, 11, 23), 6, "wiped");
    const r2 = run(day(2026, 11, 24), 8, "lost");
    const r3 = run(day(2026, 11, 30), 10, "extracted");
    const r4 = run(day(2026, 12, 1), 12, "extracted"); // the 4th run of the same group: not printed
    const r5 = run(day(2026, 12, 1, 13), 3, "wiped"); // a group of one deleted account + b
    const r6 = run(day(2026, 12, 2), 0, "abandoned");
    const r7 = run(day(2026, 12, 3), 14, "endless"); // B-code 10.7-B10: a normal run, not extracted
    const s = [
      ...seats(r1, ["a", "b"], ["smg", "shotgun+smg"]),
      ...seats(r2, ["b", "a"], ["smg", ""]),
      ...seats(r3, ["a", "b"], ["smg", "smg"]),
      ...seats(r4, ["a", "b"]),
      ...seats(r5, [null, "b"], ["fire_axe", "smg"]),
      ...seats(r6, ["c"], ["minigun"]),
      ...seats(r7, ["d"], [""]),
    ];
    const out = formatStats([r1, r2, r3, r4, r5, r6, r7], s);
    const text = out.join("\n");
    expect(out[0]).toBe("Run stats (all finished runs)");
    expect(text).toContain("2026-W48 (Mon 23 Nov)  2 runs · 0 abandoned");
    expect(text).toContain("2026-W49 (Mon 30 Nov)  4 runs · 1 abandoned"); // the endless run counts as a run
    const groups = out.filter((l) => l.includes(" · group "));
    expect(groups).toHaveLength(3);
    expect(groups[2]).toMatch(/^ {2}1 player · group [0-9a-f]{6} · 14$/); // the endless run: no ✓
    expect(groups[0]).toMatch(/^ {2}2 players · group [0-9a-f]{6} · 6, 8, 10✓$/);
    expect(groups[1]).toMatch(/^ {2}2 players · group [0-9a-f]{6} · 3$/);
    expect(text).not.toMatch(/\b[abc]\b · /); // no member id is printed
    // a: r1, r2, r3✓ → 3 runs; b: same → 3 runs; c only abandoned (left out); the deleted seat is nobody's.
    expect(text).toContain("3 runs: 2 accounts · not yet: 1"); // d: one endless run, never extracted
    // Weapons over the 6 played runs (a run counts a weapon once): smg in r1, r2, r3, r5 (67 % ⚠), shotgun r1, fire_axe
    // r5 (17 %), none r4, r7 (33 %); minigun (abandoned) absent.
    expect(text).toContain("Weapons bought (share of 6 runs)");
    expect(out.find((l) => l.trim().startsWith("smg"))).toMatch(/67 % {2}⚠ over half$/);
    expect(out.find((l) => l.trim().startsWith("shotgun"))).toMatch(/17 %$/);
    expect(out.find((l) => l.trim().startsWith("(none)"))).toMatch(/33 % {2}no weapon bought$/);
    expect(text).not.toContain("minigun");
  });

  it("first extraction counts runs up to and including it; never extracted = not yet; exactly 50 % is not flagged", () => {
    const r1 = run(day(2026, 11, 2), 10, "extracted");
    const r2 = run(day(2026, 11, 3), 4, "wiped");
    const r3 = run(day(2026, 11, 4), 10, "extracted");
    const r4 = run(day(2026, 11, 5), 2, "wiped");
    const out = formatStats([r1, r2, r3, r4], [...seats(r1, ["a"], ["smg"]), ...seats(r2, ["b"], [""]), ...seats(r3, ["b"], ["smg"]), ...seats(r3, ["c"], [""]), ...seats(r4, ["d"], [""])], new Date(2026, 10, 1)).join("\n");
    expect(out).toContain("since");
    expect(out).toContain("1 run: 2 accounts · 2 runs: 1 · not yet: 1");
    expect(out).toMatch(/smg +50 %\n/);
    const only = formatStats([run(day(2026, 11, 2), 3, "wiped")], seats(run(day(2026, 11, 2), 3, "wiped"), [])).join("\n");
    expect(only).toContain("(none)");
  });
});
