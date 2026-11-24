import { describe, expect, it } from "vitest";
import { C2S, S2C, addPlayer, buildingStats, createWorld, footprint, loadBalance, placeBuilding, sellBuilding, startBuild, startWave, type PlaceRequest, type SellError, type World } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { PendingPlacements, newestBuildingId } from "../scenes/pendingPlacements";
import { runPendingFrame, type PendingFlowScene } from "../scenes/pendingFlow";
import { placeRefusalText } from "../scenes/placement";
import { UndoChip } from "../scenes/undoChip";

/**
 * Story 5.20 (AC 7, B6, B8): take back / sell under `?lag=150&jitter=20` — the NetSimHost behind the
 * dev throttle against a fake server that runs the shared `placeBuilding` and `sellBuilding` on its
 * own World (a patch per 50 ms tick, refusals sent at once). The client loop is GameScene's:
 * `runPendingFrame`, then the undo chip (`UndoChip.update`, which sends an armed undo).
 */
const balance = loadBalance();
const RTT_MS = 150;
const JITTER_MS = 20;
const FRAME_MS = 16;
const TICK_MS = 50;
const WALLET = 500;
const WINDOW = balance.controls.build.undoWindowMs;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rig(seed = 11) {
  const server = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(server, "p1", 20, 16);
  startBuild(server);
  (server.players.get("p1") as { wallet: number }).wallet = WALLET;
  const room = new FakeRoom(fakeState([fakePlayer(1, { x: 20, y: 16, wallet: WALLET, ackSeq: 0 })]));
  room.state.phase = "build";
  room.state.wave = server.waves.number;
  room.state.buildTicksLeft = 600;
  let now = 0;
  const throttle = new DevThrottle(room, { lagMs: RTT_MS, jitterMs: JITTER_MS, random: lcg(seed), now: () => now });
  const session = new NetSession(throttle, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  const pending = new PendingPlacements();
  pending.configure(balance.controls.build.pendingTimeoutMs, balance.controls.build.chainSendGapMs, balance.buildings.maxPerPlayer);
  const undo = new UndoChip();
  const w = (): Readonly<World> => host.world;
  const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let placeQueued: PlaceRequest | null = null;
  let places = 0;
  let sells = 0;
  const sellRefusals: SellError[] = [];
  let serverWaveAt = Number.POSITIVE_INFINITY;
  const handle = (): void => {
    const p = room.sentOf(C2S.BUILDING_PLACE) as PlaceRequest[];
    for (; places < p.length; places++) {
      const r = placeBuilding(server, "p1", p[places] as PlaceRequest);
      if (!r.ok) room.deliver(S2C.BUILDING_REFUSED, { reason: r.error });
    }
    const s = room.sentOf(C2S.BUILDING_SELL) as { id: number }[];
    for (; sells < s.length; sells++) {
      const id = (s[sells] as { id: number }).id;
      const r = sellBuilding(server, "p1", id);
      if (!r.ok) {
        sellRefusals.push(r.error);
        room.deliver(S2C.BUILDING_SELL_REFUSED, { id, reason: r.error });
      }
    }
  };
  const serverTick = (): void => {
    if (now >= serverWaveAt && server.run.phase === "build") startWave(server);
    room.state.tick++;
    room.state.phase = server.run.phase;
    room.state.wave = server.waves.number;
    const ids = new Set(server.buildings.list.map((b) => String(b.id)));
    for (const k of [...room.state.buildings.keys()]) if (!ids.has(k)) room.state.buildings.delete(k);
    for (const b of server.buildings.list) room.state.buildings.set(String(b.id), { type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: b.hp, trap: 0 });
    const me = room.state.players.get("p1");
    if (me) me.wallet = server.players.get("p1")?.wallet ?? 0;
    room.patch();
  };
  let nextTick = TICK_MS;
  const dropped = { seen: 0 };
  const scene: PendingFlowScene = {
    beforeHost: () => {
      const r = placeQueued;
      placeQueued = null;
      if (!r) return;
      const s = buildingStats(balance, r.type);
      if (!s) throw new Error("type");
      if (pending.add(r, s.price, footprint(s, r.gx, r.gy, r.rot, box), newestBuildingId(w()), w().run.phase, w().waves.number)) undo.placed(pending.lastOrder, now, w().waves.number);
    },
    stepHost: () => host.update(FRAME_MS / 1000),
    toast: () => {},
    refusalText: (e) => placeRefusalText(e, balance),
  };
  const sendSell = (id: number): void => host.sellBuilding(id);
  const frame = (pressUndo = false): void => {
    now += FRAME_MS;
    throttle.pump(now);
    handle();
    while (now >= nextTick) {
      serverTick();
      nextTick += TICK_MS;
    }
    runPendingFrame(pending, host, now, scene, (r) => host.placeBuilding(r), dropped);
    while (host.takeSellRefusal() !== null);
    undo.update(w(), "p1", pending, now, WINDOW, w().run.phase === "build", true, sendSell);
    if (pressUndo) {
      const id = undo.press();
      if (id !== 0) host.sellBuilding(id);
    }
  };
  const settle = (n = 40): void => {
    for (let i = 0; i < n; i++) frame();
  };
  return {
    server,
    room,
    host,
    pending,
    undo,
    sellRefusals,
    frame,
    settle,
    place: (gx: number) => {
      placeQueued = { type: "wood_barricade", gx, gy: 20, rot: 0 };
    },
    waveAt: (ms: number) => {
      serverWaveAt = ms;
    },
    now: () => now,
    wallet: () => server.players.get("p1")?.wallet ?? 0,
  };
}

describe("Story 5.20: take back / undo under ?lag=150&jitter=20 (NetSimHost, fake server)", () => {
  it("↶ pressed while the placement is still pending: armed, then one sell once it's a building; 100 % back", () => {
    const s = rig();
    s.settle(20);
    s.place(30);
    s.frame();
    s.frame(true); // pressed ~16 ms after Place: the box is still pending (≥ 75 ms each way)
    expect(s.undo.armed).toBe(true);
    expect(s.room.sentOf(C2S.BUILDING_SELL)).toEqual([]);
    s.settle(60);
    expect(s.room.sentOf(C2S.BUILDING_PLACE)).toHaveLength(1);
    expect(s.room.sentOf(C2S.BUILDING_SELL)).toHaveLength(1);
    expect(s.server.buildings.list).toHaveLength(0);
    expect(s.wallet()).toBe(WALLET);
    expect(s.host.world.buildings.list).toHaveLength(0);
    expect(s.host.world.players.get("p1")?.wallet).toBe(WALLET);
    expect(s.sellRefusals).toEqual([]);
    expect(s.undo.order).toBe(0);
  });

  it("sell spam (12 sells of one building in 200 ms): refunded once, the rest 'gone'", () => {
    const s = rig(5);
    s.settle(20);
    s.place(30);
    s.settle(40);
    const id = s.server.buildings.list[0]?.id ?? 0;
    expect(id).toBeGreaterThan(0);
    expect(s.wallet()).toBe(WALLET - 40);
    for (let i = 0; i < 12; i++) {
      s.host.sellBuilding(id);
      s.frame();
    }
    s.settle(40);
    expect(s.room.sentOf(C2S.BUILDING_SELL)).toHaveLength(12);
    expect(s.wallet()).toBe(WALLET);
    expect(s.sellRefusals).toEqual(Array(11).fill("gone"));
  });

  it("↶ at the build → wave edge: sold in the build (100 %) or refused (not_build_phase) — never refunded twice, never sold in a wave", () => {
    const outcomes = { sold: 0, refused: 0 };
    for (let k = 0; k < 12; k++) {
      const s = rig(100 + k);
      s.settle(20);
      s.place(30);
      s.settle(30);
      expect(s.undo.visible).toBe(true);
      s.waveAt(s.now() + 20 + k * 10); // the server's wave starts somewhere around the press's arrival (75 ± 10 ms one way)
      s.frame(true);
      s.settle(60);
      const sold = s.server.buildings.list.length === 0;
      expect(s.room.sentOf(C2S.BUILDING_SELL)).toHaveLength(1);
      expect(s.wallet()).toBe(sold ? WALLET : WALLET - 40);
      expect(s.sellRefusals).toEqual(sold ? [] : ["not_build_phase"]);
      expect(s.server.run.phase).toBe("wave");
      outcomes[sold ? "sold" : "refused"]++;
    }
    expect(outcomes.sold).toBeGreaterThan(0); // liveness: both sides of the edge happened
    expect(outcomes.refused).toBeGreaterThan(0);
  });

  it("an armed undo whose building lands next to the wave start: never sold in the wave (not sent, or refused), charged once", () => {
    for (let k = 0; k < 8; k++) {
      const s = rig(40 + k);
      s.settle(20);
      s.waveAt(s.now() + 100 + k * 15); // the place reaches the server in its build phase, the wave starts around its patch
      s.place(30);
      s.frame();
      s.frame(true);
      expect(s.undo.armed).toBe(true);
      s.settle(60);
      expect(s.server.run.phase).toBe("wave");
      const sent = s.room.sentOf(C2S.BUILDING_SELL).length;
      expect(sent).toBeLessThanOrEqual(1);
      const sold = s.server.buildings.list.length === 0;
      expect(s.wallet()).toBe(sold ? WALLET : WALLET - 40);
      expect(s.sellRefusals).toEqual(sent === 1 && !sold ? ["not_build_phase"] : []);
    }
  });
});
