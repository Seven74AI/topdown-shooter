import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { C2S, S2C, type PlayerStateView, type RunPhase, type RunStateView } from "@topdown/shared";
import { START_HINT, START_HINT_SHORT, lobbyStore, lobbyView, snapshotLobby, type LobbySnapshot } from "./lobbyStore";
import type { RunConnection } from "./connection";
import { FakeRoom, fakePlayer } from "./fakeRoom";

const player = (slot: number, name: string, ready = false): PlayerStateView => fakePlayer(slot, { name, ready });

function snap(over: Partial<LobbySnapshot> = {}): LobbySnapshot {
  return {
    code: "ABCD",
    phase: "lobby",
    hostSlot: 0,
    localPlayerId: "p0",
    district: "downtown", // Story 7.7
    districtsOpen: 1,
    districtReset: "",
    districtResetSeq: 0,
    players: [
      { playerId: "p0", slot: 0, name: "Ana", ready: true, look: "" },
      { playerId: "p2", slot: 2, name: "Cid", ready: true, look: "" },
    ],
    ...over,
  };
}

describe("snapshotLobby", () => {
  it("copies players in slot order as plain data", () => {
    const players = new Map<string, PlayerStateView>([
      ["p2", fakePlayer(2, { name: "Cid", ready: true, look: "v1|top:hoodie|head:beanie" })], // Story 7.9 review L1: a real code
      ["p0", player(0, "Ana")],
    ]);
    const state: RunStateView = { phase: "lobby", hostSlot: 0, players, buildings: new Map(), tick: 0, wave: 0, remaining: 0, aliveCount: 0, resultWave: 0, resultEnding: "", buildTicksLeft: 0, scenario: "", runSeed: 0, decayStage: 0, decayVariants: 0, decayFiresOut: 0, blackoutPct: 0, halfDark: false, voteTicksLeft: 0, endless: false, eventKind: 255, eventPhase: 0, eventStartTick: 0, eventPhaseTick: 0, eventX: 0, eventY: 0, eventLane: 255, crateWeapon: 255, crateClaimSlot: 255, crateClaimTicks: 0, npcX: 0, npcY: 0, npcHp: 0, npcState: 0, npcLook: 0, npcLeaderSlot: 255, safeX: 0, safeY: 0, frozen: false, resumeIn: 0, lootBagState: 0, lootBagX: 0, lootBagY: 0, lootBagUntilTick: 0, lootBagVariant: 0, district: "downtown", districtsOpen: 1 };
    const s = snapshotLobby("ABCD", state, "p2");
    expect(s).toEqual({
      code: "ABCD",
      phase: "lobby",
      hostSlot: 0,
      localPlayerId: "p2",
      players: [
        { playerId: "p0", slot: 0, name: "Ana", ready: false, look: "" },
        { playerId: "p2", slot: 2, name: "Cid", ready: true, look: "v1|top:hoodie|head:beanie" },
      ],
      district: "downtown", // Story 7.7
      districtsOpen: 1,
      districtReset: "",
      districtResetSeq: 0,
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
    const notReady = snap({ players: [{ playerId: "p0", slot: 0, name: "Ana", ready: true, look: "" }, { playerId: "p1", slot: 1, name: "Bo", ready: false, look: "" }] });
    expect(lobbyView(notReady, false)).toMatchObject({ canStart: false, startHint: START_HINT.notReady });
    // Story 7.9 review L6: the Start button shows the short reason (fits its second line at 568 and 800 px wide)
    expect(lobbyView(notReady, false).startHintShort).toBe(START_HINT_SHORT.notReady);
    // re-review RR2: measured in px at the button's hint font (11 px), inside Start's ≥ 112 px minus border and padding
    const g = createCanvas(10, 10).getContext("2d");
    g.font = "500 11px sans-serif";
    for (const t of Object.values(START_HINT_SHORT)) expect(g.measureText(t).width).toBeLessThanOrEqual(100);
    const alone = snap({ players: [{ playerId: "p0", slot: 0, name: "Ana", ready: true, look: "" }] });
    // Designer 2026-11-23: a host alone may start a real online run in every build.
    expect(lobbyView(alone, false)).toMatchObject({ canStart: true, startHint: null });
    expect(lobbyView(alone, true)).toMatchObject({ canStart: true, startHint: null });
    const aloneNotReady = snap({ players: [{ playerId: "p0", slot: 0, name: "Ana", ready: false, look: "" }] });
    expect(lobbyView(aloneNotReady, false)).toMatchObject({ canStart: false, startHint: START_HINT.notReady });
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
    // Story 7.2 (D4): a Leave mid-run first asks the server to bank (run.leave) and leaves on its run.rewards answer.
    expect(f.raw.send).toHaveBeenCalledWith(C2S.RUN_LEAVE, {});
    expect(f.raw.leave).not.toHaveBeenCalled();
    f.message(S2C.RUN_REWARDS, { runId: "0f1e2d3c-4b5a-4968-8776-655443322110", seed: 1, status: "not_saved", lines: { waves: 0, boss: 0, extract: 0, endless: 0, endlessBoss: 0 }, waveCount: 0, endlessWaveCount: 0, rookie: false, total: 0, newTotal: 0 });
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

  it("leave(room) leaves only that room: a stale session's leave never leaves a newer room (Story 2.11)", () => {
    const old = fakeRoom();
    lobbyStore.attach(old.room, { watch: () => () => {}, onLost: vi.fn(), onPhase: vi.fn() });
    expect(lobbyStore.leave(old.room)).toBe(true);
    expect(old.raw.leave).toHaveBeenCalledWith(true);
    const now = fakeRoom();
    lobbyStore.attach(now.room, { watch: () => () => {}, onLost: vi.fn(), onPhase: vi.fn() });
    expect(lobbyStore.leave(old.room)).toBe(false); // the first run's session, disposed late
    expect(lobbyStore.current()).toBe(now.room);
    expect(now.raw.leave).not.toHaveBeenCalled();
    lobbyStore.leave();
  });
});
