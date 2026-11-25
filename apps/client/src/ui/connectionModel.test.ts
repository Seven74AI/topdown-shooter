import { describe, expect, it } from "vitest";
import type { PlayerStateView, RunStateView } from "@topdown/shared";
import { CONNECTION_TEXT, clock, connectionView, returnedIds } from "./connectionModel";

const player = (slot: number, name: string, heldUntilTick = 0) => ({ slot, name, heldUntilTick }) as unknown as PlayerStateView;
const state = (over: Partial<RunStateView>, players: [string, PlayerStateView][]) =>
  ({ phase: "wave", tick: 1000, frozen: false, resumeIn: 0, players: new Map(players), ...over }) as unknown as RunStateView;
const OK = { status: "ok" as const, sinceMs: 0 };

describe("Story 8.1 connection overlay model (AC 1, 4, 9, 10; brief 24)", () => {
  it("a held teammate is a grey chip 'Bo · reconnecting 1:43' counting down from the server's heldUntilTick", () => {
    const s = state({}, [["p0", player(0, "Ana")], ["p1", player(1, "Bo", 1000 + 103 * 20)]]);
    expect(connectionView(OK, s, "p0", 0).chips).toEqual([{ slot: 1, name: "Bo", text: "Bo · reconnecting 1:43" }]);
    expect(connectionView(OK, s, "p1", 0).chips).toEqual([]); // never my own chip
  });

  it("reconnecting: the panel with a 2-minute countdown from the drop; 'Paused: nobody connected' with the 3-2-1", () => {
    const v = connectionView({ status: "reconnecting", sinceMs: 1000 }, null, "p0", 1000 + 17_000);
    expect(v.screen).toBe("reconnecting");
    expect(v.line).toBe(`${CONNECTION_TEXT.reconnecting} 1:43`);
    const paused = connectionView(OK, state({ frozen: true, resumeIn: 2 }, []), "p0", 0);
    expect(paused).toMatchObject({ screen: "paused", line: "Paused: nobody connected", resumeIn: 2 });
    expect(connectionView({ status: "seat_kept", sinceMs: 0 }, null, "p0", 0)).toMatchObject({ screen: "seat_kept", line: "Your seat is kept. You'll rejoin at the next build phase" });
    expect(connectionView(OK, state({ phase: "lobby", frozen: true }, []), "p0", 0).screen).toBe("none");
  });

  it("clock is m:ss and never negative", () => {
    expect(clock(120)).toBe("2:00");
    expect(clock(0.2)).toBe("0:01");
    expect(clock(-5)).toBe("0:00");
  });

  it("returnedIds: who was held and is back ('Bo is back')", () => {
    const s = state({}, [["p1", player(1, "Bo")], ["p2", player(2, "Cy", 5000)]]);
    expect(returnedIds(new Set(["p1", "p2", "p3"]), s)).toEqual(["p1"]);
  });
});
