import { describe, expect, it, vi } from "vitest";
import { C2S, S2C, type PlayerStateView, type RunPhase, type RunStateView } from "@topdown/shared";
import { START_HINT, lobbyStore, lobbyView, snapshotLobby, type LobbySnapshot } from "./lobbyStore";
import type { RunConnection } from "./connection";
import { FakeRoom, fakePlayer } from "./fakeRoom";

const player = (slot: number, name: string, ready = false): PlayerStateView => fakePlayer(slot, { name, ready });

function snap(over: Partial<LobbySnapshot> = {}): LobbySnapshot {
  return {
    code: "ABCD",
    phase: "lobby",
    hostSlot: 0,
    localPlayerId: "p0",
    players: [
      { playerId: "p0", slot: 0, name: "Ana", ready: true },
      { playerId: "p2", slot: 2, name: "Cid", ready: true },
    ],
    ...over,
  };
}

describe("snapshotLobby", () => {
  it("copies players in slot order as plain data", () => {
    const players = new Map<string, PlayerStateView>([
      ["p2", player(2, "Cid", true)],
      ["p0", player(0, "Ana")],
    ]);
    const state: RunStateView = { phase: "lobby", hostSlot: 0, players, tick: 0, wave: 0, remaining: 0, aliveCount: 0 };
    const s = snapshotLobby("ABCD", state, "p2");
    expect(s).toEqual({
      code: "ABCD",
      phase: "lobby",
      hostSlot: 0,
      localPlayerId: "p2",
      players: [
        { playerId: "p0", slot: 0, name: "Ana", ready: false },
        { playerId: "p2", slot: 2, name: "Cid", ready: true },
      ],
    });
    expect(s.players[0]).not.toBe(players.get("p0"));
  });
});

describe("lobbyView", () => {
  it("lays out 4 rows by slot and finds me and the host", () => {
    const v = lobbyView(snap(), false);
    expect(v.rows.map((r) => r?.name ?? null)).toEqual(["Ana", null, "Cid", null]);
    expect(v.me?.playerId).toBe("p0");
    expect(v.isHost).toBe(true);
    expect(v.canStart).toBe(true);
    expect(v.startHint).toBeNull();
  });

  it("explains a disabled Start to the host", () => {
    const notReady = snap({ players: [{ playerId: "p0", slot: 0, name: "Ana", ready: true }, { playerId: "p1", slot: 1, name: "Bo", ready: false }] });
    expect(lobbyView(notReady, false)).toMatchObject({ canStart: false, startHint: START_HINT.notReady });
    const alone = snap({ players: [{ playerId: "p0", slot: 0, name: "Ana", ready: true }] });
    expect(lobbyView(alone, false)).toMatchObject({ canStart: false, startHint: START_HINT.tooFew });
    expect(lobbyView(alone, true)).toMatchObject({ canStart: true, startHint: null });
  });

  it("never lets a guest start, and shows no hint", () => {
    const v = lobbyView(snap({ localPlayerId: "p2" }), true);
    expect(v.isHost).toBe(false);
    expect(v.canStart).toBe(false);
    expect(v.startHint).toBeNull();
  });

  it("has no local player until run.joined arrives", () => {
    const v = lobbyView(snap({ localPlayerId: null }), true);
    expect(v.me).toBeNull();
    expect(v.isHost).toBe(false);
  });
});

/** A fake SDK room: just what lobbyStore uses. */
function fakeRoom() {
  const handlers = new Map<string, (m: unknown) => void>();
  let onLeave: (() => void) | undefined;
  const players = new Map<string, PlayerStateView>([["p0", player(0, "Ana")]]);
  const state = { phase: "lobby" as RunPhase, hostSlot: 0, players };
  const room = {
    roomId: "ABCD",
    state,
    send: vi.fn(),
    leave: vi.fn(async () => 1000),
    onMessage: (type: string, cb: (m: unknown) => void) => {
      handlers.set(type, cb);
      return () => handlers.delete(type); // the SDK returns an unsubscribe
    },
    onLeave: (cb: () => void) => (onLeave = cb),
  };
  return {
    room: room as unknown as RunConnection,
    raw: room,
    state,
    message: (type: string, m: unknown) => handlers.get(type)?.(m),
    drop: () => onLeave?.(),
  };
}

const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe("lobbyStore", () => {
  it("snapshots on changes, learns the local player from run.joined and reports phase changes", async () => {
    const f = fakeRoom();
    let changed: () => void = () => {};
    const unwatch = vi.fn();
    const onPhase = vi.fn();
    const seen: LobbySnapshot[] = [];
    const off = lobbyStore.subscribe((s) => seen.push(s));
    lobbyStore.attach(f.room, {
      watch: (_room, onChange) => {
        changed = onChange;
        return unwatch;
      },
      onLost: vi.fn(),
      onPhase,
    });
    await tick();
    expect(lobbyStore.get().players).toHaveLength(1);
    expect(lobbyStore.get().localPlayerId).toBeNull();

    f.message(S2C.RUN_JOINED, { playerId: "p0", slot: 0, tickRateHz: 20 });
    await tick();
    expect(lobbyStore.get().localPlayerId).toBe("p0");
    expect(lobbyStore.joinedInfo()).toEqual({ playerId: "p0", slot: 0, tickRateHz: 20 });

    // Several callbacks in one patch give one snapshot.
    const before = seen.length;
    f.state.players.set("p1", player(1, "Bo", true));
    changed();
    changed();
    changed();
    await tick();
    expect(seen.length).toBe(before + 1);
    expect(lobbyStore.get().players.map((p) => p.name)).toEqual(["Ana", "Bo"]);

    lobbyStore.setReady(true);
    lobbyStore.start();
    expect(f.raw.send).toHaveBeenCalledWith(C2S.LOBBY_SET_READY, { ready: true });
    expect(f.raw.send).toHaveBeenCalledWith(C2S.RUN_START, {});

    // Tick 1's events can arrive before the start patch: the room's inbox keeps them (2.4 review).
    f.message(S2C.SIM_EVENTS_FLUSHED, { tick: 1, events: [] });
    f.state.phase = "wave";
    changed();
    await tick();
    expect(onPhase).toHaveBeenCalledExactlyOnceWith("wave");
    const early: number[] = [];
    lobbyStore.inbox()?.onEvents((m) => early.push(m.tick));
    expect(early).toEqual([1]);

    lobbyStore.leave();
    expect(unwatch).toHaveBeenCalled();
    expect(f.raw.leave).toHaveBeenCalledWith(true);
    expect(lobbyStore.get().players).toEqual([]);
    expect(lobbyStore.current()).toBeNull();
    expect(lobbyStore.inbox()).toBeNull();
    off();
  });

  it("waits for the first full state and reports a lost connection", async () => {
    const f = fakeRoom();
    (f.raw as { state: unknown }).state = {}; // not decoded yet
    const onLost = vi.fn();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost, onPhase: vi.fn() });
    await tick();
    expect(lobbyStore.get().code).toBe("");
    f.drop();
    expect(onLost).toHaveBeenCalledOnce();
    expect(lobbyStore.current()).toBeNull();
  });

  it("the inbox listens on the fight room (the dev throttle) when one is given (Story 2.6)", () => {
    const f = fakeRoom();
    const fight = new FakeRoom();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost: vi.fn(), onPhase: vi.fn(), fight });
    expect(lobbyStore.fightRoom()).toBe(fight);
    fight.deliver(S2C.NET_PINGED, { id: 4, rttMs: 10 });
    expect(fight.sentOf(C2S.NET_PONG)).toEqual([{ id: 4 }]);
    expect(f.raw.send).not.toHaveBeenCalledWith(C2S.NET_PONG, expect.anything());
    lobbyStore.leave();
    expect(lobbyStore.fightRoom()).toBeNull();
  });

  it("without a fight room, the fight reads the room itself", () => {
    const f = fakeRoom();
    lobbyStore.attach(f.room, { watch: () => () => {}, onLost: vi.fn(), onPhase: vi.fn() });
    expect(lobbyStore.fightRoom()).toBe(f.room);
    lobbyStore.leave();
  });
});
