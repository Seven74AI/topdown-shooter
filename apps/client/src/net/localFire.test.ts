import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  createWorld,
  loadBalance,
  setInput,
  setLoadout,
  step,
  type PlayerInput,
  type PlayerState,
  type WeaponId,
} from "@topdown/shared";
import { LocalFireClock, type FireGateView } from "./localFire";

const balance = loadBalance();

type View = { -readonly [K in keyof FireGateView]: FireGateView[K] };

/** My snapshot as the server would send it after the tick that applied `ackSeq`. */
function viewOf(p: PlayerState, ackSeq: number): View {
  const [a, b] = p.loadout.slots;
  return {
    status: p.status,
    active: p.loadout.active,
    swapTicks: p.loadout.swapTicks,
    ackSeq,
    weapon0: a.weapon,
    weapon1: b?.weapon ?? "",
    ammo0: a.ammo,
    ammo1: b?.ammo ?? 0,
    reloadTicks0: a.reloadTicks,
    reloadTicks1: b?.reloadTicks ?? 0,
  };
}

const fireInput = (seq: number, over: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  seq,
  aimX: 1,
  aimY: 0,
  fire: true,
  isMouse: true,
  ...over,
});

/** The shared World and the clock, input by input, each with the state the server had before the tick. */
function compare(weapons: readonly [WeaponId, WeaponId | null], steps: number, inputAt: (seq: number) => PlayerInput, lagSteps = 0) {
  const world = createWorld({ balance, seed: 7, systems: { waves: () => {}, zombies: () => {} } });
  const p = addPlayer(world, "p0", 5, 16);
  setLoadout(balance, p.loadout, weapons);
  let serverShots = 0;
  world.events.subscribe((e) => {
    if ((e.type === "weapon.fired" || e.type === "melee.swung") && e.playerId === "p0") serverShots++;
  });
  const clock = new LocalFireClock(balance);
  const server: boolean[] = [];
  const local: boolean[] = [];
  const views: View[] = [viewOf(p, 0)];
  for (let seq = 1; seq <= steps; seq++) {
    const input = inputAt(seq);
    // The snapshot the client has: the server state `lagSteps` ticks ago (an RTT behind).
    local.push(clock.step(input, views[Math.max(0, views.length - 1 - lagSteps)]));
    const before = serverShots;
    setInput(world, "p0", input);
    step(world, TICK_DT_S);
    server.push(serverShots > before);
    views.push(viewOf(p, seq));
  }
  return { server, local, clock, p };
}

describe("LocalFireClock (Story 2.7)", () => {
  for (const weapon of ["pistol", "smg", "hunting_rifle", "machete"] as const) {
    it(`fires on exactly the steps the shared World fires over 200 steps: ${weapon}`, () => {
      const { server, local } = compare([weapon, null], 200, (seq) => fireInput(seq));
      expect(server.filter(Boolean).length).toBeGreaterThan(5);
      expect(local).toEqual(server);
    });
  }

  it("predicts my own swap by seq while the snapshot lags (no shot during it, the other weapon after)", () => {
    const clock = new LocalFireClock(balance);
    const v = viewOf(addPlayer(createWorld({ balance, seed: 1 }), "p0", 5, 5), 0);
    v.weapon1 = "smg";
    v.ammo1 = 40;
    const n = Math.round(balance.player.swapS / TICK_DT_S);
    const got: string[] = [];
    for (let seq = 1; seq <= 20; seq++) {
      const fired = clock.step(fireInput(seq, { swap: seq === 5 }), v); // the snapshot never moves
      got.push(fired ? clock.attack.weapon : "-");
    }
    expect(got.slice(4, 4 + n)).toEqual(Array(n).fill("-"));
    expect(got[4 + n]).toBe("smg");
  });

  for (const weapon of ["pistol", "smg", "hunting_rifle"] as const) {
    it(`still fires on exactly the server's steps with a snapshot 8 steps (400 ms) old: ${weapon}`, () => {
      const { server, local } = compare([weapon, null], 300, (seq) => fireInput(seq), 8);
      expect(local).toEqual(server);
    });
  }

  it("matches with a lagging snapshot, the trigger pulsed and swaps", () => {
    const { server, local } = compare(["smg", "hunting_rifle"], 300, (seq) => fireInput(seq, { fire: seq % 23 < 15, swap: seq === 70 || seq === 190 }), 6);
    expect(local).toEqual(server);
  });

  it("a second swap tap soon after the first is replayed like the server does (review MED-1)", () => {
    for (const second of [64, 66, 67, 68, 70]) {
      const { server, local } = compare(["pistol", "smg"], 160, (seq) => fireInput(seq, { swap: seq === 60 || seq === second }), 6);
      expect(local, `second tap on ${second}`).toEqual(server);
    }
  });

  it("swap taps every few steps with a stale snapshot still match", () => {
    const { server, local } = compare(["smg", "hunting_rifle"], 200, (seq) => fireInput(seq, { swap: seq % 9 === 0 && seq < 120 }), 8);
    expect(local).toEqual(server);
  });

  it("matches with the trigger pulsed and a swap in the middle", () => {
    const { server, local } = compare(["smg", "pistol"], 200, (seq) =>
      fireInput(seq, { fire: seq % 17 < 11, swap: seq === 60 || seq === 140 }),
    );
    expect(local).toEqual(server);
  });

  it("stops at predicted ammo 0 while the snapshot lags behind", () => {
    const clock = new LocalFireClock(balance);
    const stale: View = viewOf(addPlayer(createWorld({ balance, seed: 1 }), "p0", 5, 5), 0); // 12 rounds, ack 0
    stale.ammo0 = 5;
    const at: number[] = [];
    for (let seq = 1; seq <= 80; seq++) if (clock.step(fireInput(seq), stale)) at.push(seq);
    // 5 rounds, then the reload the server starts on the emptying shot (1 s = 20 steps), then a full magazine.
    const fifth = at[4] as number;
    const reloadSteps = Math.round((balance.weapons.pistol?.kind === "gun" ? balance.weapons.pistol.reloadS : 0) / TICK_DT_S);
    expect(at[5]).toBe(fifth + reloadSteps + 1);
    expect(clock.predictedAmmo(stale)).toBe(12 - (at.length - 5));
  });

  it("a snapshot with a later ack restores the ammo exactly", () => {
    const clock = new LocalFireClock(balance);
    const v = viewOf(addPlayer(createWorld({ balance, seed: 1 }), "p0", 5, 5), 0);
    v.weapon0 = "smg";
    v.ammo0 = 40;
    for (let seq = 1; seq <= 10; seq++) clock.step(fireInput(seq), v);
    // The SMG fires 12/s at 20 steps/s: 6 shots in 10 steps (seq 1, 3, 4, 6, 8, 9 or similar).
    const fired = 40 - clock.predictedAmmo(v);
    expect(fired).toBe(6);
    // The server applied seq ≤ 6 and fired 4 of them: 36 left; seqs 7–10 are still unacknowledged.
    v.ackSeq = 6;
    v.ammo0 = 36;
    expect(clock.predictedAmmo(v)).toBe(36 - (fired - 4));
  });

  it("does not attack while reloading, swapping, dead, without fire, or without aim", () => {
    const base = viewOf(addPlayer(createWorld({ balance, seed: 1 }), "p0", 5, 5), 0);
    const tries: [Partial<View>, Partial<PlayerInput>][] = [
      [{ reloadTicks0: 5 }, {}],
      [{ swapTicks: 3 }, {}],
      [{ status: "downed" }, {}],
      [{ status: "out" }, {}],
      [{}, { fire: false }],
      [{}, { aimX: 0, aimY: 0 }],
    ];
    for (const [over, inp] of tries) {
      const clock = new LocalFireClock(balance);
      expect(clock.step(fireInput(1, inp), { ...base, ...over })).toBe(false);
    }
    expect(new LocalFireClock(balance).step(fireInput(1), base)).toBe(true);
    expect(new LocalFireClock(balance).step(fireInput(1), undefined)).toBe(false);
  });

  it("reports the raw unit aim of the attack", () => {
    const clock = new LocalFireClock(balance);
    const v = viewOf(addPlayer(createWorld({ balance, seed: 1 }), "p0", 5, 5), 0);
    expect(clock.step(fireInput(1, { aimX: 3, aimY: 4 }), v)).toBe(true);
    expect(clock.attack).toMatchObject({ weapon: "pistol", melee: false, dirX: 0.6, dirY: 0.8 });
  });
});

describe("LocalFireClock.ack (2.7 re-review LOW-A)", () => {
  it("counts my shots on newly acked seqs once, and ignores old or repeated acks", () => {
    const world = createWorld({ balance, seed: 7, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 5, 16);
    const clock = new LocalFireClock(balance);
    const me = viewOf(p, 0);
    let fired = 0;
    for (let seq = 1; seq <= 20; seq++) if (clock.step(fireInput(seq), me)) fired++;
    expect(fired).toBeGreaterThan(1);
    expect(clock.shotsFired).toBe(fired);
    clock.ack(10);
    const at10 = clock.shotsAcked;
    expect(at10).toBeGreaterThan(0);
    clock.ack(10);
    clock.ack(5);
    expect(clock.shotsAcked).toBe(at10);
    clock.ack(20);
    expect(clock.shotsAcked).toBe(fired);
  });
});
