import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, type Balance } from "../config/balance";
import { TICK_DT_S, ZOMBIE_SLOT_HOLD_TICKS } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { NO_SYSTEMS, PREDICTION_SYSTEMS } from "../core/systems";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { applyZombieDamage } from "../combat/damage";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { addPlayer, removePlayer } from "../player/player";
import { endWave, skipWave } from "../waves/waveDirector";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { MAX_DAMAGERS, earn, payKill, recordDamager, spendMoney } from "./economy";

const balance = loadBalance();
/** One mechanic at a time (Epic 1 lesson): no wave director unless the test is about waves. */
const NO_WAVES = { waves: () => {} };
const WALKER_REWARD = balance.zombies.types.walker?.reward ?? -1;

function setup(ids: readonly string[] = ["p0", "p1", "p2"], opts: { b?: Balance; systems?: object | null } = {}) {
  const systems = opts.systems === undefined ? NO_WAVES : opts.systems;
  const world = createWorld({ balance: opts.b ?? balance, seed: 11, ...(systems ? { systems } : {}) });
  // Far from each other and from the zombies (no contact damage, no revives by accident).
  ids.forEach((id, i) => addPlayer(world, id, 4 + i * 6, 4));
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const wallet = (world: World, id: string) => world.players.get(id)?.wallet;
const earned = (world: World, id: string) => world.players.get(id)?.earned;
const money = (events: readonly SimEvent[]) =>
  events.filter((e): e is Extract<SimEvent, { type: "money.earned" }> => e.type === "money.earned").map((e) => [e.playerId, e.amount, e.reason]);
/** A Walker far from everyone. */
const walker = (world: World) => spawnZombie(world, "walker", 40, 28);
const hit = (world: World, id: number, by: string | null, amount = 1) => applyZombieDamage(world, id, amount, 1, 0, 0, by, "pistol");

describe("wallets (FR12)", () => {
  it("every player starts with economy.startingWallet (100) and nothing earned", () => {
    const { world } = setup();
    expect(balance.economy.startingWallet).toBe(100);
    for (const id of ["p0", "p1", "p2"]) {
      expect(wallet(world, id)).toBe(100);
      expect(earned(world, id)).toBe(0);
    }
  });

  it("reads the start from balance", () => {
    const b = loadBalance(withOverrides(bundledBalanceFiles(), [["economy", "startingWallet", 150]]));
    const { world } = setup(["p0"], { b });
    expect(wallet(world, "p0")).toBe(150);
  });
});

describe("kill and assist (FR45)", () => {
  it("the killer gets the type's reward (Walker 2) through the real combat path", () => {
    const { world, events } = setup(["p0"]);
    const p0 = world.players.get("p0");
    if (!p0) throw new Error("no p0");
    const id = spawnZombie(world, "walker", p0.x + 3, p0.y);
    for (let seq = 1; seq < 200 && world.zombies.aliveCount > 0; seq++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq, aimX: 1, aimY: 0, fire: true });
      step(world, TICK_DT_S);
    }
    expect(world.zombies.aliveCount).toBe(0);
    expect(events.some((e) => e.type === "zombie.killed" && e.zombieId === id && e.killerId === "p0")).toBe(true);
    expect(WALKER_REWARD).toBe(2);
    expect(wallet(world, "p0")).toBe(102);
    expect(earned(world, "p0")).toBe(2);
    expect(money(events)).toEqual([["p0", 2, "kill"]]);
  });

  it("p0 hits, p1 kills: p1 +2, p0 +1 (50 % rounded down)", () => {
    const { world, events } = setup();
    const id = walker(world);
    hit(world, id, "p0");
    hit(world, id, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p1")).toBe(102);
    expect(wallet(world, "p0")).toBe(101);
    expect(wallet(world, "p2")).toBe(100);
    expect(money(events)).toEqual([
      ["p1", 2, "kill"],
      ["p0", 1, "assist"],
    ]);
  });

  it("the reward comes from the zombie's own type: a Crawler pays 3, assist 1 (review)", () => {
    const { world } = setup();
    const crawlerReward = balance.zombies.types.crawler?.reward ?? -1;
    expect(crawlerReward).toBe(3);
    const id = spawnZombie(world, "crawler", 40, 28);
    hit(world, id, "p0");
    hit(world, id, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p1")).toBe(100 + crawlerReward);
    expect(wallet(world, "p0")).toBe(100 + Math.floor(crawlerReward / 2));
  });

  it("three damagers: the killer gets the reward, each other one the assist; repeated hits count once", () => {
    const { world } = setup(["p0", "p1", "p2", "p3"]);
    const id = walker(world);
    hit(world, id, "p0");
    hit(world, id, "p2");
    hit(world, id, "p0");
    hit(world, id, "p2");
    hit(world, id, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p1")).toBe(102);
    expect(wallet(world, "p0")).toBe(101);
    expect(wallet(world, "p2")).toBe(101);
    expect(wallet(world, "p3")).toBe(100);
  });

  it("a reward of 3 pays 3 to the killer and floor(1.5) = 1 per assist", () => {
    const b = loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "types.walker.reward", 3]]));
    const { world } = setup(["p0", "p1"], { b });
    const id = walker(world);
    hit(world, id, "p0");
    hit(world, id, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p1")).toBe(103);
    expect(wallet(world, "p0")).toBe(101);
  });

  it("the killer alone gets no assist on top of the kill", () => {
    const { world, events } = setup(["p0", "p1"]);
    const id = walker(world);
    hit(world, id, "p0");
    hit(world, id, "p0", 100);
    run(world, 1);
    expect(wallet(world, "p0")).toBe(102);
    expect(money(events)).toEqual([["p0", 2, "kill"]]);
  });

  it("a kill with no killer (dev cheat) pays no one, assists included", () => {
    const { world, events } = setup();
    const id = walker(world);
    hit(world, id, "p0");
    killZombie(world, id, null, "cheat");
    run(world, 1);
    expect(money(events)).toEqual([]);
    expect(world.economy.damagerCount[id]).toBe(0);
  });

  it("a damager who left the run is skipped", () => {
    const { world } = setup();
    const id = walker(world);
    hit(world, id, "p0");
    hit(world, id, "p2");
    removePlayer(world, "p2");
    hit(world, id, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p0")).toBe(101);
    expect(world.players.has("p2")).toBe(false);
  });

  it("a reused slot (new generation) starts with no damagers", () => {
    const { world } = setup();
    const a = walker(world);
    hit(world, a, "p0");
    killZombie(world, a, null, "cheat");
    run(world, ZOMBIE_SLOT_HOLD_TICKS);
    const genA = world.zombies.generation[a];
    // Even a stale entry left on the freed slot is dropped when the slot is reused.
    recordDamager(world, a, "p0");
    const b = walker(world);
    expect(b).toBe(a);
    expect(world.zombies.generation[b]).toBe(((genA as number) + 1) & 0xff);
    expect(world.economy.damagerCount[b]).toBe(0);
    hit(world, b, "p1", 100);
    run(world, 1);
    expect(wallet(world, "p1")).toBe(102);
    expect(wallet(world, "p0")).toBe(100); // no assist from zombie A's hit
  });

  it("remembers at most MAX_DAMAGERS players per zombie", () => {
    const { world } = setup(["p0"]);
    const id = walker(world);
    for (let i = 0; i < MAX_DAMAGERS + 3; i++) recordDamager(world, id, `x${i}`);
    expect(world.economy.damagerCount[id]).toBe(MAX_DAMAGERS);
  });

  it("payKill credits any id with a share (the Story 3.6 building path)", () => {
    const { world } = setup(["p0", "p1"]);
    const id = walker(world);
    hit(world, id, "p1");
    run(world, 1); // the economy records the hit
    payKill(world, id, "p0", balance.economy.buildingKillShare);
    expect(wallet(world, "p0")).toBe(101); // floor(2 × 0.5)
    expect(wallet(world, "p1")).toBe(101);
    expect(world.economy.damagerCount[id]).toBe(0);
  });
});

describe("revive", () => {
  it("the reviver gets +25 when the revive completes (real downed rules); the revived nothing", () => {
    const { world, events } = setup(["p0", "p1"]);
    const p0 = world.players.get("p0");
    const p1 = world.players.get("p1");
    if (!p0 || !p1) throw new Error("players");
    downPlayer(world, p0);
    p1.x = p1.prevX = p0.x + 1;
    p1.y = p1.prevY = p0.y;
    run(world, ticksFor(balance.player.reviveS) - 1);
    expect(wallet(world, "p1")).toBe(100);
    run(world, 1);
    expect(p0.status).toBe("alive");
    expect(balance.economy.reviveReward).toBe(25);
    expect(wallet(world, "p1")).toBe(125);
    expect(wallet(world, "p0")).toBe(100);
    expect(money(events)).toEqual([["p1", 25, "revive"]]);
  });
});

describe("wave-clear bonus", () => {
  it("wave N ends: 10 × N to every player, downed and out included", () => {
    const { world, events } = setup();
    const [p0, p1, p2] = ["p0", "p1", "p2"].map((id) => world.players.get(id));
    if (!p0 || !p1 || !p2) throw new Error("players");
    p1.status = "downed";
    p2.status = "out";
    world.waves.number = 3;
    world.waves.phase = "active";
    endWave(world);
    run(world, 1);
    for (const id of ["p0", "p1", "p2"]) expect(wallet(world, id)).toBe(130);
    expect(money(events)).toEqual([
      ["p0", 30, "wave"],
      ["p1", 30, "wave"],
      ["p2", 30, "wave"],
    ]);
  });

  it("the real wave director clearing wave 1 pays +10 (and the kills)", () => {
    const b = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "zombiesPerWave", 3]]));
    const { world, events } = setup(["p0", "p1"], { b, systems: null });
    for (let i = 0; i < 400 && world.waves.number === 0; i++) run(world, 1);
    expect(world.waves.number).toBe(1);
    for (let i = 0; i < 200 && world.waves.phase === "active"; i++) {
      for (let k = world.zombies.aliveCount - 1; k >= 0; k--) hit(world, world.zombies.aliveIds[k] as number, "p0", 100);
      run(world, 1);
    }
    expect(world.waves.phase).toBe("pause");
    expect(wallet(world, "p0")).toBe(100 + 3 * 2 + 10);
    expect(wallet(world, "p1")).toBe(110);
    expect(money(events).filter((m) => m[2] === "wave")).toEqual([
      ["p0", 10, "wave"],
      ["p1", 10, "wave"],
    ]);
  });

  it("a wave ended between steps (skipWave cheat) is paid at the next step, once", () => {
    const { world, events } = setup(["p0"]);
    world.waves.number = 2;
    world.waves.phase = "active";
    walker(world);
    skipWave(world);
    expect(wallet(world, "p0")).toBe(100);
    run(world, 3);
    expect(wallet(world, "p0")).toBe(120);
    expect(money(events)).toEqual([["p0", 20, "wave"]]);
  });
});

describe("spending (for Stories 3.3, 3.4, 3.7)", () => {
  it("returns the wallet left; errors change nothing; earned never drops", () => {
    const { world } = setup(["p0"]);
    earn(world, "p0", 50, "kill");
    expect(spendMoney(world, "p0", 120)).toEqual({ ok: true, value: 30 });
    expect(wallet(world, "p0")).toBe(30);
    expect(earned(world, "p0")).toBe(50);
    expect(spendMoney(world, "p0", 31)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(spendMoney(world, "p0", -1)).toEqual({ ok: false, error: "invalid_amount" });
    expect(spendMoney(world, "p0", 1.5)).toEqual({ ok: false, error: "invalid_amount" });
    expect(spendMoney(world, "nobody", 1)).toEqual({ ok: false, error: "unknown_player" });
    expect(wallet(world, "p0")).toBe(30);
    expect(spendMoney(world, "p0", 30)).toEqual({ ok: true, value: 0 });
  });

  it("earn ignores unknown players and amounts ≤ 0", () => {
    const { world, events } = setup(["p0"]);
    earn(world, "nobody", 5, "kill");
    earn(world, "p0", 0, "assist");
    run(world, 1);
    expect(money(events)).toEqual([]);
    expect(wallet(world, "p0")).toBe(100);
  });
});

describe("determinism and authority", () => {
  it("snapshotWorld covers wallets, earned and damagers", () => {
    const make = () => {
      const { world } = setup();
      const a = walker(world);
      const b = spawnZombie(world, "walker", 44, 28);
      hit(world, a, "p0");
      hit(world, b, "p2");
      hit(world, a, "p1", 100);
      run(world, 1);
      return { world, b };
    };
    const one = make();
    const two = make();
    const snap = snapshotWorld(one.world);
    expect(snap).toEqual(snapshotWorld(two.world));
    expect(snap.economy.damagers).toEqual([[one.b, "p2"]]);
    const p1 = snap.players.find(([id]) => id === "p1")?.[1];
    expect(p1?.wallet).toBe(102);
    expect(p1?.earned).toBe(2);
    one.world.economy.damagerCount[one.b] = 0;
    expect(snapshotWorld(one.world)).not.toEqual(snapshotWorld(two.world));
  });

  it("the client's NO_SYSTEMS / PREDICTION_SYSTEMS worlds never change a wallet", () => {
    for (const systems of [NO_SYSTEMS, PREDICTION_SYSTEMS]) {
      const { world } = setup(["p0", "p1"], { systems });
      const id = walker(world);
      hit(world, id, "p0");
      hit(world, id, "p1", 100);
      world.waves.number = 1;
      world.waves.phase = "active";
      endWave(world);
      run(world, 2);
      expect(wallet(world, "p0")).toBe(100);
      expect(wallet(world, "p1")).toBe(100);
    }
  });
});
