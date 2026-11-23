import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import { NET_EVENT_KIND, NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, consumableIndex, loadBalance, startWave, type NetEvent, type NetEventContext, type PlayerInput, type SimEvent } from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";

/**
 * Story 5.12 (AC 8, brief line 11): what consumables add to each client's `sim.events_flushed`. A
 * use is one `consumable.used` (HUD/sound); a throw adds its `grenade.launched` (the launcher's tuple
 * + 1 B for the item); a hand grenade's blast one `explosion.happened` (kind 3); a molotov's fire one
 * `molotov.ignited` (the client draws the zone for its life: no zone state). Measured as the tick
 * message's bytes minus the same message without those tuples (the hits, kills and damage they
 * cause are counted with the weapons, as for 5.5), plus the schema fields `consumable` /
 * `consumableCount` (on a purchase or a use only: a few bytes per use).
 */
const balance = loadBalance();

const isConsumableTuple = (t: NetEvent): boolean =>
  t[0] === NET_EVENT_KIND.CONSUMABLE_USED ||
  t[0] === NET_EVENT_KIND.MOLOTOV_IGNITED ||
  (t[0] === NET_EVENT_KIND.GRENADE_LAUNCHED && t.length > 9) ||
  (t[0] === NET_EVENT_KIND.EXPLOSION_HAPPENED && t[1] === 3);

function measure(plan: (tick: number, slot: number) => string | null, seconds: number, players = 4) {
  const ps = Array.from({ length: players }, (_, slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 12, players: ps, systems: { waves: () => {} }, map: PLACEHOLDER_MAP });
  const w = c.world;
  w.debug.godMode = true;
  startWave(w);
  let k = 0;
  for (const p of w.players.values()) {
    p.x = 10 + (k % 2) * 20;
    p.y = 8 + Math.floor(k / 2) * 16;
    k++;
  }
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((w.zombies.generation[id] ?? 0) << 8) };
  const interest = new EventInterest();
  let bytes = 0;
  let peak = 0;
  let tuples = 0;
  const kinds = new Map<string, number>();
  const without: NetEvent[] = [];
  const ticks = Math.round(seconds / TICK_DT_S);
  for (let t = 1; t <= ticks; t++) {
    for (let i = 0; i < players; i++) {
      const item = plan(t, i);
      const p = w.players.get(`p${i}`);
      if (!p) continue;
      if (item !== null && p.consumableCount === 0) {
        p.consumable = item;
        p.consumableCount = balance.consumables.items[item]?.pack ?? 1;
        if (item === "medkit") p.hp = 10;
      }
      const a = i * 1.7 + t * 0.01;
      const inp: PlayerInput = { ...NEUTRAL_INPUT, seq: t, aimX: Math.cos(a), aimY: Math.sin(a), isMouse: true, consumable: item !== null };
      c.queueInput(`p${i}`, inp);
    }
    const events = c.tick() as readonly SimEvent[];
    for (const e of events) if (e.type === "consumable.used" || e.type === "molotov.ignited") kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);
    interest.prepare(w, events, ctx);
    const mine = interest.eventsFor(w, 24, 16); // one client's view (every consumable event is global)
    if (mine.length === 0) continue;
    without.length = 0;
    for (const tu of mine) {
      if (isConsumableTuple(tu)) tuples++;
      else without.push(tu);
    }
    const all = pack({ tick: w.tick, events: mine }).length;
    const rest = without.length > 0 ? pack({ tick: w.tick, events: without }).length : 0;
    bytes += all - rest;
    peak = Math.max(peak, all - rest);
  }
  return { bps: bytes / seconds, bytes, peak, tuples, used: kinds.get("consumable.used") ?? 0, ignited: kinds.get("molotov.ignited") ?? 0 };
}

describe("consumable bandwidth (Story 5.12, brief line 11)", () => {
  it("one grenade, one molotov, and 4 players throwing everything in 2 s: a few bytes per use; the schema slot changes on a use only", () => {
    const one = (item: string) => (t: number, slot: number) => (slot === 0 && t === 1 ? item : null);
    const g = measure(one("grenades"), 2, 1);
    const m = measure(one("molotovs"), 5, 1);
    // 4 players, each 3 grenades + 2 molotovs + 1 medkit in 2 s (the 10-tick cooldown between uses)
    const all = measure((t) => {
      if (t > 40) return null;
      const n = Math.floor((t - 1) / 10);
      return t % 10 === 1 ? (["grenades", "molotovs", "grenades", "molotovs"][n] as string) : null;
    }, 6);
    console.log(
      `[consumable bandwidth] grenade ${g.bytes} B (${g.tuples} tuples); molotov ${m.bytes} B (${m.tuples} tuples); ` +
        `4 players × 4 throws in 2 s (refilled when empty): ${all.bytes} B (${all.used} uses, ${all.ignited} molotov zones), ${(all.bytes / 2).toFixed(0)} B/s over those 2 s, worst tick ${all.peak} B; ` +
        `schema: 2 uint8 fields on change only (index ${consumableIndex(balance, "molotovs")}, count)`,
    );
    expect(g.used).toBe(1); // liveness
    expect(g.tuples).toBe(3); // used + launched + blast
    expect(m.ignited).toBe(1);
    expect(m.tuples).toBe(3); // used + launched + ignited
    expect(g.bytes).toBeLessThan(64);
    expect(m.bytes).toBeLessThan(64);
    expect(all.used).toBe(16);
    expect(all.bytes / 2).toBeLessThan(500); // a burst of 16 throws in 2 s, far under the 30 KB/s budget
  });
});
