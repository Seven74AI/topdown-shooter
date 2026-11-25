import { describe, expect, it } from "vitest";
import { RECONNECT, SeatRecovery, Watchdog, configureReconnection, shouldRescueReload, type RecoveryJoin } from "./reconnect";

describe("Story 8.1 configureReconnection (AC 4, F7)", () => {
  it("turns the SDK's offline queue off and retries for the whole hold", () => {
    const r = { enabled: false, maxRetries: 15, minDelay: 100, maxDelay: 5000, maxEnqueuedMessages: 10 };
    configureReconnection(r);
    expect(r).toEqual({ enabled: true, maxRetries: 40, minDelay: 500, maxDelay: 3000, maxEnqueuedMessages: 0 });
    expect(r.maxRetries * r.maxDelay).toBeGreaterThanOrEqual(120_000);
  });
});

describe("Story 8.1 Watchdog (AC 5)", () => {
  it("fires once at 3 s of silence (stateful 1 ms sweep), not before; re-armed by the next message", () => {
    const w = new Watchdog();
    expect(w.fired(10_000)).toBe(false); // disarmed before the first message
    w.heard(1000);
    let firedAt = -1;
    let fires = 0;
    for (let t = 1000; t <= 9000; t++) {
      if (w.fired(t)) {
        fires++;
        if (firedAt < 0) firedAt = t;
      }
    }
    expect(firedAt).toBe(1000 + RECONNECT.watchdogMs + 1);
    expect(fires).toBe(1);
    w.heard(9500);
    expect(w.fired(12_500)).toBe(false);
    expect(w.fired(12_501)).toBe(true);
  });

  it("horde frames every 50 ms (with the lossy line's 400 ms stalls) never fire it", () => {
    const w = new Watchdog();
    let fires = 0;
    for (let t = 0; t < 60_000; t += 50) {
      if (t % 5000 < 400 && t > 0) continue; // a 400 ms stall every 5 s
      w.heard(t);
      if (w.fired(t + 49)) fires++;
    }
    expect(fires).toBe(0);
  });

  it("disarm() stops it (lobby, results, reconnecting)", () => {
    const w = new Watchdog();
    w.heard(0);
    w.disarm();
    expect(w.fired(10_000)).toBe(false);
  });
});

/** A fake clock and scheduler. */
function fakeTime() {
  let now = 0;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) {
      const t = { at: now + ms, fn, dead: false };
      timers.push(t);
      return () => (t.dead = true);
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        await Promise.resolve();
        await Promise.resolve();
        const next = timers.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        next.dead = true;
        now = next.at;
        next.fn();
      }
      now = end;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("Story 8.1 SeatRecovery (AC 6, 9)", () => {
  it("retries a cut line every second and takes the seat back on the first attempt that gets through", async () => {
    const time = fakeTime();
    const answers: RecoveryJoin<string>[] = [{ ok: false, reason: "network" }, { ok: false, reason: "network" }, { ok: true, room: "R2" }];
    const got: string[] = [];
    const rec = new SeatRecovery<string>({
      join: async () => answers.shift() ?? { ok: false, reason: "network" },
      onRecovered: (r) => got.push(r),
      onSeatKept: () => got.push("kept"),
      onGone: () => got.push("gone"),
      now: time.now,
      schedule: time.schedule,
    });
    rec.start();
    rec.start(); // idempotent
    await time.advance(2500);
    expect(got).toEqual(["R2"]);
    expect(rec.attempts).toBe(3);
    expect(rec.active).toBe(false);
  });

  it("seat_kept: tells the phone every time and asks again every 3 s until the build phase lets it in", async () => {
    const time = fakeTime();
    let n = 0;
    const got: string[] = [];
    const rec = new SeatRecovery<string>({
      join: async () => (++n < 4 ? { ok: false, reason: "seat_kept" } : { ok: true, room: "R" }),
      onRecovered: (r) => got.push(r),
      onSeatKept: () => got.push("kept"),
      onGone: () => got.push("gone"),
      now: time.now,
      schedule: time.schedule,
    });
    rec.start();
    await time.advance(10_000);
    expect(got).toEqual(["kept", "kept", "kept", "R"]);
  });

  it("gone (run over / not found) stops at once; a network failure past the give-up time too", async () => {
    const time = fakeTime();
    const got: string[] = [];
    const deps = {
      onRecovered: () => got.push("ok"),
      onSeatKept: () => got.push("kept"),
      onGone: () => got.push("gone"),
      now: time.now,
      schedule: time.schedule,
    };
    new SeatRecovery<string>({ ...deps, join: async () => ({ ok: false, reason: "gone" }) }).start();
    await time.advance(10);
    expect(got).toEqual(["gone"]);
    const rec = new SeatRecovery<string>({ ...deps, join: async () => ({ ok: false, reason: "network" }) });
    rec.start();
    await time.advance(RECONNECT.giveUpMs + 2000);
    expect(got).toEqual(["gone", "gone"]);
  });

  it("cancel() (the token reconnect won, or Leave) stops it; a late success is handed to onLate", async () => {
    const time = fakeTime();
    let release: (r: RecoveryJoin<string>) => void = () => {};
    const late: string[] = [];
    const got: string[] = [];
    const rec = new SeatRecovery<string>(
      {
        join: () => new Promise((res) => (release = res)),
        onRecovered: (r) => got.push(r),
        onSeatKept: () => got.push("kept"),
        onGone: () => got.push("gone"),
        now: time.now,
        schedule: time.schedule,
      },
      (r) => late.push(r),
    );
    rec.start();
    rec.cancel();
    release({ ok: true, room: "R" });
    await time.advance(10);
    expect(got).toEqual([]);
    expect(late).toEqual(["R"]);
  });
});

describe("Story 8.1 shouldRescueReload (AC 7, D6)", () => {
  it("reloads only after > 10 s hidden and 5 s shown while still reconnecting", () => {
    expect(shouldRescueReload(10_001, 5000, true)).toBe(true);
    expect(shouldRescueReload(10_000, 5000, true)).toBe(false);
    expect(shouldRescueReload(30_000, 4999, true)).toBe(false);
    expect(shouldRescueReload(30_000, 6000, false)).toBe(false);
  });
});

describe("Story 8.1 SeatRecovery: one attempt at a time (a cut line holds the request)", () => {
  it("a hung attempt is never timed out or doubled: it answers when the line is whole and the seat is back at once", async () => {
    const time = fakeTime();
    const releases: ((r: RecoveryJoin<string>) => void)[] = [];
    const got: string[] = [];
    const rec = new SeatRecovery<string>({
      join: () => new Promise((res) => releases.push(res)),
      onRecovered: (r) => got.push(r),
      onSeatKept: () => got.push("kept"),
      onGone: () => got.push("gone"),
      now: time.now,
      schedule: time.schedule,
    });
    rec.start();
    await time.advance(20_000);
    expect(releases).toHaveLength(1);
    expect(rec.inFlight).toBe(true);
    releases[0]?.({ ok: true, room: "R" });
    await time.advance(1);
    expect(got).toEqual(["R"]);
    expect(rec.inFlight).toBe(false);
  });
});
