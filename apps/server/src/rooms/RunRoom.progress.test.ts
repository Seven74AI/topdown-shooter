import { randomBytes, randomUUID } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import {
  BYTES,
  C2S,
  DOWNTOWN_MAP,
  NET_PROTOCOL_VERSION,
  PROGRESSION,
  RUN_ROOM_NAME,
  S2C,
  STARTER_ONLY,
  downPlayer,
  giveCrateWeapon,
  runRewardsSchema,
  unlockMask,
  type RunRewards,
  type RunStateView,
  type ShopOffered,
} from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signTicket } from "../auth/ticket";
import { roomProgressRepo } from "../auth/roomAccounts";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/**
 * Stories 7.4 (K2, K7, K8; D3, D4) and 7.5 (T2, T4, T5) in a real room on PGlite: progress is read when the host taps
 * Start (an unlock or a Training level bought in the lobby counts, one bought mid-run doesn't), a failed read plays
 * with the starter pool, the borrowed card names its lender, and `run.rewards` carries the supply-drop unlock line.
 */
const SECRET = "progress-secret-".padEnd(48, "p");
let colyseus: ColyseusTestServer;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SECRET }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;
const hex = (): string => randomBytes(16).toString("hex");
const repo = () => progressRepo(database);

async function newAccount(supplies = 0): Promise<string> {
  const id = (await accountsRepo(database).createGuest(randomBytes(32).toString("hex"), "")).id;
  if (supplies > 0) await repo().addSupplies(randomUUID(), id, () => ({ supplies, breakdown: {} }));
  return id;
}
const options = (intent: "create" | "join", name: string, accountId: string | null, guestToken = hex()) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken,
  ...(accountId ? { ticket: signTicket(accountId, hashGuestToken(guestToken), SECRET) } : {}),
});

interface Inbox {
  offers: ShopOffered[];
  rewards: RunRewards[];
}
function listen(c: RunSdkRoom): Inbox {
  const box: Inbox = { offers: [], rewards: [] };
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.RUN_JOINED, S2C.RUN_STARTED]) c.onMessage(t, () => {});
  c.onMessage(S2C.SHOP_OFFERED, (m: ShopOffered) => box.offers.push(m));
  c.onMessage(S2C.RUN_REWARDS, (m: unknown) => box.rewards.push(runRewardsSchema.parse(m)));
  return box;
}

/** Ana (host) and Mo join the lobby and tap Ready; `beforeStart` runs in the lobby (e.g. buying), then Start. */
async function start(accounts: (string | null)[], beforeStart: (room: RunRoom) => Promise<void> = async () => {}) {
  const names = ["Ana", "Mo"];
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", names[0] as string, accounts[0] ?? null));
  const clients = [host];
  const inbox = [listen(host)];
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  room.bankRetryMs = 20;
  for (let i = 1; i < accounts.length; i++) {
    const c = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", names[i] as string, accounts[i] ?? null));
    inbox.push(listen(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  await beforeStart(room);
  host.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(room.state.phase).toBe("build"), { timeout: 5000 });
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return { clients, inbox, room, w };
}
const pid = (room: RunRoom, c: RunSdkRoom) => room.members.get(c.sessionId)?.playerId ?? "";

describe("Stories 7.4 + 7.5: the run starts with what the server has at Start", () => {
  it("K8 + T5: an unlock and a Training level bought in the LOBBY count; the teammate without them starts at starter / 0; the schema carries both", async () => {
    const [ana, mo] = [await newAccount(1000), await newAccount()];
    const { clients, room, w } = await start([ana, mo], async () => {
      expect((await repo().unlock(ana, "chainsaw", 300)).outcome).toBe("unlocked");
      expect((await repo().train(ana, "max_hp", 1, 50, 5)).outcome).toBe("trained");
      expect((await repo().train(ana, "start_money", 1, 50, 5)).outcome).toBe("trained");
    });
    const a = w.players.get(pid(room, clients[0]!))!;
    const m = w.players.get(pid(room, clients[1]!))!;
    expect(a.unlocks).toBe(unlockMask(PROGRESSION, ["chainsaw"]));
    expect([a.trainHp, a.maxHp, a.trainMoney, a.wallet]).toEqual([1, 102, 1, serverBalance.economy.startingWallet + 10]);
    expect([m.unlocks, m.trainHp, m.maxHp]).toEqual([STARTER_ONLY, 0, 100]);
    await vi.waitFor(() => {
      const s = room.state.players.get(a.id);
      expect([s?.unlocks, s?.trainHp, s?.trainMoney, s?.maxHp]).toEqual([a.unlocks, 1, 1, 102]);
    });
  });

  it("T5: a Training level bought DURING the run (a second device) is not applied until the next Start", async () => {
    const ana = await newAccount(500);
    const { room, w, clients } = await start([ana]);
    expect((await repo().train(ana, "max_hp", 1, 50, 5)).outcome).toBe("trained");
    await new Promise((r) => setTimeout(r, 100));
    expect(w.players.get(pid(room, clients[0]!))!.maxHp).toBe(100);
  });

  it("decision 7.4 D3: the progress read fails at Start → the run starts anyway with the starter pool and Training 0 (logged)", async () => {
    const ana = await newAccount(1000);
    await repo().unlock(ana, "chainsaw", 300);
    const r = roomProgressRepo();
    if (!r) throw new Error("no room repo");
    const get = vi.spyOn(r, "get").mockRejectedValue(new Error("down"));
    let warn: ReturnType<typeof vi.spyOn> | null = null;
    const { room, w, clients } = await start([ana], async (rm) => {
      warn = vi.spyOn(rm.log, "warn");
    });
    const p = w.players.get(pid(room, clients[0]!))!;
    expect([p.unlocks, p.trainHp]).toEqual([STARTER_ONLY, 0]);
    expect(get).toHaveBeenCalledWith(ana);
    expect(warn).toHaveBeenCalledWith({ playerId: p.id }, "run_progress_read_failed");
  });

  it("K2 + AC 5: Mo (starter) gets one card borrowed from Ana's unlocks, named \"Ana\" in shop.offered", async () => {
    const all = PROGRESSION.unlocks.map((u) => u.id);
    const ana = await newAccount(100_000);
    for (const u of PROGRESSION.unlocks) await repo().unlock(ana, u.id, u.price);
    const { inbox, room, clients } = await start([ana, null]);
    await vi.waitFor(() => expect(inbox[1]!.offers.length).toBeGreaterThan(0));
    const o = inbox[1]!.offers.at(-1)!;
    expect(o.borrowed).not.toBe(0);
    expect(o.lenderName).toBe("Ana");
    expect(o.lender).toBe(room.members.get(clients[0]!.sessionId)?.slot);
    const own = inbox[0]!.offers.at(-1)!;
    expect(own.borrowed).toBe(0); // Ana has everything: nothing to borrow
    expect(all.length).toBeGreaterThan(10);
  });

  it("K7 + decision 7.4 D4: a supply-drop Grenade Launcher to a starter player → run.rewards says \"unlock it for 500\"", async () => {
    const mo = await newAccount();
    const { inbox, room, w, clients } = await start([mo]);
    const id = pid(room, clients[0]!);
    expect(giveCrateWeapon(w, id, "grenade_launcher", 1)).toBeGreaterThanOrEqual(0);
    for (const p of w.players.values()) downPlayer(w, p);
    w.run.phase = "wave";
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(inbox[0]!.rewards.length).toBe(1), { timeout: 5000 });
    expect(inbox[0]!.rewards[0]!.lockedUsed).toEqual({ unlockId: "grenade_launcher", name: "Grenade Launcher", price: 500 });
  });
});
