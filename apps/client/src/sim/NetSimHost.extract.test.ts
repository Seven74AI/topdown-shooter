import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/**
 * Story 12.2 (AC 3, 15; E8-A2 "sent → changed → synced" on the client end): the mirror copies the extract phase, each
 * player's `boarded` and `liftedAtTick` from the room state as is; my survivor is drawn from the server (no prediction)
 * and no input goes out during the extraction.
 */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 14, y: 10 })]));
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost extraction mirror (Story 12.2)", () => {
  it("phase, boarded and liftedAtTick: sent (vote), changed (extract), synced; Results keeps the lift-off", () => {
    const { host, room } = setup();
    room.state.phase = "vote";
    host.update(1 / 60);
    expect(host.world.run.phase).toBe("vote");
    expect(host.world.extract.boarded.size).toBe(0);
    expect(host.world.extract.liftedAtTick).toBe(-1);
    room.state.phase = "extract";
    const p0 = room.state.players.get("p0");
    if (p0) p0.boarded = true;
    host.update(1 / 60);
    expect(host.world.run.phase).toBe("extract");
    expect(host.world.extract.started).toBe(true);
    expect([...host.world.extract.boarded]).toEqual(["p0"]);
    room.state.liftedAtTick = 345;
    if (room.state.players.get("p1")) room.state.players.get("p1")!.boarded = true;
    host.update(1 / 60);
    expect(host.world.extract.liftedAtTick).toBe(345);
    expect([...host.world.extract.boarded].sort()).toEqual(["p0", "p1"]);
    room.state.phase = "results";
    room.state.resultEnding = "extracted";
    host.update(1 / 60);
    expect(host.world.extract.started).toBe(true);
    expect(host.world.extract.liftedAtTick).toBe(345);
  });

  it("AC 3: no input is sent while extracting (and inputs flow again in a later phase)", () => {
    const { host, room } = setup();
    room.state.phase = "vote";
    for (let i = 0; i < 10; i++) host.update(1 / 20);
    const before = room.inputsSent().length;
    expect(before).toBeGreaterThan(0);
    room.state.phase = "extract";
    for (let i = 0; i < 30; i++) host.update(1 / 20);
    expect(room.inputsSent().length).toBe(before);
  });

  it("my survivor follows the server's walk during the extraction (drawn from the interpolation ring like the others)", () => {
    const { host, room } = setup();
    room.state.phase = "vote";
    for (let i = 0; i < 4; i++) host.update(1 / 20);
    room.state.phase = "extract";
    const me = room.state.players.get("p1")!;
    for (let i = 0; i < 40; i++) {
      me.x = 14 + i * 0.2;
      room.state.tick += 1;
      room.patch();
      host.update(1 / 20);
    }
    const p = host.world.players.get("p1")!;
    expect(p.x).toBeGreaterThan(15); // moved with the server's positions (no local input moves it)
  });
});
