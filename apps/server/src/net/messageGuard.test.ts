import { describe, expect, it } from "vitest";
import { playerInputSchema, NEUTRAL_INPUT } from "@topdown/shared";
import { MessageGuard } from "./messageGuard";
import { DROP_LOG_INTERVAL_MS, MAX_GHOST_MESSAGES_PER_S, MAX_INPUTS_PER_S, MAX_OTHER_MESSAGES_PER_S, PING_PER_S } from "./limits";

function setup() {
  let now = 0;
  const warns: { obj: Record<string, unknown>; msg: string }[] = [];
  const guard = new MessageGuard<{ sessionId: string }>(
    () => now,
    { warn: (obj, msg) => warns.push({ obj: obj as Record<string, unknown>, msg }) },
  );
  const client = { sessionId: "s1" };
  guard.add(client, "p0");
  return { guard, client, warns, setNow: (t: number) => (now = t) };
}

describe("MessageGuard", () => {
  it("passes valid messages and drops invalid ones", () => {
    const { guard, client, warns } = setup();
    const seen: number[] = [];
    const h = guard.guard(playerInputSchema, (_c, m) => seen.push(m.seq), "input");
    h(client, { ...NEUTRAL_INPUT, seq: 7 });
    h(client, { ...NEUTRAL_INPUT, seq: -1 });
    h(client, { ...NEUTRAL_INPUT, extra: true });
    h(client, "nope");
    expect(seen).toEqual([7]);
    expect(warns).toEqual([
      { obj: { playerId: "p0", reason: "invalid", dropped: 1 }, msg: "client_message_rejected" },
    ]);
    expect(guard.pending(client)?.invalid).toBe(2);
  });

  it("rate-limits inputs and other types with separate buckets", () => {
    const { guard, client } = setup();
    let inputs = 0;
    let others = 0;
    const hi = guard.guard(playerInputSchema, () => inputs++, "input");
    const ho = guard.guard({ safeParse: (v: unknown) => ({ success: true as const, data: v }) }, () => others++);
    for (let i = 0; i < 40; i++) hi(client, NEUTRAL_INPUT);
    for (let i = 0; i < 40; i++) ho(client, {});
    expect(inputs).toBe(MAX_INPUTS_PER_S);
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S);
  });

  it("Story 5.24 (B1): a ghost flood has its own bucket and never starves the shared one (nor the other way)", () => {
    const { guard, client, setNow } = setup();
    let ghosts = 0;
    let others = 0;
    const any = { safeParse: (v: unknown) => ({ success: true as const, data: v }) };
    const hg = guard.guard(any, () => ghosts++, "ghost");
    const ho = guard.guard(any, () => others++);
    for (let i = 0; i < 100; i++) hg(client, {});
    for (let i = 0; i < 40; i++) ho(client, {});
    expect(ghosts).toBe(MAX_GHOST_MESSAGES_PER_S);
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S);
    setNow(1000); // a second later: the ghost bucket refilled; an empty shared bucket doesn't stop ghosts
    for (let i = 0; i < 40; i++) ho(client, {});
    hg(client, {});
    expect(ghosts).toBe(MAX_GHOST_MESSAGES_PER_S + 1);
  });

  it("Story 8.7 (E8-P5): pings have their own 1/s bucket (burst 1): a flood never eats the shared one, nor the other way", () => {
    const { guard, client, setNow } = setup();
    let pings = 0;
    let others = 0;
    const any = { safeParse: (v: unknown) => ({ success: true as const, data: v }) };
    const hp = guard.guard(any, () => pings++, "ping");
    const ho = guard.guard(any, () => others++);
    expect(PING_PER_S).toBe(1);
    for (let i = 0; i < 50; i++) hp(client, {});
    expect(pings).toBe(1); // burst 1
    for (let i = 0; i < 40; i++) ho(client, {});
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S); // the shared bucket was untouched by 50 pings
    expect(guard.pending(client)?.rate).toBeGreaterThan(0);
    setNow(999);
    hp(client, {});
    expect(pings).toBe(1); // not yet a second
    setNow(1000);
    hp(client, {});
    expect(pings).toBe(2); // an empty shared bucket doesn't stop pings
  });

  it("charges unknown message types against the shared bucket (rate once it is empty)", () => {
    const { guard, client } = setup();
    for (let i = 0; i < 100; i++) guard.unknown(client);
    const p = guard.pending(client);
    expect((p?.unknown_type ?? 0) + (p?.rate ?? 0)).toBeGreaterThan(0);
    expect(p?.rate ?? 0).toBeGreaterThan(0); // burst exhausted: the rest count as rate drops
  });

  it("logs at most one warn per reason per window, with the count", () => {
    const { guard, client, warns, setNow } = setup();
    for (let i = 0; i < 5; i++) guard.drop(client, "unknown_type");
    guard.drop(client, "too_large");
    expect(warns.map((w) => [w.obj.reason, w.obj.dropped])).toEqual([
      ["unknown_type", 1],
      ["too_large", 1],
    ]);
    setNow(DROP_LOG_INTERVAL_MS - 1);
    guard.drop(client, "unknown_type");
    expect(warns).toHaveLength(2);
    setNow(DROP_LOG_INTERVAL_MS);
    guard.drop(client, "unknown_type");
    expect(warns.at(-1)?.obj).toEqual({ playerId: "p0", reason: "unknown_type", dropped: 6 });
  });

  it("flushes unreported drops when the client leaves", () => {
    const { guard, client, warns } = setup();
    guard.drop(client, "rate");
    guard.drop(client, "rate");
    guard.drop(client, "rate");
    guard.remove(client);
    expect(warns.map((w) => w.obj.dropped)).toEqual([1, 2]);
    guard.drop(client, "rate"); // unknown client now: ignored
    expect(warns).toHaveLength(2);
  });
});

describe("Story 8.1 review L2: the guard is the seat's, not the socket's", () => {
  it("a reconnect (same session, add with keep) and a takeover (rename) keep the drained bucket and the drop counters", () => {
    const { guard, client } = setup();
    let others = 0;
    const ho = guard.guard({ safeParse: (v: unknown) => ({ success: true as const, data: v }) }, () => others++);
    for (let i = 0; i < 40; i++) ho(client, {});
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S);
    guard.add(client, "p0", true); // reconnect: same session id
    ho(client, {});
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S); // no refill by reconnecting
    const fresh = { sessionId: "s2" };
    guard.rename("s1", "s2"); // takeover
    ho(fresh, {});
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S);
    expect(guard.pending(fresh)?.rate).toBeGreaterThan(0);
    expect(guard.pending(client)).toBeUndefined();
    guard.add(fresh, "p0"); // a plain add (a first join) still starts afresh
    ho(fresh, {});
    expect(others).toBe(MAX_OTHER_MESSAGES_PER_S + 1);
  });
});
