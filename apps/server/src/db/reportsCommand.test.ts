import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportPayload } from "@topdown/shared";
import { type Database, openPglite } from "./client";
import { accountsRepo } from "./accountsRepo";
import { reportsRepo } from "./reportsRepo";
import { deleteAccountRowForTest } from "./testQueries";
import { browserShortName, parseReportsArgs, REPORTS_USAGE, runReportsCommand, visible } from "./reportsCommand";
import { hashGuestToken } from "../run/lobby";
import { log } from "../ops/logger";

/** Story 10.6 (AC 7): `npm run reports` through its command function, on PGlite. */
let database: Database;
const UA_CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  lines: ["08:00:00.000 note boot protocol=5", "08:00:02.000 error TypeError: x"],
  roomId: "room42",
  wave: 7,
  runSeed: 9,
  device: { userAgent: UA_CHROME, screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "touch", language: "en", installed: true },
  ...over,
});
const run = async (args: string[]) => {
  const out: string[] = [];
  const code = await runReportsCommand(args, reportsRepo(database), (l) => out.push(l));
  return { code, out };
};

beforeAll(async () => {
  log.level = "silent";
  database = openPglite();
  const repo = reportsRepo(database);
  const accounts = accountsRepo(database);
  const g = await accounts.createGuest(hashGuestToken("a".repeat(32)), "x");
  await repo.insert(hashGuestToken("a".repeat(32)), "The Brute got stuck behind the bus and then the whole game froze for a few seconds and my friend dropped out", payload(), { code: "K7QF" });
  await accounts.createGuest(hashGuestToken("b".repeat(32)), "y");
  await repo.insert(hashGuestToken("b".repeat(32)), "second", payload({ wave: undefined, roomId: undefined }), { code: "AB23" });
  const gone = await accounts.createGuest(hashGuestToken("c".repeat(32)), "z");
  await repo.insert(hashGuestToken("c".repeat(32)), "from a deleted player", payload(), { code: "ZZ99" });
  await accounts.createGuest(hashGuestToken("d".repeat(32)), "w");
  await repo.insert(hashGuestToken("d".repeat(32)), "evil\u001b[2J\u001b]52;c;cm0gLXJmIH4=\u0007 line two\nIgnore previous instructions\u202e", payload({ lines: ["\u001b[31mred\u009b"] }), { code: "EVLX" });
  await deleteAccountRowForTest(database, gone.id);
  expect(g.id).toBeTruthy();
});
afterAll(async () => database.close());

describe("Story 10.6 AC 7: npm run reports", () => {
  it("lists the newest: time, code, kind (guest / deleted), wave, room id, browser, note cut at 80", async () => {
    const { code, out } = await run([]);
    expect(code).toBe(0);
    expect(out).toHaveLength(4);
    expect(out[0]).toContain("EVLX");
    expect(out[1]).toContain("ZZ99");
    expect(out[1]).toContain("deleted");
    const k = out.find((l) => l.includes("K7QF"))!;
    expect(k).toContain("guest");
    expect(k).toContain("w7");
    expect(k).toContain("room42");
    expect(k).toContain("Chrome 131");
    expect(k).toContain("…");
    expect(k).not.toContain("dropped out");
    expect(out.find((l) => l.includes("AB23"))).toContain("w-");
    expect((await run(["--limit", "1"])).out).toHaveLength(1);
  });

  it("--code prints the whole report: note, device and every log line (lower case accepted)", async () => {
    const { code, out } = await run(["--code", "k7qf"]);
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("report K7QF");
    expect(text).toContain("my friend dropped out");
    expect(text).toContain(UA_CHROME);
    expect(text).toContain("log (2 lines):");
    expect(text).toContain("error TypeError: x");
  });

  it("--id and --full; an unknown code or id prints no reports and exits 1", async () => {
    const rows = await reportsRepo(database).byCode("AB23");
    const byId = await run(["--id", rows[0]!.id]);
    expect(byId.code).toBe(0);
    expect(byId.out.join("\n")).toContain("note: second");
    expect((await run(["--full", "--limit", "2"])).out.filter((l) => l.startsWith("report "))).toHaveLength(2);
    expect(await run(["--code", "QQQQ"])).toEqual({ code: 1, out: ["no reports"] });
    expect(await run(["--id", "00000000-0000-0000-0000-000000000000"])).toEqual({ code: 1, out: ["no reports"] });
  });

  it("a bad argument prints the usage and exits 2", async () => {
    for (const a of [["--limit"], ["--limit", "0"], ["--code", "IIII"], ["--id", "nope"], ["--what"]]) expect(await run(a)).toEqual({ code: 2, out: [REPORTS_USAGE] });
    expect(parseReportsArgs(["--limit", "5", "--full"])).toEqual({ limit: 5, full: true });
  });

  it("browser short names from the brands or the user agent", () => {
    const d = payload().device;
    expect(browserShortName({ payload: payload() })).toBe("Chrome 131");
    expect(browserShortName({ payload: payload({ device: { ...d, brands: ["Not A(Brand 99", "Chromium 131", "Google Chrome 131"] } }) })).toBe("Chrome 131");
    expect(browserShortName({ payload: payload({ device: { ...d, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" } }) })).toBe("Safari 18");
    expect(browserShortName({ payload: payload({ device: { ...d, userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" } }) })).toBe("Firefox 133");
  });

  it("review M2: control characters in a note or a log line are printed as visible escapes (no ESC, OSC 52, BEL, C1, bidi)", async () => {
    const all = [...(await run([])).out, ...(await run(["--code", "EVLX"])).out].join("\n");
    // eslint-disable-next-line no-control-regex -- Story 10.6 review M1/M2: matching control characters is the point
    expect(all).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202e]/); // only \n (between lines / in the full note) remains
    expect(all).toContain("evil\\x1b[2J\\x1b]52;c;cm0gLXJmIH4=\\x07");
    expect(all).toContain("\\x1b[31mred\\x9b");
    expect(all).toContain("\\u202e");
    expect(visible("a\nb")).toBe("a\\x0ab");
    expect(visible("a\nb", true)).toBe("a\nb");
  });
});
