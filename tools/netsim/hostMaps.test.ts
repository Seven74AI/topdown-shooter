import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, loadBalance } from "@topdown/shared";
import { NetSession } from "../../apps/client/src/net/session";
import { FakeRoom, fakePlayer, fakeState } from "../../apps/client/src/net/fakeRoom";
import { NetSimHost } from "../../apps/client/src/sim/NetSimHost";
import { LocalSimHost } from "../../apps/client/src/sim/LocalSimHost";
import { RunController } from "../../apps/server/src/run/RunController";

/**
 * Story 4.1 (brief line 2): every copy of the World that a real run uses holds the same Downtown
 * map object: the server's RunController, solo's LocalSimHost, the online mirror (NetSimHost) and
 * its Predictor. (`runHeadless` defaults to it too; bots/sims.)
 */
const balance = loadBalance();

describe("every host runs Downtown (Story 4.1)", () => {
  it("server, solo, the online mirror and the predictor share DOWNTOWN_MAP", () => {
    const server = new RunController({ balance, seed: 1, players: [{ playerId: "p0", slot: 0 }] });
    const solo = new LocalSimHost({ balance, seed: 1 });
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 24, y: 16 })]));
    const online = new NetSimHost({ balance, session: new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {}), now: () => 0 });
    for (const m of [server.world.map, solo.world.map, online.world.map, online.predictor.map]) expect(m).toBe(DOWNTOWN_MAP);
    expect(DOWNTOWN_MAP.solids.length).toBeGreaterThan(0);
  });
});
