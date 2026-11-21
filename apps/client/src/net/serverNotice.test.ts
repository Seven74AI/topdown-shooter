import { describe, expect, it, vi } from "vitest";
import { CloseCode } from "@colyseus/sdk";
import { SERVER_SHUTDOWN_CLOSE_CODE, lostReason, serverNotice } from "./serverNotice";

describe("lostReason", () => {
  it("is server_restarting on close code 4001", () => {
    expect(SERVER_SHUTDOWN_CLOSE_CODE).toBe(CloseCode.SERVER_SHUTDOWN);
    expect(lostReason(4001, false)).toBe("server_restarting");
  });

  it("is server_restarting after the shutdown message, whatever the close code", () => {
    expect(lostReason(1006, true)).toBe("server_restarting");
    expect(lostReason(undefined, true)).toBe("server_restarting");
  });

  it("is connection_lost otherwise", () => {
    expect(lostReason(1006, false)).toBe("connection_lost");
    expect(lostReason(4002, false)).toBe("connection_lost");
    expect(lostReason(undefined, false)).toBe("connection_lost");
  });
});

describe("serverNotice", () => {
  it("shows and dismisses a notice and tells subscribers", () => {
    const seen = vi.fn();
    const off = serverNotice.subscribe(seen);
    serverNotice.show("Server restarting. Try again in a moment.");
    expect(serverNotice.get()).toBe("Server restarting. Try again in a moment.");
    serverNotice.dismiss();
    expect(serverNotice.get()).toBeNull();
    off();
    serverNotice.show("x");
    expect(seen.mock.calls).toEqual([["Server restarting. Try again in a moment."], [null]]);
    serverNotice.dismiss();
  });
});
