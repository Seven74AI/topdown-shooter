import { describe, expect, it } from "vitest";
import { MatchMakeError } from "@colyseus/sdk";
import { recoveryFailure } from "./connection";

/** Stories 8.1 + 8.2/8.3: what a takeover join's refusal means for the seat. */
const mm = (message: string, code = 526) => new MatchMakeError(message, code);

describe("recoveryFailure (Stories 8.1, 8.2, 8.3)", () => {
  it("run_full and removed are gone (retrying never helps)", () => {
    expect(recoveryFailure(mm("run_full"))).toBe("gone");
    expect(recoveryFailure(mm("removed"))).toBe("gone");
  });

  it("keeps 8.1's answers", () => {
    expect(recoveryFailure(mm("seat_kept"))).toBe("seat_kept");
    expect(recoveryFailure(mm("run_started"))).toBe("gone");
    expect(recoveryFailure(mm("rate_limited"))).toBe("network");
    expect(recoveryFailure(new TypeError("Failed to fetch"))).toBe("network");
  });
});
