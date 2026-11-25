import { describe, expect, it } from "vitest";
import { RECONNECT, type RecoveryJoin } from "@topdown/shared";
import { LinkMonitor, linkStore, type LinkRoom, type LinkStatus } from "./linkMonitor";

/** A fake SDK room: drop / reconnect signals, the reconnection options and a socket to close. */
function fakeRoom() {
  const drops: ((code: number) => void)[] = [];
  const backs: (() => void)[] = [];
  const closes: number[] = [];
  const room: LinkRoom = {
    reconnection: { enabled: false, maxRetries: 15, minDelay: 100, maxDelay: 5000, maxEnqueuedMessages: 10 },
    onDrop: (cb) => drops.push(cb),
    onReconnect: (cb) => backs.push(cb),
    connection: { close: (code?: number) => closes.push(code ?? 0) },
  };
  return { room, drop: () => drops.forEach((f) => f(1006)), back: () => backs.forEach((f) => f()), closes };
}

function setup(join: () => Promise<RecoveryJoin<string>> = async () => ({ ok: false, reason: "network" })) {
  let now = 0;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  const statuses: LinkStatus[] = [];
  const recovered: string[] = [];
  let gone = 0;
  let joins = 0;
  const leftForGood: string[] = [];
  const f = fakeRoom();
  let inRun = true;
  const link = new LinkMonitor<string>(f.room, {
    now: () => now,
    schedule: (fn, ms) => {
      const t = { at: now + ms, fn, dead: false };
      timers.push(t);
      return () => (t.dead = true);
    },
    inRun: () => inRun,
    rejoin: () => {
      joins++;
      return join();
    },
    onRecovered: (r) => recovered.push(r),
    onGone: () => gone++,
    leaveForGood: (r) => leftForGood.push(r),
    onStatus: (s) => statuses.push(s),
  });
  /** Advances the clock in 1 ms steps (stateful sweep), ticking the monitor and firing timers. */
  const advance = async (ms: number, heardEveryMs = 0) => {
    for (let i = 0; i < ms; i++) {
      now++;
      if (heardEveryMs > 0 && now % heardEveryMs === 0) link.heard(now);
      for (const t of timers) if (!t.dead && t.at <= now) {
        t.dead = true;
        t.fn();
      }
      link.tick(now);
      if (i % 50 === 0) await Promise.resolve();
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  return { link, f, statuses, recovered, leftForGood, gone: () => gone, joins: () => joins, advance, setInRun: (v: boolean) => (inRun = v), now: () => now };
}

describe("Story 8.1 LinkMonitor (AC 4–6)", () => {
  it("configures the SDK: offline queue off (F7), retries for the hold", () => {
    const { f } = setup();
    expect(f.room.reconnection).toMatchObject({ enabled: true, maxEnqueuedMessages: 0, minDelay: 500, maxDelay: 3000 });
  });

  it("the watchdog fires at 3 s of silence in a run (1 ms sweep): shows reconnecting and closes the socket itself (non-consented 4010)", async () => {
    const t = setup();
    t.link.heard(0);
    await t.advance(RECONNECT.watchdogMs);
    expect(t.statuses).toEqual([]);
    await t.advance(1);
    expect(t.statuses).toEqual(["reconnecting"]);
    expect(t.f.closes).toEqual([4010]);
    expect(t.link.drops).toBe(1);
  });

  it("messages every 50 ms never fire it; the lobby never fires it", async () => {
    const t = setup();
    t.link.heard(0);
    await t.advance(20_000, 50);
    expect(t.statuses).toEqual([]);
    t.setInRun(false);
    await t.advance(10_000);
    expect(t.statuses).toEqual([]);
  });

  it("an SDK drop + reconnect on the same room: reconnecting → ok, no takeover when it is back within 2 s", async () => {
    const t = setup();
    t.link.heard(0);
    t.f.drop();
    expect(t.statuses).toEqual(["reconnecting"]);
    await t.advance(2000 - 100);
    t.f.back();
    await t.advance(5000, 50);
    expect(t.statuses).toEqual(["reconnecting", "ok"]);
    expect(t.joins()).toBe(0);
    expect(t.link.reconnects).toBe(1);
  });

  it("still down 2 s after the drop (pinned: review L4): the takeover by guest token starts and its room is handed over", async () => {
    let n = 0;
    const t = setup(async () => (++n < 3 ? { ok: false, reason: "network" } : { ok: true, room: "R2" }));
    t.link.heard(0);
    t.f.drop();
    await t.advance(2000 - 1);
    expect(t.joins()).toBe(0);
    await t.advance(1 + 2 * RECONNECT.retryMs + 10);
    expect(t.recovered).toEqual(["R2"]);
    expect(t.statuses).toEqual(["reconnecting", "ok"]);
  });

  it("the SDK gave up (or was refused): takeover at once; seat_kept shows the waiting screen and keeps asking", async () => {
    const t = setup(async () => ({ ok: false, reason: "seat_kept" }));
    t.link.sdkGaveUp();
    await t.advance(10);
    expect(t.statuses).toEqual(["reconnecting", "seat_kept"]);
    await t.advance(RECONNECT.seatRetryMs * 2 + 10);
    expect(t.joins()).toBe(3);
  });

  it("gone: the owner is told (start screen)", async () => {
    const t = setup(async () => ({ ok: false, reason: "gone" }));
    t.link.sdkGaveUp();
    await t.advance(10);
    expect(t.gone()).toBe(1);
  });

  it("a takeover that lands AFTER the token reconnect won is adopted (it holds the seat now: newest wins); after Leave it is left", async () => {
    let release: (r: RecoveryJoin<string>) => void = () => {};
    const t = setup(() => new Promise((res) => (release = res)));
    t.link.heard(0);
    t.f.drop();
    await t.advance(2000 + 5);
    expect(t.link.recoveryInFlight).toBe(true);
    t.f.back(); // the SDK's token reconnect wins first …
    release({ ok: true, room: "late" }); // … then the takeover lands
    await t.advance(5);
    expect(t.recovered).toEqual(["late"]);
    const u = setup(() => new Promise((res) => (release = res)));
    u.link.sdkGaveUp();
    await u.advance(5);
    u.link.close(true); // Leave
    release({ ok: true, room: "late2" });
    await u.advance(5);
    expect(u.recovered).toEqual([]);
    expect(u.leftForGood).toEqual(["late2"]);
  });

  it("close() (Leave during reconnecting) stops every retry", async () => {
    const t = setup();
    t.link.sdkGaveUp();
    await t.advance(10);
    t.link.close();
    const j = t.joins();
    await t.advance(10_000);
    expect(t.joins()).toBe(j);
  });
});

describe("Story 8.1 RR1-N2: only a LATE takeover marks this tab's crossed-takeover window", () => {
  it("a normal recovery leaves lateAdoptedAtMs at −∞; a late adoption sets it", async () => {
    linkStore.lateAdoptedAtMs = Number.NEGATIVE_INFINITY;
    const t = setup(async () => ({ ok: true, room: "R" }));
    t.link.sdkGaveUp();
    await t.advance(5);
    expect(t.recovered).toEqual(["R"]);
    expect(linkStore.lateAdoptedAtMs).toBe(Number.NEGATIVE_INFINITY);
    let release: (r: RecoveryJoin<string>) => void = () => {};
    const u = setup(() => new Promise((res) => (release = res)));
    u.link.heard(0);
    u.f.drop();
    await u.advance(2000 + 5);
    u.f.back(); // the token reconnect wins first …
    release({ ok: true, room: "late" }); // … the takeover lands late
    await u.advance(5);
    expect(u.recovered).toEqual(["late"]);
    expect(linkStore.lateAdoptedAtMs).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    linkStore.lateAdoptedAtMs = Number.NEGATIVE_INFINITY;
  });
});
