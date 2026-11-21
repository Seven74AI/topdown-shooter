import { describe, expect, it, vi } from "vitest";
import { S2C } from "@topdown/shared";
import type { RunConnection } from "./connection";
import { lobbyStore } from "./lobbyStore";

/** The parts of an SDK room `lobbyStore.attach` uses, driven by the test. */
function fakeRoom() {
  const handlers: Record<string, (payload: unknown) => void> = {};
  let leave: (code: number) => void = () => {};
  const room = {
    roomId: "ABCD",
    state: {},
    onStateChange: () => {},
    onMessage: (type: string, cb: (payload: unknown) => void) => {
      handlers[type] = cb;
    },
    onLeave: (cb: (code: number) => void) => {
      leave = cb;
    },
    leave: async () => {},
  };
  return {
    room: room as unknown as RunConnection,
    message: (type: string, payload: unknown) => handlers[type]?.(payload),
    close: (code: number) => leave(code),
  };
}

describe("lobbyStore.attach: why the room was lost (Story 2.2)", () => {
  it("reports server_restarting after the shutdown message", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.message(S2C.SERVER_SHUTDOWN_STARTED, { message: "Server restarting" });
    f.close(1006);
    expect(onLost).toHaveBeenCalledWith("server_restarting");
  });

  it("reports server_restarting on a leave with code 4001", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.close(4001);
    expect(onLost).toHaveBeenCalledWith("server_restarting");
  });

  it("reports connection_lost on any other drop", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.close(1006);
    expect(onLost).toHaveBeenCalledWith("connection_lost");
  });

  it("reports nothing after the player left on purpose", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    lobbyStore.leave();
    f.close(4000);
    expect(onLost).not.toHaveBeenCalled();
  });
});
