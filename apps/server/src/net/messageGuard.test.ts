import { describe, expect, it } from "vitest";
import { playerInputSchema, NEUTRAL_INPUT } from "@topdown/shared";
import { MessageGuard } from "./messageGuard";
import { DROP_LOG_INTERVAL_MS, MAX_INPUTS_PER_S, MAX_OTHER_MESSAGES_PER_S } from "./limits";

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
