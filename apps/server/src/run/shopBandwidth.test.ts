import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import { PLACEHOLDER_MAP, cardCatalog, loadBalance, type ShopOffered } from "@topdown/shared";
import { RunController } from "./RunController";

/**
 * Story 5.13 (brief line 11): `shop.offered` is a direct message to its owner (never room state).
 * Measured as the msgpack body (what Colyseus sends after its 1-byte type + the type name); the
 * longest card ids are forced to get the worst case. A busy build (3 buys + 3 rerolls + the
 * build-start offer = 7 messages) per player per 30 s build; nothing in waves.
 */
const balance = loadBalance();
const FRAMING_B = 2 + "shop.offered".length; // protocol byte + string-type header

describe("shop bandwidth (Story 5.13)", () => {
  it("shop.offered ≤ 200 B per message, ≤ 12 per player per build; prints B/s", () => {
    const longest = [...cardCatalog(balance)].sort((a, b) => b.id.length - a.id.length).slice(0, 6).map((c) => c.id);
    const c = new RunController({ balance, seed: 5, players: [{ playerId: "p0", slot: 0 }], systems: { waves: () => {} }, map: PLACEHOLDER_MAP, shopCards: longest });
    const p = c.world.players.get("p0");
    if (!p) throw new Error("no player");
    p.wallet = 10_000;
    let messages = 0;
    let bytes = 0;
    let biggest = 0;
    const send = () => {
      const o = c.offerFor("p0");
      if (!o) throw new Error("no offer");
      const msg: ShopOffered = { build: o.build, rev: o.rev, cards: [...o.cards], sold: o.sold, rerollPrice: o.rerollPrice, canReroll: o.canReroll };
      const n = pack(msg).length + FRAMING_B;
      messages++;
      bytes += n;
      biggest = Math.max(biggest, n);
    };
    send(); // build start
    for (let i = 0; i < 3; i++) {
      const o = c.offerFor("p0");
      if (!o) throw new Error("no offer");
      const card = o.cards.findIndex((id, k) => id !== "" && (o.sold & (1 << k)) === 0 && balance.gear.items[id] !== undefined);
      if (card >= 0 && c.buyCard("p0", o.build, o.rev, card, o.cards[card] as string, null).ok) send();
      const o2 = c.offerFor("p0");
      if (o2 && c.reroll("p0", o2.build, o2.rev).ok) send();
    }
    expect(messages).toBeGreaterThanOrEqual(5); // liveness: buys and rerolls really sent offers
    expect(messages).toBeLessThanOrEqual(12);
    expect(biggest).toBeLessThanOrEqual(200);
    const bps = bytes / balance.waves.buildPhaseS;
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[shop bandwidth] ${messages} offers, biggest ${biggest} B, ${bytes} B per build ≈ ${bps.toFixed(1)} B/s per player in a build phase (0 in waves)`);
    expect(bps).toBeLessThan(100);
  });
});
