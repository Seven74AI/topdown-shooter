import { describe, expect, it } from "vitest";
import { TICK_DT_S } from "../config/constants";
import { loadBalance } from "../config/balance";
import { step } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { DOWNTOWN_MAP } from "../map/downtown";
import { castVote } from "../run/runStateMachine";
import { captureRunSave, type RunSave } from "./runSave";
import { restoreRunSave, resumeSavedRun } from "./restore";
import { playToBuild } from "./saveFixtures";

/** Story 12.2 (AC 18, X7): `extract` is never saved; a save taken in the vote (8.4–8.6 S12) still extracts on resume. */
const balance = loadBalance();
const meta = { runId: "11111111-1111-4111-8111-111111111111", district: "downtown", bannedSeats: [] };
const json = (s: RunSave): RunSave => JSON.parse(JSON.stringify(s)) as RunSave;

describe("Story 12.2: a vote save resumes into the extraction", () => {
  it("wave 10 → vote → save → restore → resume → Extract: everyone boards, lifts off, Results 'extracted'", () => {
    const { world, seats } = playToBuild({ players: 3, waves: 10, buildings: 9 });
    expect(world.run.phase).toBe("vote");
    expect(world.waves.number).toBe(10);
    const save = json(captureRunSave(world, seats, meta));
    expect(save.phase).toBe("vote");
    expect(JSON.stringify(save)).not.toContain("liftedAtTick"); // the extract state is not in the save
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
    resumeSavedRun(r.world);
    const w = r.world;
    expect(w.run.phase).toBe("vote");
    expect(w.extract.started).toBe(false);
    expect(w.extract.landTicksLeft).toBe(0); // resumed: the helicopter is already on the pad
    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));
    for (const id of w.players.keys()) castVote(w, id, "extract");
    for (let t = 0; t < 1200 && w.run.phase !== "results"; t++) step(w, TICK_DT_S);
    expect(w.run.phase).toBe("results");
    expect(w.run.ending).toBe("extracted");
    expect(events.filter((e) => e.type === "player.boarded").map((e) => (e as { playerId: string }).playerId).sort()).toEqual(["p0", "p1", "p2"]);
    expect(events.filter((e) => e.type === "run.lifted")).toHaveLength(1);
    expect(events.filter((e) => e.type === "run.extract_done")).toHaveLength(1);
  });

  it("an extract-phase World refuses a capture (phase_extract)", () => {
    const { world, seats } = playToBuild({ players: 1, waves: 10, buildings: 2 });
    for (const id of world.players.keys()) castVote(world, id, "extract");
    for (let t = 0; t < 100 && world.run.phase === "vote"; t++) step(world, TICK_DT_S);
    expect(world.run.phase).toBe("extract");
    expect(() => captureRunSave(world, seats, meta)).toThrow(/phase_extract/);
  });
});
