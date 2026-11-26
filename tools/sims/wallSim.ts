/**
 * Story 12.1 (AC 14, X4): the 10-wave bot sim's zombie side, before and after a rule change. Mortal
 * headless runs on Downtown (`runHeadless`: bots shop from `bots.json › shoppingList` and build where they
 * stand, round the pad), 1–4 bots × seeds 1–3. Per run: walls placed, wall HP lost during waves, walls
 * broken, zombies reaching a player (distinct zombies that bit one: the stand-in for "zombies through
 * gaps", which isn't measured directly), zombie bites, wiped. Prints a Markdown table.
 *
 *   npx tsx tools/sims/wallSim.ts
 */
import { loadBalance, runHeadless, type World } from "@topdown/shared";

const balance = loadBalance();
const out = (s: string): void => void process.stdout.write(`${s}\n`);
const rows: string[] = [];
const tot = { wallDmg: 0, destroyed: 0, bites: 0, biters: 0, wipes: 0, placed: 0, waves: 0 };
for (const players of [1, 2, 3, 4]) {
  for (const seed of [1, 2, 3]) {
    let wallDmg = 0;
    let destroyed = 0;
    let bites = 0;
    let wave = 0;
    const biters = new Set<string>();
    const hp = new Map<number, number>();
    const onTick = (w: World): void => {
      wave = w.waves.number;
      const seen = new Set<number>();
      for (const b of w.buildings.list) {
        if (!b.solid) continue;
        seen.add(b.id);
        const prev = hp.get(b.id);
        if (prev !== undefined && b.hp < prev && w.run.phase === "wave") wallDmg += prev - b.hp;
        hp.set(b.id, b.hp);
      }
      for (const [id, h] of hp) {
        if (seen.has(id)) continue;
        if (w.run.phase === "wave") {
          wallDmg += h;
          destroyed++;
        }
        hp.delete(id);
      }
    };
    const setup = (w: World): void => {
      w.events.subscribe((e) => {
        if (e.type !== "player.damaged" || e.sourceZombieId < 0) return;
        bites++;
        biters.add(`${wave}:${e.sourceZombieId}`);
      });
    };
    const r = runHeadless({ balance, seed, players, onTick, setup });
    const placed = r.buildingsPlaced.reduce((a, b) => a + b, 0);
    rows.push(`| ${players} | ${seed} | ${r.ending} | ${r.wavesCleared} | ${placed} | ${wallDmg} | ${destroyed} | ${biters.size} | ${bites} | ${r.wiped ? "yes" : "no"} |`);
    tot.wallDmg += wallDmg;
    tot.destroyed += destroyed;
    tot.bites += bites;
    tot.biters += biters.size;
    tot.wipes += r.wiped ? 1 : 0;
    tot.placed += placed;
    tot.waves += r.wavesCleared;
  }
}
out("| bots | seed | ending | waves cleared | walls placed | wall damage taken (HP) | walls broken | zombies reaching a player | zombie bites | wiped |");
out("|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) out(r);
out(`| **all** | 12 runs | | ${tot.waves} | ${tot.placed} | ${tot.wallDmg} | ${tot.destroyed} | ${tot.biters} | ${tot.bites} | ${tot.wipes} |`);
