import { quantizeHeading, type PlayerState as SimPlayer } from "@topdown/shared";
import type { RunController } from "../../run/RunController";
import type { PlayerState, RunState } from "./RunState";

/**
 * Copies the World into room state once per tick (Story 2.4), right after `controller.tick()`.
 * A field is assigned only when its value changed, so an idle player costs no patch bytes. Every
 * patch carries `tick` with the players' `x`, `y` and `ackSeq` of that same tick (the room patches
 * between ticks, never inside one).
 */
export function syncState(state: RunState, controller: RunController): void {
  const world = controller.world;
  pass.state = state;
  pass.controller = controller;
  pass.alive = 0;
  world.players.forEach(visitPlayer); // a module-level callback: no closure per tick
  const alive = pass.alive;
  pass.state = null;
  pass.controller = null;
  if (state.tick !== world.tick) state.tick = world.tick;
  if (state.wave !== world.waves.number) state.wave = world.waves.number;
  if (state.remaining !== world.waves.remaining) state.remaining = world.waves.remaining;
  if (state.aliveCount !== alive) state.aliveCount = alive;
}

/** The sync pass in progress (synchronous, so one shared record is enough). */
const pass: { state: RunState | null; controller: RunController | null; alive: number } = { state: null, controller: null, alive: 0 };

function visitPlayer(p: SimPlayer): void {
  if (p.status === "alive") pass.alive++;
  const s = pass.state?.players.get(p.id);
  if (s && pass.controller) syncPlayer(s, p, pass.controller.ackSeq(p.id));
}

function syncPlayer(s: PlayerState, p: SimPlayer, ackSeq: number): void {
  // float32 on the wire: compare rounded, so sub-float32 drift never counts as a change.
  const x = Math.fround(p.x);
  const y = Math.fround(p.y);
  if (s.x !== x) s.x = x;
  if (s.y !== y) s.y = y;
  const heading = quantizeHeading(p.facingX, p.facingY);
  if (s.heading !== heading) s.heading = heading;
  const hp = Math.ceil(p.hp);
  if (s.hp !== hp) s.hp = hp;
  const maxHp = Math.ceil(p.maxHp);
  if (s.maxHp !== maxHp) s.maxHp = maxHp;
  if (s.status !== p.status) s.status = p.status;
  if (s.ackSeq !== ackSeq) s.ackSeq = ackSeq;
  const lo = p.loadout;
  if (s.active !== lo.active) s.active = lo.active;
  if (s.swapTicks !== lo.swapTicks) s.swapTicks = lo.swapTicks;
  const a = lo.slots[0];
  if (s.weapon0 !== a.weapon) s.weapon0 = a.weapon;
  if (s.ammo0 !== a.ammo) s.ammo0 = a.ammo;
  if (s.reloadTicks0 !== a.reloadTicks) s.reloadTicks0 = a.reloadTicks;
  const b = lo.slots[1];
  const weapon1 = b ? b.weapon : "";
  const ammo1 = b ? b.ammo : 0;
  const reload1 = b ? b.reloadTicks : 0;
  if (s.weapon1 !== weapon1) s.weapon1 = weapon1;
  if (s.ammo1 !== ammo1) s.ammo1 = ammo1;
  if (s.reloadTicks1 !== reload1) s.reloadTicks1 = reload1;
}
