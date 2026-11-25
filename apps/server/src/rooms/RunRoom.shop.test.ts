import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  BYTES,
  C2S,
  RUN_ROOM_NAME,
  S2C,
  setLoadout,
  endWave,
  startWave,
  type PlayerState,
  type RunStateView,
  type ShopBought,
  type ShopOffered,
  type ShopBoughtItem,
  type ShopRefusedItem,
  type ShopRefused,
  type ShopUpgraded,
  type ShopUpgradeRefused,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.3 integration: `shop.buy` validated on the server, answered to the buyer, seen in the state. */
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

const SHOP_TEST_SEED = 1;

const options = (intent: "create" | "join", name: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: randomBytes(16).toString("hex"),
});

interface Answers {
  bought: ShopBought[];
  refused: ShopRefused[];
  upgraded: ShopUpgraded[];
  upgradeRefused: ShopUpgradeRefused[];
  boughtItem: ShopBoughtItem[];
  refusedItem: ShopRefusedItem[];
  /** Story 5.13: my offers, in arrival order. */
  offered: ShopOffered[];
}

function listen(client: RunSdkRoom): Answers {
  const a: Answers = { bought: [], refused: [], upgraded: [], upgradeRefused: [], boughtItem: [], refusedItem: [], offered: [] };
  client.onMessage(S2C.SHOP_OFFERED, (m: ShopOffered) => a.offered.push(m));
  client.onMessage(S2C.SHOP_BOUGHT_ITEM, (m: ShopBoughtItem) => a.boughtItem.push(m));
  client.onMessage(S2C.SHOP_REFUSED_ITEM, (m: ShopRefusedItem) => a.refusedItem.push(m));
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

/**
 * Two players in a build phase that never ends (DEV_NO_WAVES): only what the test does happens.
 * Story 5.13: every offer starts with `cards` (DEV_SHOP_CARDS; default SMG, Machete, Hunting Rifle,
 * Body armor I, Running shoes).
 */
async function startTwo(cards = "smg,machete,hunting_rifle,body_armor_1,running_shoes", devRunSeed?: number) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  vi.stubEnv("DEV_SHOP_CARDS", cards);
  if (devRunSeed !== undefined) vi.stubEnv("DEV_ALLOW_RUN_SEED", "1");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, { ...options("create", "Ana"), ...(devRunSeed === undefined ? {} : { devRunSeed }) });
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
  for (const a of [hostAnswers, guestAnswers]) await vi.waitFor(() => expect(a.offered.length).toBeGreaterThanOrEqual(1));
  return { host, guest, room, hostAnswers, guestAnswers };
}

/** The latest offer a client got, and the card index of `item` on it. */
const last = (a: Answers): ShopOffered => a.offered.at(-1) as ShopOffered;
const buy = (c: RunSdkRoom, a: Answers, item: string, slot?: 0 | 1) => {
  const o = last(a);
  c.send(C2S.SHOP_BUY, { build: o.build, rev: o.rev, card: o.cards.indexOf(item), item, ...(slot === undefined ? {} : { slot }) });
};

const player = (room: RunRoom, id: string) => room.controller?.world.players.get(id) as PlayerState;

describe("RunRoom card shop (Story 5.13; 3.3's room tests moved to cards)", () => {
  it("each client gets only its own offer at the build start (F1); the stored one, equal to the World's", async () => {
    // A fixed run seed: with a random one the two 4-card fillers can come out equal by chance.
    const { room, hostAnswers, guestAnswers } = await startTwo("smg,body_armor_1", SHOP_TEST_SEED);
    expect(room.devRunSeed).toBe(SHOP_TEST_SEED);
    const h = last(hostAnswers);
    const g = last(guestAnswers);
    expect(h).toEqual(room.controller?.offerFor("p0"));
    expect(g).toEqual(room.controller?.offerFor("p1"));
    expect([h.build, h.rev, h.sold, h.rerollPrice]).toEqual([0, 0, 0, 20]);
    expect(h.cards).toHaveLength(6);
    expect(h.cards).toContain("smg");
    expect(h.cards).not.toEqual(g.cards); // own streams (seeded: the filler differs)
    expect(hostAnswers.offered).toHaveLength(1); // one per build start
  });

  it("the next build start sends each player a new offer (build 1, rev 0); the stream key moved on (F2)", async () => {
    const { room, hostAnswers, guestAnswers } = await startTwo();
    const w = room.controller?.world;
    if (!w) throw new Error("no run");
    startWave(w);
    endWave(w); // wave 1 → build 1 (the next tick forwards build.started)
    for (const a of [hostAnswers, guestAnswers]) await vi.waitFor(() => expect(last(a).build).toBe(1));
    expect(last(hostAnswers)).toEqual(room.controller?.offerFor("p0"));
    expect(last(hostAnswers).rev).toBe(0);
    expect(hostAnswers.offered).toHaveLength(2);
  });

  it("buy a card: charged the card price, card sold, both clients see wallet and weapon; only the buyer is answered", async () => {
    const { host, guest, room, hostAnswers, guestAnswers } = await startTwo();
    player(room, "p0").wallet = 250;
    const before = guestAnswers.offered.length;
    buy(host, hostAnswers, "smg");
    const card = hostAnswers.offered[0]?.cards.indexOf("smg") as number;
    await vi.waitFor(() => expect(hostAnswers.bought).toEqual([{ item: "smg", card, slot: 1 }]));
    await vi.waitFor(() => expect(last(hostAnswers).sold).toBe(1 << card)); // the new offer: Sold
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.players.get("p0")).toMatchObject({ wallet: 50, weapon0: "pistol", weapon1: "smg", ammo1: 40 }));
    expect(guestAnswers.bought).toEqual([]);
    expect(guestAnswers.offered.length).toBe(before); // the guest's offer is untouched (F1)
    expect(player(room, "p1").wallet).toBe(serverBalance.economy.startingWallet);
  });

  it("not enough money: insufficient_funds, nothing changes; both slots full needs a slot", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 100;
    buy(host, hostAnswers, "smg"); // 100 < 200
    await vi.waitFor(() => expect(hostAnswers.refused).toHaveLength(1));
    expect(hostAnswers.refused[0]?.error).toBe("insufficient_funds");
    const p = player(room, "p0");
    p.wallet = 1000;
    setLoadout(serverBalance, p.loadout, ["pistol", "machete"]);
    buy(host, hostAnswers, "hunting_rifle");
    await vi.waitFor(() => expect(hostAnswers.refused.at(-1)?.error).toBe("slot_required"));
    buy(host, hostAnswers, "hunting_rifle", 0);
    await vi.waitFor(() => expect(host.state.players.get("p0")).toMatchObject({ weapon0: "hunting_rifle", weapon1: "machete", wallet: 650 }));
  });

  it("gear is a card now: bought with its effect; shop.buy_item refuses gear (not_for_sale)", async () => {
    const { host, guest, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 500;
    host.send(C2S.SHOP_BUY_ITEM, { item: "body_armor_1" });
    await vi.waitFor(() => expect(hostAnswers.refusedItem).toEqual([{ item: "body_armor_1", error: "not_for_sale" }]));
    buy(host, hostAnswers, "body_armor_1");
    await vi.waitFor(() => expect(hostAnswers.bought.map((b) => b.item)).toEqual(["body_armor_1"]));
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.players.get("p0")).toMatchObject({ gear: 1, maxHp: 125, hp: 125, wallet: 350 }));
  });

  it("a burst of 40 rerolls charges once (B1): one new offer, the rest stale_offer or rate-dropped", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 1000;
    const o = last(hostAnswers);
    for (let i = 0; i < 40; i++) host.send(C2S.SHOP_REROLL, { build: o.build, rev: o.rev });
    await vi.waitFor(() => expect(last(hostAnswers).rev).toBe(1));
    await new Promise((r) => setTimeout(r, 300));
    expect(player(room, "p0").wallet).toBe(980);
    expect(hostAnswers.offered.filter((x) => x.rev === 1)).toHaveLength(1);
    expect(hostAnswers.refused.length).toBeLessThanOrEqual(11); // the "other" bucket (10 + refill)
    expect(hostAnswers.refused.every((r) => r.item === "reroll" && r.error === "stale_offer")).toBe(true);
    expect(room.clients.length).toBe(2);
  });

  it("double buy of one card (B5): charged once, the second not_in_offer", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 1000;
    buy(host, hostAnswers, "running_shoes");
    buy(host, hostAnswers, "running_shoes");
    await vi.waitFor(() => expect(hostAnswers.bought.length + hostAnswers.refused.length).toBe(2));
    expect(hostAnswers.bought.map((b) => b.item)).toEqual(["running_shoes"]);
    expect(hostAnswers.refused.map((r) => r.error)).toEqual(["not_in_offer"]);
    expect(player(room, "p0").wallet).toBe(850);
  });

  it("two players buy the same item in the same tick (B4): both succeed, each from their own wallet", async () => {
    const { host, guest, room, hostAnswers, guestAnswers } = await startTwo();
    player(room, "p0").wallet = 300;
    player(room, "p1").wallet = 300;
    buy(host, hostAnswers, "smg");
    buy(guest, guestAnswers, "smg");
    await vi.waitFor(() => expect([hostAnswers.bought.length, guestAnswers.bought.length]).toEqual([1, 1]));
    expect([player(room, "p0").wallet, player(room, "p1").wallet]).toEqual([100, 100]);
  });

  it("a buy that lands after the wave start is refused (B3; F5): not_build, no charge, no offer in the wave", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const w = room.controller?.world;
    if (!w) throw new Error("no run");
    player(room, "p0").wallet = 1000;
    startWave(w);
    buy(host, hostAnswers, "smg");
    host.send(C2S.SHOP_REROLL, { build: 0, rev: 0 });
    await vi.waitFor(() => expect(hostAnswers.refused.map((r) => [r.item, r.error])).toEqual([["smg", "not_build"], ["reroll", "not_build"]]));
    expect(player(room, "p0").wallet).toBe(1000);
    expect(room.controller?.offerFor("p0")).toBeNull();
  });

  it("downed in build: card buy and reroll refused not_alive; nothing changes", async () => {
    const { host, room, hostAnswers } = await startTwo();
    const p = player(room, "p0");
    p.wallet = 1000;
    p.status = "downed";
    p.hp = 0;
    buy(host, hostAnswers, "body_armor_1");
    host.send(C2S.SHOP_REROLL, { build: 0, rev: 0 });
    await vi.waitFor(() => expect(hostAnswers.refused.map((r) => r.error)).toEqual(["not_alive", "not_alive"]));
    expect([p.hp, p.maxHp, p.gear, p.wallet]).toEqual([0, 100, 0, 1000]);
  });

  it("invalid shop messages are dropped (B12); forged but well-formed ones refused; the client stays connected", async () => {
    const { host, room, hostAnswers } = await startTwo();
    player(room, "p0").wallet = 1000;
    const o = last(hostAnswers);
    host.send(C2S.SHOP_BUY, { weapon: "smg" }); // the 3.3 shape: dropped
    host.send(C2S.SHOP_BUY, { build: 0, rev: 0, card: 9, item: "smg" });
    host.send(C2S.SHOP_BUY, { build: 0, rev: -1, card: 0, item: "smg" });
    host.send(C2S.SHOP_BUY, { build: 0, rev: 0, card: 0, item: "SMG" });
    host.send(C2S.SHOP_BUY, { build: 0, rev: 0, card: 0, item: "smg", price: 0 });
    host.send(C2S.SHOP_REROLL, { build: 0 });
    const notSmg = o.cards.findIndex((id) => id !== "smg");
    host.send(C2S.SHOP_BUY, { build: o.build, rev: o.rev, card: notSmg, item: "smg" }); // not that card
    host.send(C2S.SHOP_BUY, { build: o.build, rev: 3, card: 0, item: o.cards[0] }); // stale rev
    host.send(C2S.SHOP_BUY, { build: 1, rev: 0, card: 0, item: o.cards[0] }); // another build
    await vi.waitFor(() => expect(hostAnswers.refused.map((r) => r.error)).toEqual(["not_in_offer", "stale_offer", "stale_offer"]));
    expect(hostAnswers.bought).toEqual([]);
    expect(player(room, "p0").wallet).toBe(1000);
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
    expect(player(room, "p1").wallet).toBe(serverBalance.economy.startingWallet);
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

describe("RunRoom gear (Story 5.11; Story 5.13: gear cards)", () => {
  it("refusals: owned (double tap), not on my offer, money; the armor II card covers armor I", async () => {
    const { host, room, hostAnswers } = await startTwo("running_shoes,revive_kit,body_armor_1,body_armor_2,smg");
    const p = player(room, "p0");
    p.wallet = 160;
    buy(host, hostAnswers, "running_shoes");
    buy(host, hostAnswers, "running_shoes"); // a double tap
    buy(host, hostAnswers, "revive_kit");
    await vi.waitFor(() => expect(hostAnswers.refused).toHaveLength(2));
    expect(hostAnswers.bought.map((b) => b.item)).toEqual(["running_shoes"]);
    expect(hostAnswers.refused.map((r) => [r.item, r.error])).toEqual([
      ["running_shoes", "not_in_offer"],
      ["revive_kit", "insufficient_funds"],
    ]);
    expect(p.wallet).toBe(10);
    p.wallet = 1000;
    buy(host, hostAnswers, "body_armor_2");
    await vi.waitFor(() => expect(hostAnswers.bought.map((b) => b.item)).toEqual(["running_shoes", "body_armor_2"]));
    buy(host, hostAnswers, "body_armor_1");
    await vi.waitFor(() => expect(hostAnswers.refused.at(-1)).toMatchObject({ item: "body_armor_1", error: "already_owned" }));
    expect(p.wallet).toBe(700); // Armor II 300 (balance pass B9)
    expect(room.clients.length).toBe(2);
  });
});
