import { describe, expect, it } from "vitest";
import {
  BEAR_TRAP_STATE,
  BOSS_STATE,
  BYTES,
  HORDE_MAX_FRAME_BYTES,
  ZOMBIE_STATE,
  hordeFrameBytes,
  loadBalance,
  packTypeState,
  wireState,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
} from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState, type FakeBuilding } from "../net/fakeRoom";
import { NetSimHost, RENDER_DELAY_TICKS } from "../sim/NetSimHost";
import { AcidFx } from "./acidFx";
import { MolotovFires } from "./molotovFx";
import { ClientStatusSources, STATUS, StatusModel, type BodyStatus } from "./statusModel";

/**
 * Story 9.22 (AC 3, T2): the online model on the REAL NetSimHost mirror (a fake room's synced state and horde frames):
 * the fields the model reads are the ones the host copies (status, downed and revive, slow, protection; the horde's
 * burning bit; a bear trap's synced jaws; the boss record). The derivation rules themselves are measured against the
 * server in `statusModel.probe.test.ts`.
 */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(
    fakeState([
      fakePlayer(0, { x: 10, y: 10, status: "downed", downedTicksLeft: 300, reviveProgress: 128, reviveNeed: 60 }),
      fakePlayer(1, { x: 20, y: 10, slowTicks: 12, slowPct: 30, protectTicks: 40 }),
    ]),
  );
  let now = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  const spit = balance.zombies.types.spitter?.spit;
  const src = new ClientStatusSources(balance, new MolotovFires(balance).areas, new AcidFx(4, 4, spit?.speedMps ?? 1, spit?.puddleS ?? 1));
  const model = new StatusModel(balance, host.world.zombies.capacity);
  return { room, host, src, model, setNow: (ms: number) => (now = ms) };
}

const scratch = new Uint8Array(HORDE_MAX_FRAME_BYTES);
const view = new DataView(scratch.buffer);
function frame(tick: number, zs: { netId: number; x: number; y: number; burning: boolean }[]): Uint8Array {
  writeHordeHeader(view, tick, zs.length);
  zs.forEach((z, i) => writeHordeRecord(view, i, z.netId, z.x, z.y, 0, packTypeState(0, wireState(ZOMBIE_STATE.CHASE, z.burning))));
  return scratch.slice(0, hordeFrameBytes(zs.length));
}

const rec = (m: StatusModel, id: string): BodyStatus => {
  for (let i = 0; i < m.playerCount; i++) if (m.players[i]?.id === id) return m.players[i] as BodyStatus;
  throw new Error(`no ${id}`);
};

describe("status model on the NetSimHost mirror (Story 9.22 AC 3)", () => {
  it("survivors from the synced fields; a burning zombie from the horde bit; a trapped one from the synced jaws; the boss's stun", () => {
    const { room, host, src, model, setNow } = setup();
    const A = zombieNetId(3, 1);
    const B = zombieNetId(4, 1);
    const trap: FakeBuilding = { type: "bear_trap", owner: "p0", gx: 60, gy: 60, rot: 0, hp: 100, trap: BEAR_TRAP_STATE.ARMED };
    room.state.buildings.set("7", trap); // centre (30.5, 30.5)
    for (let t = 10; t <= 14; t++) {
      setNow(500 + t * 50);
      room.deliver(BYTES.HORDE_FRAME, frame(t, [{ netId: A, x: 5, y: 5, burning: true }, { netId: B, x: 30.55, y: 30.5, burning: false }]));
      room.state.tick = t;
      if (t === 12) trap.trap = BEAR_TRAP_STATE.HOLDING;
      if (t === 12) {
        room.state.boss.state = BOSS_STATE.STUN;
        room.state.boss.maxHp = room.state.boss.hp = 6000;
      }
      room.patch();
      host.update(0);
      model.update(host.world, src); // every frame, as the scene does
    }
    setNow(500 + (14 + RENDER_DELAY_TICKS) * 50);
    host.update(0);
    model.update(host.world, src);
    const p0 = rec(model, "p0");
    expect(p0.mask).toBe(1 << STATUS.DOWNED);
    expect(p0.left[STATUS.DOWNED]).toBe(300);
    expect(p0.reviveNeed).toBe(60);
    expect(p0.reviveTicks).toBe(30); // 128 / 255 of 60
    const p1 = rec(model, "p1");
    expect(p1.has(STATUS.SLOWED)).toBe(true);
    expect(p1.left[STATUS.SLOWED]).toBe(12);
    expect(p1.has(STATUS.PROTECTED)).toBe(true);
    expect(p1.left[STATUS.PROTECTED]).toBe(40);
    expect(host.world.zombies.aliveCount).toBe(2);
    expect(model.zHas(3, STATUS.BURNING)).toBe(true);
    expect(model.zHas(4, STATUS.BURNING)).toBe(false);
    expect(model.zHas(4, STATUS.TRAPPED), "the zombie on the plate of the HOLDING trap").toBe(true);
    expect(host.world.tick).toBe(14);
    expect(model.zLeft[4 * 8 + STATUS.TRAPPED]).toBe(60 - 2); // counted from the patch it turned HOLDING (tick 12)
    expect(model.zHas(3, STATUS.TRAPPED)).toBe(false);
    expect(model.boss.has(STATUS.STUNNED)).toBe(true);
    // The trap springs: TRAPPED off on the next patch.
    trap.trap = BEAR_TRAP_STATE.SPRUNG;
    room.state.tick = 15;
    room.patch();
    host.update(0);
    model.update(host.world, src);
    expect(model.zHas(4, STATUS.TRAPPED)).toBe(false);
  });
});
