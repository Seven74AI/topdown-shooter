import { sendInput } from "../test/sendInput";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  BYTES,
  C2S,
  NET_EVENT_KIND,
  NEUTRAL_INPUT,
  RUN_ROOM_NAME,
  S2C,
  skipWave,
  loadDevBalance,
  startBuild,
  type BuildingRefused,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { MAX_OTHER_MESSAGES_PER_S } from "../net/limits";
import { RunRoom, serverBalance } from "./RunRoom";
import { RunController } from "../run/RunController";

/** Story 3.4 integration: `building.place` → validated placement, state on every client, refusals to the sender. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  // Story 7.4: these rooms test 5.9–5.13 rules with every item; a guest now plays the starter pool (decision 7.4 D3).
  process.env.DEV_UNLOCKS = "all";
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await colyseus.cleanup();
});
afterAll(async () => {
  delete process.env.DEV_UNLOCKS;
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (intent: "create" | "join", name: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: randomBytes(16).toString("hex"),
});

function record(client: RunSdkRoom) {
  const events: SimEventsFlushed[] = [];
  const refused: string[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, (m: BuildingRefused) => refused.push(m.reason));
  return { events, refused };
}

/** Two players, started: the run is in its first build phase (real waves, 30 s countdown). */
async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "0");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostRec = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestRec = record(guest);
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, room, hostRec, guestRec };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};
const WOOD = "wood_barricade";

describe("RunRoom buildings (Story 3.4)", () => {
  it("places a barricade: both clients see it, the builder pays 40, building.placed is forwarded", async () => {
    const { host, guest, room, guestRec } = await startTwo();
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 12, gy: 30, rot: 1 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(1));
    expect(guest.state.buildings.get("1")).toMatchObject({ type: WOOD, owner: "p0", gx: 12, gy: 30, rot: 1, hp: 200 });
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.wallet).toBe(serverBalance.economy.startingWallet - 40));
    expect(guest.state.players.get("p1")?.wallet).toBe(serverBalance.economy.startingWallet);
    await vi.waitFor(() => expect(guestRec.events.flatMap((b) => b.events).some((t) => t[0] === NET_EVENT_KIND.BUILDING_PLACED)).toBe(true));
    const t = guestRec.events.flatMap((b) => b.events).find((e) => e[0] === NET_EVENT_KIND.BUILDING_PLACED);
    expect(t).toEqual([NET_EVENT_KIND.BUILDING_PLACED, 1, 0, 0, 12, 30, 1]);
    expect(world(room).buildings.list).toHaveLength(1);
  });

  it("refuses to the sender only: a spot on a player, not enough money, the cap, a wave; nothing changes", async () => {
    const { host, room, hostRec, guestRec } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("no p0");
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: Math.round((me.x - 1) * 2), gy: Math.round((me.y - 0.25) * 2), rot: 0 });
    await vi.waitFor(() => expect(hostRec.refused).toEqual(["blocked"]));
    me.wallet = 39;
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 5, gy: 5, rot: 0 });
    await vi.waitFor(() => expect(hostRec.refused).toEqual(["blocked", "money"]));
    me.wallet = 1000;
    // Stories 4.6/4.7 review (flake): the 6 placements that reach the cap go through the controller
    // directly, not as messages. Sent as messages they made 14 "other" messages from the host in this
    // test against a 10-token bucket refilled at 10/s by ARRIVAL time: the last message only got a
    // token if ≥ 0.4 s of arrivals had passed (measured: 0.85 tokens left before it). Under load the
    // socket delivers queued messages in a burst, the arrivals bunch up, the final placement is
    // silently rate-dropped and no refusal ever comes (a longer wait could not help). Now the host
    // sends 8 messages in all, inside the bucket's capacity whatever the timing.
    for (let i = 0; i < 6; i++) expect(room.controller?.placeBuilding("p0", { type: WOOD, gx: 14 + i * 6, gy: 41, rot: 0 }).ok).toBe(true); // Story 4.3: x ≥ 7 m, clear of window_diner (3.5, 21.4); Story 6.2: the south sidewalk (the north one is within 2 m of breach_apartments)
    expect(world(room).buildings.list).toHaveLength(6);
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 5, gy: 28, rot: 0 });
    await vi.waitFor(() => expect(hostRec.refused).toEqual(["blocked", "money", "limit"]));
    expect(me.wallet).toBe(1000 - 6 * 40);
    host.send(C2S.BUILDING_PLACE, { type: "castle", gx: 5, gy: 28, rot: 0 });
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(4));
    expect(hostRec.refused[3]).toBe("unknown_type");
    host.send(C2S.BUILD_SET_READY, { ready: true });
    room.controller?.setBuildReady("p1", true);
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 40, gy: 28, rot: 0 });
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(5));
    expect(hostRec.refused[4]).toBe("not_build_phase");
    // Not one message was rate-dropped (a regression here would otherwise look like a timeout).
    const hostClient = [...room.clients].find((c) => c.sessionId === host.sessionId);
    expect(room.net.pending(hostClient as never)?.rate).toBe(0);
    expect(guestRec.refused).toEqual([]);
    expect(world(room).buildings.list).toHaveLength(6);
  });

  it("Story 6.3 (D8, was 5.10 B9): a floodlight places in the first build phase (100, 150 HP); a med station places (300 HP). (not_for_sale stays tested in buildings.test.ts with a test balance)", async () => {
    const { host, room, hostRec } = await startTwo();
    host.send(C2S.BUILDING_PLACE, { type: "floodlight", gx: 12, gy: 30, rot: 0 });
    await vi.waitFor(() => expect(host.state.buildings.size).toBe(1));
    expect(hostRec.refused).toEqual([]);
    expect(host.state.buildings.get("1")).toMatchObject({ type: "floodlight", hp: 150 });
    expect(world(room).players.get("p0")?.wallet).toBe(serverBalance.economy.startingWallet - 100);
    world(room).players.get("p0")!.wallet = 1000;
    host.send(C2S.BUILDING_PLACE, { type: "med_station", gx: 16, gy: 30, rot: 0 });
    await vi.waitFor(() => expect(host.state.buildings.size).toBe(2));
    expect(host.state.buildings.get("2")).toMatchObject({ type: "med_station", hp: 300 });
    expect(world(room).players.get("p0")?.wallet).toBe(600);
  });

  it("Story 5.10 (B10): a run on the dev shop-all balance (what DEV_SHOP_ALL=1 builds) places a floodlight, and it becomes a light on the server's World", () => {
    const players = [{ playerId: "p0", slot: 0 }];
    const c = new RunController({ balance: loadDevBalance({ zombieDamageScale: null, shopAll: true }), seed: 3, players, pauseWaves: true });
    const w = c.world;
    if (w.run.phase === "lobby") startBuild(w);
    const p = w.players.get("p0");
    if (!p) throw new Error("no p0");
    const r = c.placeBuilding("p0", { type: "floodlight", gx: Math.round((p.x + 3) * 2), gy: Math.round(p.y * 2), rot: 0 });
    expect(r.ok).toBe(true);
    c.tick();
    expect(w.lights.list.filter((l) => l.kind === "floodlight")).toHaveLength(1);
    expect(w.lights.list[w.lights.list.length - 1]).toMatchObject({ kind: "floodlight", radiusM: 4 });
  });

  it("a malformed message is dropped by the guard (no reply), the room keeps running", async () => {
    const { host, room, hostRec } = await startTwo();
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 1.5, gy: 3, rot: 0 });
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 300, gy: 3, rot: 0 });
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 3, gy: 3, rot: 4 });
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 3, gy: 3, rot: 0, owner: "p1" });
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 12, gy: 30, rot: 0 }); // valid, after the junk
    await vi.waitFor(() => expect(world(room).buildings.list).toHaveLength(1));
    expect(hostRec.refused).toEqual([]);
    expect(world(room).buildings.list[0]?.ownerId).toBe("p0");
  });

  it("a burst of 40 placements (> 25/s, the shared 10/s bucket) places at most the cap, never overspends, and the rest is rate-dropped", async () => {
    const { host, room, hostRec } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("no p0");
    me.wallet = 10_000;
    for (let i = 0; i < 40; i++) host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 14 + (i % 8) * 6, gy: 41 + Math.floor(i / 8) * 4, rot: 0 }); // Story 6.2: clear of breach_apartments
    await vi.waitFor(() => expect(world(room).buildings.list).toHaveLength(6));
    const tick = world(room).tick;
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(tick + 4));
    expect(world(room).buildings.list).toHaveLength(6);
    expect(me.wallet).toBe(10_000 - 6 * 40);
    expect(hostRec.refused.every((r) => r === "limit")).toBe(true);
    expect(6 + hostRec.refused.length).toBeLessThanOrEqual(MAX_OTHER_MESSAGES_PER_S + 1); // the shared "other" bucket (10, + refill) dropped the rest
    expect(room.state.phase).toBe("build");
  });

  it("barricades persist across waves, and block the server's movement of the player", async () => {
    const { host, guest, room } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("no p0");
    const gx = Math.round((me.x - 1) * 2); // centred on my x, min corner on the 0.5 m lattice
    const gy = Math.round((me.y - 3) * 2); // 3 m ahead of me
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx, gy, rot: 0 });
    await vi.waitFor(() => expect(world(room).buildings.list).toHaveLength(1));
    const face = gy * 0.5 + 0.5 + serverBalance.player.radiusM;
    let seq = 0;
    for (let k = 0; k < 5; k++) {
      // 4 inputs at a time (the input ring holds 6): 20 × 0.225 m = 4.5 m of walking up
      for (let i = 0; i < 4; i++) sendInput(host, { ...NEUTRAL_INPUT, seq: ++seq, moveY: -1, aimY: -1 });
      await vi.waitFor(() => expect(room.controller?.ackSeq("p0")).toBe(seq), { timeout: 4000 });
    }
    expect(me.y).toBeCloseTo(face, 6);
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    skipWave(world(room));
    await vi.waitFor(() => expect(host.state.phase).toBe("build"));
    expect(host.state.wave).toBe(1);
    expect(host.state.buildings.size).toBe(1);
    expect(world(room).buildings.list).toHaveLength(1);
  });
});
