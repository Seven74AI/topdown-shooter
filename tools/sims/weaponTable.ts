/**
 * Epic 5 balance pass: a weapon value table straight from the balance JSON (no sim): per weapon and
 * upgrade level, the money to own it, hits to kill each zombie type, single-target kill rate against
 * Walkers (burst and sustained, reloads included) and sustained damage per second per 100 money.
 * Area weapons (pellets, pierce, arcs, cones, blasts) are noted, not modelled: their crowd value
 * comes from the bot runs in `docs/balance/epic-5-balance-pass.md`.
 *
 *   npx tsx tools/sims/weaponTable.ts [--json]
 */
import { loadBalance, upgradePrice, weaponDamage, weaponIds, weaponStats } from "@topdown/shared";

const b = loadBalance();
const types = Object.keys(b.zombies.types);
const rows: Record<string, unknown>[] = [];
for (const id of weaponIds(b)) {
  const s = weaponStats(b, id) as unknown as Record<string, number | string | undefined>;
  for (let level = 1; level <= b.shop.upgrades.maxLevel; level++) {
    const dmg = weaponDamage(b, id, level);
    const kind = s.kind as string;
    const pellets = (s.pellets as number | undefined) ?? 1;
    // Hits per second while attacking, and the share of time spent attacking (reloads / fuel).
    let hitsPerS: number;
    let duty = 1;
    if (kind === "flame") {
      hitsPerS = 1 / (s.pulseS as number);
      duty = (s.fuelS as number) / ((s.fuelS as number) + (s.reloadS as number));
    } else {
      hitsPerS = s.rateHz as number;
      if (s.magazine !== undefined) {
        const magS = (s.magazine as number) / (s.rateHz as number);
        duty = magS / (magS + (s.reloadS as number));
      }
    }
    // Single target: a shotgun puts every pellet in at point blank.
    const perHit = dmg * pellets;
    const hitsToKill: Record<string, number> = {};
    for (const t of types) hitsToKill[t] = Math.ceil((b.zombies.types[t]?.hp ?? 1) / perHit - 1e-9);
    const walkerBurst = hitsPerS / (hitsToKill.walker as number);
    const sustainedDps = perHit * hitsPerS * duty;
    const owned = (s.price as number) + (level - 1) * upgradePrice(b, id);
    rows.push({
      weapon: id,
      level,
      damage: Math.round(dmg * 100) / 100,
      owned,
      hitsToKill,
      walkerKillsPerS: Math.round(walkerBurst * 100) / 100,
      walkerKillsPerSSustained: Math.round(walkerBurst * duty * 100) / 100,
      sustainedDps: Math.round(sustainedDps * 10) / 10,
      dpsPer100: owned > 0 ? Math.round((sustainedDps / owned) * 1000) / 10 : null,
      area:
        kind === "melee"
          ? `arc ${s.arcDeg}° × ${s.rangeM} m`
          : kind === "flame"
            ? `cone ${s.coneDeg}° × ${s.rangeM} m, every zombie in it`
            : kind === "launcher"
              ? `blast ${s.blastRadiusM} m`
              : pellets > 1
                ? `${pellets} pellets, ${s.spreadDeg}°, ${s.rangeM} m`
                : (s.pierce as number) > 1
                  ? `pierces ${s.pierce}`
                  : `single, ${s.rangeM} m`,
    });
  }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows));
else {
  console.log(`weapon            L  dmg    owned  hits to kill (${types.join("/")})   walker kills/s burst|sust  sust DPS  DPS/100$  area`);
  for (const r of rows) {
    const h = r.hitsToKill as Record<string, number>;
    console.log(
      `${String(r.weapon).padEnd(17)} ${r.level}  ${String(r.damage).padEnd(6)} ${String(r.owned).padEnd(6)} ${types.map((t) => h[t]).join("/").padEnd(34)} ${String(r.walkerKillsPerS).padStart(5)} | ${String(r.walkerKillsPerSSustained).padEnd(14)} ${String(r.sustainedDps).padEnd(9)} ${String(r.dpsPer100 ?? "-").padEnd(9)} ${r.area}`,
    );
  }
}
