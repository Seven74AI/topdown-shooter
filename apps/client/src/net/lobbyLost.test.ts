import { describe, expect, it, vi } from "vitest";
import { S2C } from "@topdown/shared";
import type { RunConnection } from "./connection";
import { lobbyStore } from "./lobbyStore";

/** The parts of an SDK room `lobbyStore.attach` uses, driven by the test. */
function fakeRoom() {
  const handlers: Record<string, (payload: unknown) => void> = {};
  let leave: (code: number) => void = () => {};
  const sent: [string, unknown][] = [];
  const room = {
    send: (type: string, msg: unknown) => sent.push([type, msg]),
    roomId: "ABCD",
    state: {},
    onStateChange: () => {},
    onMessage: (type: string, cb: (payload: unknown) => void) => {
      handlers[type] = cb;
      return () => delete handlers[type]; // the SDK returns an unsubscribe
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
    sent,
  };
}

describe("lobbyStore.attach: why the room was lost (Story 2.2)", () => {
  it("reports server_restarting after the shutdown message", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.message(S2C.SERVER_SHUTDOWN_STARTED, { message: "Server restarting" });
    f.close(1006);
    expect(onLost).toHaveBeenCalledWith("server_restarting", "Server restarting");
  });

  it("passes the server's own text for a room error shutdown", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.message(S2C.SERVER_SHUTDOWN_STARTED, { message: "The game hit an error, sorry" });
    f.close(4001);
    expect(onLost).toHaveBeenCalledWith("server_restarting", "The game hit an error, sorry");
  });

  it("reports server_restarting on a leave with code 4001", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.close(4001);
    expect(onLost).toHaveBeenCalledWith("server_restarting", undefined);
  });

  it("reports connection_lost on any other drop", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.close(1006);
    expect(onLost).toHaveBeenCalledWith("connection_lost", undefined);
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

describe("lobbyStore.attach: removed by the host (Story 8.3 AC 12)", () => {
  it("a 4022 close is `removed`, never a reconnect or connection_lost", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.close(4022);
    expect(onLost).toHaveBeenCalledExactlyOnceWith("removed");
    expect(lobbyStore.current()).toBeNull();
  });

  it("player.removed first: whatever close code follows, it is `removed`", () => {
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    f.message(S2C.PLAYER_REMOVED, {});
    f.close(1006);
    expect(onLost).toHaveBeenCalledExactlyOnceWith("removed");
  });
});

describe("lobbyStore.attach: the host saved and quit (Story 8.5 AC 9)", () => {
  it("a 4023 close is `saved` (terminal: never a reconnect); run.saved first → `saved` whatever code follows", async () => {
    const { saveQuitStore } = await import("./lobbyStore");
    for (const [first, code] of [[false, 4023], [true, 1006]] as const) {
      const f = fakeRoom();
      const onLost = vi.fn();
      lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
      if (first) f.message(S2C.RUN_SAVED, { expiresAt: "2026-12-02T00:00:00.000Z" });
      f.close(code);
      expect(onLost).toHaveBeenCalledExactlyOnceWith("saved");
      expect(lobbyStore.current()).toBeNull();
      expect(saveQuitStore.get()).toBe("idle");
    }
  });

  it("Save and quit sends one request; run.save_failed → failed, the room stays (S8)", async () => {
    const { saveQuitStore } = await import("./lobbyStore");
    const f = fakeRoom();
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {} });
    lobbyStore.saveQuit();
    lobbyStore.saveQuit(); // "Saving…" ignores taps
    expect(f.sent.filter((m) => m[0] === "run.save_quit")).toHaveLength(1);
    expect(saveQuitStore.get()).toBe("saving");
    f.message(S2C.RUN_SAVE_FAILED, {});
    expect(saveQuitStore.get()).toBe("failed");
    expect(onLost).not.toHaveBeenCalled();
    lobbyStore.saveQuit(); // try again
    expect(f.sent.filter((m) => m[0] === "run.save_quit")).toHaveLength(2);
    lobbyStore.leave();
  });
});

describe("Story 8.5 review M4: Save and quit never strands the host on Saving…", () => {
  it("no answer within SAVE_QUIT_TIMEOUT_MS → failed (the host can try again)", async () => {
    vi.useFakeTimers();
    try {
      const { saveQuitStore, SAVE_QUIT_TIMEOUT_MS } = await import("./lobbyStore");
      const f = fakeRoom();
      lobbyStore.attach(f.room, { watch: () => () => {}, onLost: vi.fn(), onPhase: () => {} });
      lobbyStore.saveQuit();
      expect(saveQuitStore.get()).toBe("saving");
      vi.advanceTimersByTime(SAVE_QUIT_TIMEOUT_MS - 1);
      expect(saveQuitStore.get()).toBe("saving");
      vi.advanceTimersByTime(2);
      expect(saveQuitStore.get()).toBe("failed");
      lobbyStore.leave();
    } finally {
      vi.useRealTimers();
    }
  });
});

