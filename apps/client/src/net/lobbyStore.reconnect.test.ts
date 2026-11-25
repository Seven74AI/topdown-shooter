import { afterEach, describe, expect, it, vi } from "vitest";
import { S2C, type PlayerStateView, type RecoveryJoin, type RunPhase } from "@topdown/shared";
import { lobbyStore } from "./lobbyStore";
import type { RunConnection } from "./connection";
import { fakePlayer } from "./fakeRoom";
import { linkStore } from "./linkMonitor";
import { seatStore } from "./seatStore";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

/** A fake SDK room WITH the reconnection API (drop / reconnect signals, a token). */
function linkRoom(phase: RunPhase = "wave") {
  const handlers = new Map<string, ((m: unknown) => void)[]>();
  let onLeave: ((code: number) => void) | undefined;
  const drops: (() => void)[] = [];
  const players = new Map<string, PlayerStateView>([["p0", fakePlayer(0, { name: "Ana" })]]);
  const state = { phase, hostSlot: 0, players, tick: 0 };
  const room = {
    roomId: "ABCD",
    reconnectionToken: "ABCD:tok1",
    state,
    reconnection: { enabled: true, maxRetries: 15, minDelay: 100, maxDelay: 5000, maxEnqueuedMessages: 10 },
    connection: { close: vi.fn() },
    send: vi.fn(),
    leave: vi.fn(async () => 4000),
    onMessage: (type: string, cb: (m: unknown) => void) => {
      const list = handlers.get(type) ?? [];
      list.push(cb);
      handlers.set(type, list);
      return () => {};
    },
    onStateChange: () => {},
    onLeave: (cb: (code: number) => void) => (onLeave = cb),
    onDrop: (cb: () => void) => drops.push(cb),
    onReconnect: () => {},
  };
  return {
    room: room as unknown as RunConnection,
    raw: room,
    message: (type: string, m: unknown) => (handlers.get(type) ?? []).forEach((f) => f(m)),
    leaveWith: (code: number) => onLeave?.(code),
    drop: () => drops.forEach((f) => f()),
  };
}

afterEach(() => {
  lobbyStore.leave();
  vi.unstubAllGlobals();
});

function attach(f: ReturnType<typeof linkRoom>, rejoin: () => Promise<RecoveryJoin<RunConnection>>) {
  const onLost = vi.fn();
  lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: () => {}, rejoin, onRecovered: vi.fn() });
  return { onLost };
}

describe("Story 8.1 lobbyStore reconnect wiring", () => {
  it("run.joined saves the seat (room code, SDK token, my name) in sessionStorage; the SDK's offline queue is off", () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    const f = linkRoom();
    attach(f, async () => ({ ok: false, reason: "network" }));
    f.message(S2C.RUN_JOINED, { playerId: "p0", slot: 0, tickRateHz: 20 });
    expect(seatStore.load()).toEqual({ roomId: "ABCD", token: "ABCD:tok1", name: "Ana" });
    expect(f.raw.reconnection.maxEnqueuedMessages).toBe(0);
  });

  it("mid-run, an SDK end that is not a Leave starts the takeover instead of 'connection lost'", async () => {
    const f = linkRoom();
    const rejoin = vi.fn(async (): Promise<RecoveryJoin<RunConnection>> => ({ ok: false, reason: "seat_kept" }));
    const { onLost } = attach(f, rejoin);
    f.leaveWith(4003); // FAILED_TO_RECONNECT: the SDK gave up
    await Promise.resolve();
    await Promise.resolve();
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
    expect(linkStore.get().status).toBe("seat_kept");
  });

  it("a 4021 right after adopting a LATE takeover of mine is my own crossed takeovers: take the seat again (no 'taken over')", async () => {
    const f = linkRoom();
    const rejoin = vi.fn(async (): Promise<RecoveryJoin<RunConnection>> => ({ ok: false, reason: "network" }));
    const { onLost } = attach(f, rejoin);
    linkStore.lateAdoptedAtMs = performance.now();
    f.leaveWith(4021);
    await Promise.resolve();
    expect(onLost).not.toHaveBeenCalled();
    expect(rejoin).toHaveBeenCalledTimes(1);
    linkStore.lateAdoptedAtMs = Number.NEGATIVE_INFINITY;
  });

  it("review L3: after a NORMAL recovery a 4021 is a newer tab (newest wins, D5): 'taken_over', no retake", async () => {
    const f = linkRoom();
    const rejoin = vi.fn(async (): Promise<RecoveryJoin<RunConnection>> => ({ ok: false, reason: "network" }));
    const { onLost } = attach(f, rejoin);
    linkStore.lateAdoptedAtMs = Number.NEGATIVE_INFINITY;
    f.leaveWith(4021);
    await Promise.resolve();
    expect(onLost).toHaveBeenCalledWith("taken_over");
    expect(rejoin).not.toHaveBeenCalled();
  });

  it("closed as taken over (4021): 'taken_over', and the seat stays saved (the other tab has it)", () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    const f = linkRoom();
    const { onLost } = attach(f, async () => ({ ok: false, reason: "network" }));
    f.message(S2C.RUN_JOINED, { playerId: "p0", slot: 0, tickRateHz: 20 });
    f.leaveWith(4021);
    expect(onLost).toHaveBeenCalledWith("taken_over");
  });

  it("Leave while reconnecting is a consented leave: room.leave(true), the seat forgotten, no more takeover tries", async () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    const f = linkRoom();
    const rejoin = vi.fn(async (): Promise<RecoveryJoin<RunConnection>> => ({ ok: false, reason: "network" }));
    attach(f, rejoin);
    f.message(S2C.RUN_JOINED, { playerId: "p0", slot: 0, tickRateHz: 20 });
    f.drop();
    expect(linkStore.get().status).toBe("reconnecting");
    expect(lobbyStore.leave()).toBe(true);
    expect(f.raw.leave).toHaveBeenCalledWith(true);
    expect(seatStore.load()).toBeNull();
    expect(linkStore.get().status).toBe("ok");
  });

  it("in the lobby a lost connection is still 'connection lost' (D7: no hold)", () => {
    const f = linkRoom("lobby");
    const rejoin = vi.fn();
    const { onLost } = attach(f, rejoin as never);
    f.leaveWith(1006);
    expect(onLost).toHaveBeenCalledWith("connection_lost", undefined);
    expect(rejoin).not.toHaveBeenCalled();
  });
});
