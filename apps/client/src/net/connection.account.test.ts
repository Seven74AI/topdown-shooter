import { beforeEach, describe, expect, it, vi } from "vitest";

/** Story 7.1 (brief R2): every join path puts a fresh session ticket in the join options. */
const calls: { method: string; options: Record<string, unknown> }[] = [];
const fakeRoom = { roomId: "ABCD", sessionId: "s1", onMessage: () => () => {}, onLeave: () => {}, connection: {} };

vi.mock("@colyseus/sdk", () => ({
  Callbacks: { get: () => ({}) },
  Client: class {
    async create(_name: string, options: Record<string, unknown>) {
      calls.push({ method: "create", options });
      return fakeRoom;
    }
    async joinById(_id: string, options: Record<string, unknown>) {
      calls.push({ method: "joinById", options });
      return fakeRoom;
    }
  },
}));
const ticket = vi.fn<() => Promise<string | undefined>>();
const look = vi.fn<() => string | undefined>(() => undefined);
// Story 7.9: create / join read the ticket and my look from `joinAccount`; seat recovery from `recoveryAccount` (N-R3: reused ticket).
const account = async () => {
  const t = await ticket();
  const l = look();
  return { ...(t === undefined ? {} : { ticket: t }), ...(l === undefined ? {} : { look: l }) };
};
vi.mock("./account", () => ({ joinAccount: () => account(), recoveryAccount: () => account() }));
vi.mock("./netMeter", () => ({ netMeter: { attach: () => {} } }));

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("location", { origin: "http://localhost:5711", search: "", pathname: "/" });
});

describe("connection.ts join options (Story 7.1 AC 5)", () => {
  it("createGame, joinGame and rejoinGame each send the ticket fetched just before", async () => {
    const c = await import("./connection");
    ticket.mockResolvedValue("T1");
    await c.createGame("Ana");
    ticket.mockResolvedValue("T2");
    await c.joinGame("ABCD", "Bo");
    ticket.mockResolvedValue("T3");
    await c.rejoinGame("ABCD", "Bo");
    expect(calls.map((x) => [x.method, x.options.ticket])).toEqual([
      ["create", "T1"],
      ["joinById", "T2"],
      ["joinById", "T3"],
    ]);
    expect(ticket).toHaveBeenCalledTimes(3);
  });

  it("no ticket (save server down): the join goes ahead without the field (P3)", async () => {
    const c = await import("./connection");
    ticket.mockResolvedValue(undefined);
    const r = await c.createGame("Ana");
    expect(r.ok).toBe(true);
    expect(calls[0]?.options).not.toHaveProperty("ticket");
    expect(calls[0]?.options.guestToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("Story 7.9 (AC 5, R2): every join path carries my look; none → no field (the default look)", async () => {
    const c = await import("./connection");
    ticket.mockResolvedValue("T");
    look.mockReturnValue("v1|top:hoodie");
    await c.createGame("Ana");
    await c.joinGame("ABCD", "Bo");
    await c.rejoinGame("ABCD", "Bo");
    expect(calls.map((x) => x.options.look)).toEqual(["v1|top:hoodie", "v1|top:hoodie", "v1|top:hoodie"]);
    look.mockReturnValue(undefined);
    await c.createGame("Ana");
    expect(calls[3]?.options).not.toHaveProperty("look");
  });
});
