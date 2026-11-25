import { randomBytes } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, DEFAULT_LOOK, downPlayer, MILESTONE_IDS, createRngFromState, milestonePartKey, worldDigest, DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, decodeLook, encodeLook, catalogueParts, type RunStateView } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signTicket } from "../auth/ticket";
import { accountsRepo } from "../db/accountsRepo";
import { setProgressListsForTest } from "../db/testQueries";
import { type Database, openPglite } from "../db/client";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";
import { roomProgressRepo } from "../auth/roomAccounts";

/**
 * Story 7.7 (AC 3–5; R2–R5) and Story 7.11 (AC 2) in a real room with a PGlite database: each member's saved progress
 * is loaded at join (never awaited by the join) — its districts open the lobby's picker, its owned parts keep the
 * milestone / loot parts of the look it asked for. The host's pick: refused from a non-host, outside the lobby and for
 * "coming soon" District 2 (v1); the pick goes back to Downtown when its last holder leaves (R3), with a notice.
 */
const SECRET = "district-secret-".padEnd(48, "d");
let colyseus: ColyseusTestServer;
let database: Database;
beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SECRET, checkTicketRows: false })); // 7.6 B21: made-up accounts (no device rows)
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
async function newAccount(districts: string[] = [], cosmetics: string[] = []): Promise<string> {
  const id = (await accountsRepo(database).createGuest(randomBytes(32).toString("hex"), "")).id;
  await setProgressListsForTest(database, id, districts, cosmetics);
  return id;
}
const options = (intent: "create" | "join", name: string, accountId: string | null, look?: unknown) => {
  const guestToken = hex();
  return {
    intent,
    name,
    balanceVersion: serverBalance.version,
    mapVersion: DOWNTOWN_MAP.version,
    netProtocolVersion: NET_PROTOCOL_VERSION,
    guestToken,
    ...(accountId ? { ticket: signTicket(accountId, hashGuestToken(guestToken), SECRET) } : {}),
    ...(look === undefined ? {} : { look }),
  };
};
function quiet(c: RunSdkRoom): string[] {
  const resets: string[] = [];
  for (const t of [S2C.RUN_JOINED, S2C.PLAYER_LEFT]) c.onMessage(t, () => {});
  c.onMessage(S2C.LOBBY_DISTRICT_RESET, (m: { from: string }) => resets.push(m.from));
  return resets;
}

describe("Story 7.7: the lobby district picker (server)", () => {
  it("R2: the open mask is the union of the members' districts (loaded at join); R3: the last holder leaves → back to Downtown + notice", async () => {
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Newbie", await newAccount()));
    const resets = quiet(host);
    await host.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b01));
    const vet = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Vet", await newAccount(["district_2"])));
    quiet(vet);
    await vet.waitForInitialState();
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b11));
    // R5: in v1 District 2 is "coming soon": the host's pick is refused (logged), Downtown stays
    const info = vi.spyOn(room.log, "info");
    host.send(C2S.LOBBY_DISTRICT, { id: "district_2" });
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "coming_soon" }), "district_pick_refused"));
    expect(room.state.district).toBe("downtown");
    // R3 with a pick a playable progression would allow (set as the pick handler would): the veteran leaves
    room.state.district = "district_2";
    await vet.leave();
    await vi.waitFor(() => expect(room.state.district).toBe("downtown"));
    expect(room.state.districtsOpen).toBe(0b01);
    await vi.waitFor(() => expect(resets).toEqual(["district_2"]));
  });

  it("R4: a non-host's pick, an unknown id and a pick mid-run are refused or ignored; Start always plays Downtown (AC 5)", async () => {
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Host", null));
    quiet(host);
    await host.waitForInitialState();
    const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Guest", await newAccount(["district_2"])));
    quiet(guest);
    await guest.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b11));
    const info = vi.spyOn(room.log, "info");
    guest.send(C2S.LOBBY_DISTRICT, { id: "downtown" });
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "not_host" }), "district_pick_refused"));
    host.send(C2S.LOBBY_DISTRICT, { id: "moon" });
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "unknown" }), "district_pick_refused"));
    for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
    host.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    expect(room.controller?.world.map.name).toBe("downtown");
    info.mockClear();
    host.send(C2S.LOBBY_DISTRICT, { id: "district_2" });
    await new Promise((r) => setTimeout(r, 100));
    expect(info).not.toHaveBeenCalledWith(expect.anything(), "district_pick_refused"); // ignored outside the lobby
    expect(room.state.district).toBe("downtown");
  });

  it("review M3: a holder who leaves mid-run no longer opens the district; after lobby.return the members' progress is read again", async () => {
    const hostAcct = await newAccount();
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Host", hostAcct));
    const resets = quiet(host);
    await host.waitForInitialState();
    const vet = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Vet", await newAccount(["district_2"])));
    quiet(vet);
    await vet.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b11));
    room.state.district = "district_2"; // as a playable progression's pick would set it
    for (const c of [host, vet]) c.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
    host.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    const w = room.controller!.world;
    await vet.leave(); // mid-run: R3 must still hold when the room is back in the lobby
    await vi.waitFor(() => expect(room.members.size).toBe(1));
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(room.state.phase).toBe("lobby"));
    await vi.waitFor(() => expect(resets).toEqual(["district_2"]));
    expect(room.state.district).toBe("downtown");
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b01));
    // this run's grant (written by the bank) shows in the next lobby: the host now has District 2
    await setProgressListsForTest(database, hostAcct, ["district_2"], []);
    room.state.phase = "results";
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b11));
  });
});

describe("Story 7.11 AC 2: owned milestone parts survive the join's look check", () => {
  it("an account that owns the riot helmet keeps it in its look (after the progress load); one that doesn't gets the default head", async () => {
    const riotLook = encodeLook({ ...DEFAULT_LOOK, head: "riot" });
    const owner = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Owner", await newAccount([], ["head:riot"]), riotLook));
    quiet(owner);
    await owner.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(owner.roomId) as unknown as RunRoom;
    const other = await colyseus.sdk.joinById<RunStateView>(owner.roomId, options("join", "Other", await newAccount(), riotLook));
    quiet(other);
    await other.waitForInitialState();
    const headOf = (playerId: string) => decodeLook(room.state.players.get(playerId)?.look ?? "", catalogueParts()).look.head;
    await vi.waitFor(() => expect(headOf("p0")).toBe("riot"));
    await new Promise((r) => setTimeout(r, 100));
    expect(headOf("p1")).toBe(DEFAULT_LOOK.head);
  });
});

describe("Stories 7.10 + 7.11 / 7.12: lobby.set_look wears the account's owned parts", () => {
  it("after the progress load: an owned milestone part and an owned loot part stay; an unowned one is the default part", async () => {
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Owner", await newAccount([], ["head:riot", "pack:cat"])));
    quiet(host);
    await host.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b01)); // progress loaded
    const worn = encodeLook({ ...DEFAULT_LOOK, head: "riot", pack: "cat" });
    host.send(C2S.LOBBY_SET_LOOK, { look: worn });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.look).toBe(worn));
    host.send(C2S.LOBBY_SET_LOOK, { look: encodeLook({ ...DEFAULT_LOOK, head: "laurel" }) });
    await vi.waitFor(() => expect(room.state.players.get("p0")?.look).toBe(encodeLook(DEFAULT_LOOK)));
  });

  it("a set_look that arrives before the progress load is re-checked with the owned parts (it wins over the join's look)", async () => {
    const repo = roomProgressRepo()!;
    const realGet = repo.get.bind(repo);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(repo, "get").mockImplementation(async (id: string) => {
      await gate;
      return realGet(id);
    });
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Owner", await newAccount([], ["head:riot"]), encodeLook(DEFAULT_LOOK)));
    quiet(host);
    await host.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    const worn = encodeLook({ ...DEFAULT_LOOK, head: "riot" });
    host.send(C2S.LOBBY_SET_LOOK, { look: worn });
    await new Promise((r) => setTimeout(r, 100));
    expect(room.state.players.get("p0")?.look).toBe(encodeLook(DEFAULT_LOOK)); // not owned yet as far as the room knows
    release();
    await vi.waitFor(() => expect(room.state.players.get("p0")?.look).toBe(worn));
  });
});

describe("review L9 (7.11 M-F6): milestone parts are cosmetic only", () => {
  const saved = process.env.DEV_ALLOW_RUN_SEED;
  afterEach(() => {
    if (saved === undefined) delete process.env.DEV_ALLOW_RUN_SEED;
    else process.env.DEV_ALLOW_RUN_SEED = saved;
  });

  it("same seed, one run wearing every milestone part, one the default look → the same World digest at the same tick", async () => {
    process.env.DEV_ALLOW_RUN_SEED = "1";
    const parts = MILESTONE_IDS.map((id) => milestonePartKey(id));
    const worn = encodeLook({ ...DEFAULT_LOOK, head: "laurel", top: "camo", pack: "golf" });
    const solo = async (accountId: string, look: string) => {
      const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, { ...options("create", "Ana", accountId, look), devRunSeed: 5150 });
      quiet(host);
      for (const t of [S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.SHOP_OFFERED]) host.onMessage(t, () => {});
      host.onMessage("*", () => {});
      await host.waitForInitialState();
      const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
      await vi.waitFor(() => expect(room.state.districtsOpen).toBe(0b01)); // progress loaded (the look re-checked)
      host.send(C2S.LOBBY_SET_READY, { ready: true });
      await vi.waitFor(() => expect(room.state.players.get("p0")?.ready).toBe(true));
      host.send(C2S.RUN_START, {});
      await vi.waitFor(() => expect(room.state.phase).toBe("build"));
      (room as unknown as { onTick: () => void }).onTick = () => {}; // the test steps the World from here
      return room;
    };
    const a = await solo(await newAccount([], parts), worn);
    const b = await solo(await newAccount(), encodeLook(DEFAULT_LOOK));
    expect(a.state.players.get("p0")?.look).toBe(worn); // liveness: the parts really are worn (owned)
    expect(b.state.players.get("p0")?.look).not.toBe(worn);
    const ca = a.controller!;
    const cb = b.controller!;
    expect(ca.world.seed).toBe(cb.world.seed);
    // the one per-run random input besides the seed: the server-only loot salt (its stream and the plan it made) — the same for both
    Object.assign(cb.world.loot.plan, ca.world.loot.plan);
    Object.assign(cb.world.loot, { salt: ca.world.loot.salt, killIndex: ca.world.loot.killIndex });
    (cb.world.streams as { loot: unknown }).loot = createRngFromState(ca.world.streams.loot.getState());
    expect(worldDigest(ca.world)).toEqual(worldDigest(cb.world)); // tick 0: only the look differs between the rooms
    const t = ca.world.tick + 1600; // 80 s: the build phase and into wave 1
    while (ca.world.tick < t) ca.tick();
    while (cb.world.tick < t) cb.tick();
    expect(ca.world.waves.number).toBeGreaterThanOrEqual(1); // liveness: a wave was played
    expect(worldDigest(ca.world)).toEqual(worldDigest(cb.world));
  });
});
