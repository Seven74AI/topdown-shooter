import { LOOT_BAG, type World } from "@topdown/shared";

/**
 * Story 7.12 (AC 6, B4): what the loot bag looks like this frame, from the World's `loot` record
 * (solo: the real World; online: the mirror, copied from the room's `lootBag*` record) and the
 * host's server tick. Tick-based (the glint pulses from the bag's drop tick); no allocation.
 *
 * - Shown while the record says OUT and the server tick is before its `untilTick` (everyone hides
 *   it at the same tick, B4; a late Game scene / woken tab draws it from the record as it is).
 * - The glint: one flash of `glint.flashTicks` every `glint.periodTicks`, counted from the drop tick.
 * - The ground ring breathes with the same period (alpha `ringAlpha` × 0.6–1).
 * - `left` = the share of its 20 s still to go (the off-screen badge's ring, OA2).
 */
export interface LootBagLook {
  visible: boolean;
  x: number;
  y: number;
  variant: number;
  /** 0 … 1: the glint's strength this frame (0 = off). */
  glint: number;
  ringAlpha: number;
  /** 1 at the drop … 0 at `untilTick`. */
  left: number;
}

export const createLootBagLook = (): LootBagLook => ({ visible: false, x: 0, y: 0, variant: 0, glint: 0, ringAlpha: 0, left: 0 });

export function lootBagLook(world: Readonly<World>, serverTick: number, out: LootBagLook): LootBagLook {
  const l = world.loot;
  const cfg = world.balance.loot;
  out.visible = l.state === LOOT_BAG.OUT && serverTick < l.untilTick;
  if (!out.visible) {
    out.glint = 0;
    out.ringAlpha = 0;
    out.left = 0;
    return out;
  }
  out.x = l.x;
  out.y = l.y;
  out.variant = Math.max(0, Math.min(cfg.variants - 1, l.variant | 0));
  const age = Math.max(0, serverTick - l.dropTick);
  const period = cfg.glint.periodTicks;
  const phase = age % period;
  const flash = cfg.glint.flashTicks;
  out.glint = phase < flash ? Math.sin((phase / flash) * Math.PI) : 0;
  out.ringAlpha = cfg.glint.ringAlpha * (0.8 + 0.2 * Math.cos((phase / period) * Math.PI * 2));
  out.left = Math.max(0, Math.min(1, (l.untilTick - serverTick) / cfg.bagTicks));
  return out;
}
