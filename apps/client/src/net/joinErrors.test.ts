import { describe, expect, it } from "vitest";
import { MatchMakeError } from "@colyseus/sdk";
import { JOIN_ERROR_TEXT, joinErrorText, needsRefresh } from "./joinErrors";

const mm = (message: string, code = 526) => new MatchMakeError(message, code);

describe("joinErrorText", () => {
  it("maps server refusals to player text", () => {
    expect(joinErrorText(mm("balance_mismatch"))).toBe("Please refresh");
    expect(joinErrorText(mm("run_started"))).toBe("This game has already started");
    expect(joinErrorText(mm("rate_limited"))).toBe("Too many games created, try again in a minute");
    expect(joinErrorText(mm("invalid_options"))).toBe(JOIN_ERROR_TEXT.invalid);
    expect(joinErrorText(mm("already_joined"))).toBe("You're already in this game");
  });

  it("maps Colyseus 522 errors by their message", () => {
    expect(joinErrorText(mm('room "ZZZZ" not found', 522))).toBe("Game not found");
    expect(joinErrorText(mm('room "ABCD" is locked', 522))).toBe("This game is full");
  });

  it("treats network failures and gateway errors as unreachable", () => {
    expect(joinErrorText(new TypeError("Failed to fetch"))).toBe("Can't reach the server");
    expect(joinErrorText(mm("Bad Gateway", 502))).toBe("Can't reach the server");
    expect(joinErrorText(mm("server is shutting down", 503))).toBe("Can't reach the server");
    expect(joinErrorText(undefined)).toBe("Can't reach the server");
    expect(joinErrorText("boom")).toBe("Can't reach the server");
  });

  it("has a generic text for other server errors", () => {
    expect(joinErrorText(mm("onCreate failed", 523))).toBe(JOIN_ERROR_TEXT.unknown);
  });

  it("knows which text needs the Refresh button", () => {
    expect(needsRefresh(joinErrorText(mm("balance_mismatch")))).toBe(true);
    expect(needsRefresh("Game not found")).toBe(false);
    expect(needsRefresh(undefined)).toBe(false);
  });
});
