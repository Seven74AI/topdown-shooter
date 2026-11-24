import { cardCatalog, type Balance } from "@topdown/shared";

const statCache = new WeakMap<Balance, Readonly<Record<string, string>>>();
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * Story 5.13 (AC 9): one stat line per card item, from balance (no second copy of a number):
 * Shotgun "8 × 4 dmg · 5 m", SMG "8 dmg · 12/s", Machete "30 dmg melee", Flamethrower "6 m flame",
 * Grenade Launcher "40 blast · 2 m"; gear its effect ("+25 max HP", "+10 % speed", "Revive in 1.5 s").
 * Cached per balance (built at shop open, never per frame).
 */
export function cardStatLines(balance: Balance): Readonly<Record<string, string>> {
  let out = statCache.get(balance);
  if (out) return out;
  const lines: Record<string, string> = {};
  for (const c of cardCatalog(balance)) {
    if (c.kind === "weapon") {
      const w = balance.weapons[c.id] as unknown as { kind: string; damage: number; pellets?: number; rateHz?: number; rangeM?: number; blastRadiusM?: number };
      if (w.kind === "melee") lines[c.id] = `${num(w.damage)} dmg melee`;
      else if (w.kind === "flame") lines[c.id] = `${num(w.rangeM ?? 0)} m flame`;
      else if (w.kind === "launcher") lines[c.id] = `${num(w.damage)} blast · ${num(w.blastRadiusM ?? 0)} m`;
      else if ((w.pellets ?? 1) > 1) lines[c.id] = `${w.pellets} × ${num(w.damage)} dmg · ${num(w.rangeM ?? 0)} m`;
      else lines[c.id] = `${num(w.damage)} dmg · ${num(w.rateHz ?? 0)}/s`;
    } else {
      const g = balance.gear.items[c.id];
      if (!g) continue;
      lines[c.id] = g.maxHpBonus ? `+${g.maxHpBonus} max HP` : g.speedBonusPct ? `+${g.speedBonusPct} % speed` : g.reviveS ? `Revive in ${num(g.reviveS)} s` : "";
    }
  }
  out = Object.freeze(lines);
  statCache.set(balance, out);
  return out;
}
