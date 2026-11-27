import { createWorld, loadBalance, type World } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import { loadoutKey, resultRow, seatRow } from "./runResult";

/** Story 10.7 (AC 2, Q1 = C, Q4 = B): the run stats numbers, pure. */
describe("Story 10.7: loadoutKey / seatRow / resultRow", () => {
  it("loadoutKey: bought weapons sorted, each once, '+'-joined; none bought = ''", () => {
    expect(loadoutKey(["smg", "fire_axe", "smg"])).toBe("fire_axe+smg");
    expect(loadoutKey([])).toBe("");
    expect(loadoutKey(undefined)).toBe("");
  });

  it("seatRow: main + endless waves, own kills, the bought weapons; a copy (later changes don't move it)", () => {
    const p = { wavesIn: 10, endlessWavesIn: 3, kills: 55, weaponsBought: ["shotgun"] };
    const r = seatRow(p, "p1#2", 1, "acc");
    p.kills = 99;
    p.weaponsBought.push("smg");
    expect(r).toEqual({ seat: "p1#2", accountId: "acc", slot: 1, loadout: "shotgun", wavesIn: 13, kills: 55 });
  });

  it("resultRow: the World's ending (none → lost); a team that left → lost, unless extracted (review M2); an endless wipe → endless (L6)", () => {
    const w = createWorld({ seed: 1, balance: loadBalance() }) as World;
    const run = { id: "r", district: "downtown", seed: 1, nightMs: 5000 };
    w.run.ending = "extracted";
    expect(resultRow(w, run, 10, false)).toEqual({ id: "r", district: "downtown", seed: 1, waveReached: 10, ending: "extracted", endless: false, nightMs: 5000 });
    w.run.ending = "wiped";
    expect(resultRow(w, run, 4, false).ending).toBe("wiped");
    expect(resultRow(w, run, 4, true).ending).toBe("lost");
    w.run.ending = "extracted";
    expect(resultRow(w, run, 10, true).ending).toBe("extracted"); // everyone left during the fly-out: still extracted
    w.run.ending = "lost"; // the World's endless wipe
    w.run.endless = true;
    expect(resultRow(w, { ...run, nightMs: -3 }, 13, false)).toMatchObject({ ending: "endless", endless: true, waveReached: 13, nightMs: 0 });
    expect(resultRow(w, run, 13, true).ending).toBe("lost"); // the team left in endless
    w.run.ending = "extracted";
    expect(resultRow(w, run, 15, false).ending).toBe("extracted"); // Stay, then Extract at 15
  });
});
