/**
 * Story 6.11 review fixes (M1, L6; brief 14, 17, 30).
 *
 * M1: a 20-tap burst (extract/stay alternating at 60 fps, ending on Stay) goes through the client's
 * `VoteSender` to a REAL room (`bootTestServer`, the `this.net.guard` bucket), with the bucket nearly
 * empty beforehand and the teammate's vote already in (so the 1 s all-voted hold is running): the
 * server ends up holding Stay and the vote resolves Stay. Without the pacing the last tap is dropped.
 *
 * L6 (D-B): the bot runs into the vote under `?lag=150&jitter=20` on the real `RunController` with the
 * client `Predictor`; once the client sees phase "vote" it sends neutral moves. The server froze at
 * the vote tick, so the client's few predicted steps past it come back as a small smoothed correction:
 * never a snap (< PREDICTION_SNAP_M).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { BYTES, C2S, DOWNTOWN_MAP, NEUTRAL_INPUT, PLACEHOLDER_MAP, RUN_ROOM_NAME, S2C, TICK_DT_S, createRng, loadBalance, skipWave, type PlayerInput, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import { RunRoom, serverBalance } from "../../apps/server/src/rooms/RunRoom";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { PREDICTION_SNAP_M } from "../../apps/client/src/net/netConfig";
import { neutralizeInput, standsStill } from "../../apps/client/src/input/menuInput";
import { VoteSender, pollVote } from "../../apps/client/src/ui/voteModel";

const TICK_MS = TICK_DT_S * 1000;
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
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
const quiet = (c: RunSdkRoom) => {
  for (const t of [S2C.RUN_JOINED, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.SHOP_OFFERED]) c.onMessage(t, () => {});
  c.onMessage(BYTES.HORDE_FRAME, () => {});
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Story 6.11 review M1: a vote flood keeps the last choice", () => {
  /** Two players in a real room, at the vote after wave 10, the buckets refilled. */
  async function toVote() {
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
    quiet(host);
    await host.waitForInitialState();
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
    quiet(guest);
    await guest.waitForInitialState();
    for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
    host.send(C2S.RUN_START, {});
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
    const w = room.controller?.world;
    if (!w) throw new Error("no run");
    w.debug.bossWaves = [];
    w.waves.number = 9;
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(w.run.phase).toBe("wave"));
    skipWave(w);
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("vote"));
    await sleep(1100); // the buckets refill after the joins and Ready taps
    const hostId = room.members.get(host.sessionId)?.playerId as string;
    return { host, guest, room, w, hostId };
  }

  it("20 taps ending on Stay through VoteSender with the bucket nearly empty → ≤ 4 sends, the server holds Stay; the vote resolves Stay", async () => {
    const { host, guest, w, hostId } = await toVote();
    for (let i = 0; i < 8; i++) host.send(C2S.BUILD_SET_READY, { ready: true }); // other traffic: 2 tokens left (ignored in a vote)
    const sender = new VoteSender();
    const t0 = Date.now();
    sender.poll(10, 0, 0); // the scene polls every frame from the vote's first frame on
    let sends = 0;
    // 20 taps at 60 fps (≈ 333 ms), extract/stay alternating, the last one Stay; then frames go on.
    for (let f = 0; f < 90; f++) {
      if (f < 20) sender.want(f % 2 === 0 ? "extract" : "stay");
      const c = sender.poll(10, host.state.players.get(hostId)?.vote ?? 0, Date.now() - t0);
      if (c) {
        host.send(C2S.EVAC_VOTE, { choice: c });
        sends++;
      }
      await sleep(1000 / 60);
    }
    await vi.waitFor(() => expect(w.players.get(hostId)?.vote).toBe(2)); // the LAST choice
    expect(sends).toBeLessThanOrEqual(4); // paced: a burst of 3, then the newest — not 20
    expect(sends).toBeGreaterThanOrEqual(2);
    guest.send(C2S.EVAC_VOTE, { choice: "stay" });
    await vi.waitFor(() => expect(w.run.phase).not.toBe("vote"), { timeout: 3000 });
    expect(w.run.endless).toBe(true); // resolved Stay: both voted Stay
  }, 20_000);

  it("re-review RM1 / 2: inside the 1 s all-voted hold, with the bucket just drained, a late Extract → sent at once (a borrowed token) and counted", async () => {
    const { host, guest, w, hostId } = await toVote();
    guest.send(C2S.EVAC_VOTE, { choice: "stay" });
    await vi.waitFor(() => expect(w.players.size === 2 && [...w.players.values()].some((p) => p.vote === 2)).toBe(true));
    const sender = new VoteSender();
    const t0 = Date.now();
    const voters = [
      { slot: 0, vote: 0, standing: true, mine: true },
      { slot: 1, vote: 2, standing: true, mine: false },
    ];
    // The scene's exact step (pollVote: urgent from the ticks left and the voters), my view of the server.
    const frame = (): void => {
      voters[0]!.vote = w.players.get(hostId)?.vote ?? 0;
      const c = pollVote(sender, 10, voters[0]!.vote, Date.now() - t0, w.run.voteTicksLeft, 20, voters, 2);
      if (c) host.send(C2S.EVAC_VOTE, { choice: c });
    };
    frame();
    sender.want("extract");
    frame();
    await vi.waitFor(() => expect(w.players.get(hostId)?.vote).toBe(1)); // everyone in: the 1 s hold runs
    await vi.waitFor(() => expect(w.run.voteTicksLeft).toBeLessThanOrEqual(12), { timeout: 2000, interval: 5 });
    for (const c of ["stay", "extract", "stay"] as const) {
      sender.want(c); // three quick changes: the bucket is empty after them
      frame();
      await sleep(1000 / 60);
    }
    await sleep(270 - 2 * (1000 / 60)); // past the 250 ms urgent gap, before a token refills (333 ms)
    sender.want("extract"); // only the urgent borrow can send it now
    const before = w.run.voteTicksLeft;
    frame();
    expect(before).toBeGreaterThan(0);
    await vi.waitFor(() => expect(w.run.phase).not.toBe("vote"), { timeout: 3000 });
    expect(w.run.ending).toBe("extracted"); // my late Extract counted (1 Stay of 2 is not more than half)
  }, 20_000);
});

describe("Story 6.11 review L6: the Predictor across the vote freeze under ?lag=150&jitter=20", () => {
  it("running into the vote: the correction after the freeze stays smoothed (no snap)", () => {
    const balance = loadBalance();
    const rng = createRng(611);
    const ID = "p0";
    const ctrl = new RunController({ balance, seed: 1, map: PLACEHOLDER_MAP, players: [{ playerId: ID, slot: 0 }] });
    const w = ctrl.world;
    w.debug.bossWaves = [];
    w.debug.godMode = true;
    w.waves.number = 9; // the build before wave 10: its end opens the vote
    const p = w.players.get(ID);
    if (!p) throw new Error("no player");
    ctrl.setBuildReady(ID, true);
    ctrl.tick();
    expect(w.run.phase).toBe("wave");
    const pred = new Predictor(balance, PLACEHOLDER_MAP, ID);
    pred.reconcile(0, p.x, p.y, "alive");
    const inFlight: { due: number; input: PlayerInput }[] = [];
    const states: { due: number; x: number; y: number; ack: number; phase: string }[] = [];
    let seq = 0;
    let clientPhase = "wave";
    let maxAfterVote = 0;
    let reconcilesInVote = 0;
    let settledDrift = 0;
    let snaps0 = -1;
    for (let t = 0; t < 200; t++) {
      const now = t * TICK_MS;
      if (t === 60) skipWave(w); // the wave ends between ticks: the vote opens (the server freezes from its next tick)
      // The client runs left/right; the Game scene's own rule (`standsStill`, re-review N2) neutralizes it in the vote (D-B).
      const input = { ...NEUTRAL_INPUT, seq: ++seq, moveX: Math.sin(t * 0.05) > 0 ? 1 : -1, moveY: 0 } as PlayerInput & { moveX: number; moveY: number; fire: boolean; swap: boolean; consumable: boolean };
      if (standsStill(false, false, clientPhase)) neutralizeInput(input);
      pred.applyLocal(input);
      pred.frame(TICK_DT_S); // the scene decays the visual offset every frame
      inFlight.push({ due: now + 75 + rng.range(-10, 10), input });
      while (inFlight.length > 0 && (inFlight[0] as { due: number }).due <= now) ctrl.queueInput(ID, (inFlight.shift() as { input: PlayerInput }).input);
      ctrl.tick();
      states.push({ due: now + 75 + rng.range(-10, 10), x: p.x, y: p.y, ack: w.lastAppliedSeq.get(ID) ?? 0, phase: w.run.phase });
      while (states.length > 0 && (states[0] as { due: number }).due <= now) {
        const s = states.shift() as (typeof states)[number];
        clientPhase = s.phase;
        pred.reconcile(s.ack, s.x, s.y, "alive");
        if (s.phase === "vote") {
          if (snaps0 < 0) snaps0 = pred.stats.snaps; // counted from the first patch that shows the vote
          reconcilesInVote++;
          maxAfterVote = Math.max(maxAfterVote, pred.stats.lastErrorM);
          // Re-review N2: once settled (40 patches into the vote) the prediction sits on the frozen server position.
          if (reconcilesInVote > 40) settledDrift = Math.max(settledDrift, Math.hypot(pred.x - s.x, pred.y - s.y));
        }
      }
    }
    console.log(`[vote netsim] ${reconcilesInVote} reconciles in the vote, largest correction ${maxAfterVote.toFixed(3)} m (snap at ${PREDICTION_SNAP_M} m)`);
    expect(w.run.phase).toBe("vote");
    expect(reconcilesInVote).toBeGreaterThan(50); // liveness: the client really sat in the vote
    expect(maxAfterVote).toBeGreaterThan(0); // the freeze really cost a correction
    expect(maxAfterVote).toBeLessThan(PREDICTION_SNAP_M);
    expect(pred.stats.snaps).toBe(snaps0);
    expect(settledDrift).toBeLessThan(0.01); // standing still in the vote (the client's own standsStill rule)
  });
});
