import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  DOWNTOWN_MAP,
  BYTES,
  C2S,
  RUN_ROOM_NAME,
  S2C,
  setLoadout,
  startWave,
  type PlayerState,
  type RunStateView,
  type ShopBought,
  type ShopRefused,
  type ShopUpgraded,
  type ShopUpgradeRefused,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.3 integration: `shop.buy` validated on the server, answered to the buyer, seen in the state. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (intent: "create" | "join", name: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  guestToken: randomBytes(16).toString("hex"),
});

interface Answers {
  bought: ShopBought[];
  refused: ShopRefused[];
  upgraded: ShopUpgraded[];
  upgradeRefused: ShopUpgradeRefused[];
}

function listen(client: RunSdkRoom): Answers {
  const a: Answers = { bought: [], refused: [], upgraded: [], upgradeRefused: [] };
  client.onMessage(S2C.SHOP_UPGRADED, (m: ShopUpgraded) => a.upgraded.push(m));
  client.onMessage(S2C.SHOP_UPGRADE_REFUSED, (m: ShopUpgradeRefused) => a.upgradeRefused.push(m));
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.SHOP_BOUGHT, (m: ShopBought) => a.bought.push(m));
  client.onMessage(S2C.SHOP_REFUSED, (m: ShopRefused) => a.refused.push(m));
  return a;
}

/** Two players in a build phase that never ends (DEV_NO_WAVES): only what the test does happens. */
async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostAnswers = listen(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestAnswers = listen(guest);
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, room, hostAnswers, guestAnswers };
}

const player = (room: RunRoom, id: string) => room.controller?.world.players.get(id) as PlayerState;

describe("RunRoom shop (Story 3.3)", () => {
  it("a purchase with enough money charges the wallet, fills slot 2 and reaches both clients; only the buyer is answered", async () => {
    const { host, guest, room, hostAnswers, guestAnswers } = await startTwo();
    player(room, "p0").wallet = 250;
    host.send(C2S.SHOP_BUY, { weapon: "smg" });
    await vi.waitFor(() => expect(hostAnswers.bought).toEqual([{ weapon: "smg", slot: 1 }]));
    for (const c of [host, guest]) {
      await vi.waitFor(() => expect(c.state.players.get("p0")).toMatchObject({ wallet: 50, weapon0: "pistol", weapon1: "smg", ammo1: 40 }));
    }
    expect(guestAnswers.bought).toEqual([]);
    expect(hostAnswers.refused).toEqual([]);
    expect(player(room, "p1").wallet).toBe(100); // the guest's own wallet is untouched
  });

  it("not enough money: shop.refused insufficient_funds, nothing changes", async () => {
    const { host, room, hostAnswers } = await startTwo();
    host.send(C2S.SHOP_BUY, { weapon: "smg" }); // 100 < 200
    await vi.waitFor(() => expect(hostAnswers.refused).toEqual([{ weapon: "smg", error: "insufficient_funds" }]));
    expect(player(room, "p0").wallet).toBe(100);
    expect(player(room, "p0").loadout.slots[1]).toBeNull();
    expect(host.state.players.get("p0")?.weapon1).toBe("");
  });

  it("both slots full: the asked slot is replaced and its weapon is lost; without a slot it is refused", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const p = player(room, "p0");
    p.wallet = 1000;
    setLoadout(serverBalance, p.loadout, ["pistol", "machete"]);
    host.send(C2S.SHOP_BUY, { weapon: "hunting_rifle" });
    await vi.waitFor(() => expect(hostAnswers.refused).toEqual([{ weapon: "hunting_rifle", error: "slot_required" }]));
    host.send(C2S.SHOP_BUY, { weapon: "hunting_rifle", slot: 0 });
    await vi.waitFor(() => expect(hostAnswers.bought).toEqual([{ weapon: "hunting_rifle", slot: 0 }]));
    await vi.waitFor(() => expect(host.state.players.get("p0")).toMatchObject({ weapon0: "hunting_rifle", weapon1: "machete", wallet: 650 }));
  });

  it("refused outside a build phase (a wave)", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const w = room.controller?.world;
    if (!w) throw new Error("no run");
    player(room, "p0").wallet = 1000;
    startWave(w);
    host.send(C2S.SHOP_BUY, { weapon: "smg" });
    await vi.waitFor(() => expect(hostAnswers.refused).toEqual([{ weapon: "smg", error: "not_build" }]));
    expect(player(room, "p0").wallet).toBe(1000);
  });

  it("invalid messages are dropped without an answer; the client stays connected", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 1000;
    host.send(C2S.SHOP_BUY, { weapon: "SMG" });
    host.send(C2S.SHOP_BUY, { weapon: "smg", slot: 2 });
    host.send(C2S.SHOP_BUY, { weapon: "smg", price: 0 });
    host.send(C2S.SHOP_BUY, { weapon: "rocket" }); // well-formed but not sold → a refusal
    await vi.waitFor(() => expect(hostAnswers.refused).toEqual([{ weapon: "rocket", error: "not_for_sale" }]));
    expect(hostAnswers.bought).toEqual([]);
    expect(player(room, "p0").wallet).toBe(1000);
    expect(room.clients.length).toBe(2);
  });

  it("a burst of 40 buys in one go (> 25/s): at most one purchase per weapon, never past the wallet, the rest rate-dropped", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 400;
    for (let i = 0; i < 40; i++) host.send(C2S.SHOP_BUY, { weapon: i % 2 === 0 ? "smg" : "machete", slot: 1 });
    await vi.waitFor(() => expect(hostAnswers.bought.length + hostAnswers.refused.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 300));
    const answered = hostAnswers.bought.length + hostAnswers.refused.length;
    expect(answered).toBeLessThanOrEqual(11); // the shared "other" bucket: 10 (+ refill during the burst)
    // smg → slot 1 (200), then machete replaces it (150), then smg again (200 > 50 left): refused.
    expect(hostAnswers.bought.map((b) => b.weapon)).toEqual(["smg", "machete"]);
    expect(player(room, "p0").wallet).toBe(50);
    expect(player(room, "p0").wallet).toBeGreaterThanOrEqual(0);
    expect(hostAnswers.refused.every((r) => r.error === "already_owned" || r.error === "insufficient_funds")).toBe(true);
    expect(room.clients.length).toBe(2);
  });
});

describe("RunRoom weapon upgrades (Story 5.1)", () => {
  it("upgrade round trip: wallet, level0, answer to the sender only", async () => {
    const { host, guest, room, hostAnswers, guestAnswers } = await startTwo();
    player(room, "p0").wallet = 200;
    host.send(C2S.SHOP_UPGRADE, { weapon: "pistol" });
    await vi.waitFor(() => expect(hostAnswers.upgraded).toEqual([{ weapon: "pistol", slot: 0, level: 2 }]));
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.players.get("p0")).toMatchObject({ wallet: 140, weapon0: "pistol", level0: 2, level1: 0 }));
    expect(player(room, "p0").loadout.slots[0].level).toBe(2);
    expect(guestAnswers.upgraded).toEqual([]);
    expect(guestAnswers.upgradeRefused).toEqual([]);
    expect(player(room, "p1").wallet).toBe(100);
    expect(guest.state.players.get("p1")?.level0).toBe(1);
    // Someone else's weapon can't be upgraded or paid for: the guest asking for "smg" upgrades nothing.
    player(room, "p0").wallet = 1000;
    setLoadout(serverBalance, player(room, "p0").loadout, ["pistol", "smg"]);
    guest.send(C2S.SHOP_UPGRADE, { weapon: "smg" });
    await vi.waitFor(() => expect(guestAnswers.upgradeRefused).toEqual([{ weapon: "smg", error: "not_owned" }]));
    expect(player(room, "p0").loadout.slots[1]?.level).toBe(1);
    expect(player(room, "p0").wallet).toBe(1000);
  });

  it("upgrade refused in a wave; malformed ids dropped; max level refused", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const w = room.controller?.world;
    if (!w) throw new Error("no run");
    const p = player(room, "p0");
    p.wallet = 1000;
    host.send(C2S.SHOP_UPGRADE, { weapon: "PISTOL" });
    host.send(C2S.SHOP_UPGRADE, { weapon: "pistol", level: 4 });
    p.loadout.slots[0].level = 4;
    host.send(C2S.SHOP_UPGRADE, { weapon: "pistol" });
    await vi.waitFor(() => expect(hostAnswers.upgradeRefused).toEqual([{ weapon: "pistol", error: "max_level" }]));
    p.loadout.slots[0].level = 1;
    startWave(w);
    host.send(C2S.SHOP_UPGRADE, { weapon: "pistol" });
    await vi.waitFor(() => expect(hostAnswers.upgradeRefused.at(-1)).toEqual({ weapon: "pistol", error: "not_build" }));
    expect(hostAnswers.upgraded).toEqual([]);
    expect(p.wallet).toBe(1000);
    expect(p.loadout.slots[0].level).toBe(1);
    expect(room.clients.length).toBe(2);
  });

  it("10 rapid taps cannot overspend: each is checked against the wallet and level as they are by then", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const p = player(room, "p0");
    p.wallet = 150; // two Pistol upgrades (60 each), not three
    for (let i = 0; i < 10; i++) host.send(C2S.SHOP_UPGRADE, { weapon: "pistol" });
    await vi.waitFor(() => expect(hostAnswers.upgraded.length + hostAnswers.upgradeRefused.length).toBeGreaterThanOrEqual(3));
    await new Promise((r) => setTimeout(r, 300));
    expect(hostAnswers.upgraded.map((u) => u.level)).toEqual([2, 3]); // one level per paid tap, none skipped
    expect(p.wallet).toBe(30);
    expect(p.loadout.slots[0].level).toBe(3);
    expect(hostAnswers.upgradeRefused.every((r) => r.error === "insufficient_funds")).toBe(true);
    await vi.waitFor(() => expect(host.state.players.get("p0")).toMatchObject({ wallet: 30, level0: 3 }));
  });
});
