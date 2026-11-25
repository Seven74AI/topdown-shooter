import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stories 7.4 + 7.5 (brief R2: a wiring test per hookup; 7.5 T2 mutations): the lines that connect the tested unlock
 * and Training models to the game, and the source rules (every player-weapon damage read goes through
 * `playerWeaponDamage`, the five reload starts use `reloadSecondsFor`, no team-average Training). Each expectation
 * fails when its line is deleted.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const client = (...p: string[]) => read("apps", "client", "src", ...p);
const server = (...p: string[]) => read("apps", "server", "src", ...p);
const shared = (...p: string[]) => read("packages", "shared", "src", ...p);

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("Story 7.5 source rules (T2)", () => {
  it("every player-weapon damage read goes through playerWeaponDamage (no stray weaponDamage( call outside weapons.ts and the sims' table)", () => {
    const files = tsFiles(join(root, "packages", "shared", "src"));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      if (f.endsWith(join("combat", "weapons.ts"))) continue;
      const calls = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => /(?<![A-Za-z])weaponDamage\(/.test(l) && !l.trim().startsWith("*") && !l.trim().startsWith("//"));
      expect(calls, f).toEqual([]);
    }
    for (const site of ["firing.ts", "flame.ts", "grenades.ts"]) expect(shared("combat", site)).toContain("playerWeaponDamage(world.balance, ");
  });

  it("no team-scaled Training code path exists (designer D6: applied in full, never the team's lowest or average)", () => {
    for (const f of tsFiles(join(root, "packages", "shared", "src"))) {
      const src = readFileSync(f, "utf8");
      expect(/train\w*[^;\n]*\b(teamMin|teamAvg|lowestLevel|teamAverage|minTraining)\b/i.test(src), f).toBe(false);
    }
  });

  it("every reload start in firing.ts uses reloadSecondsFor (5 sites, no raw ticksFor(stats.reloadS))", () => {
    const src = shared("combat", "firing.ts");
    expect(src.includes("ticksFor(stats.reloadS)")).toBe(false);
    expect(src.match(/reloadTicks = ticksFor\(reloadSecondsFor\(p, stats\)\)/g)?.length).toBe(5);
    expect(src.match(/reloadS: reloadSecondsFor\(p, stats\)/g)?.length).toBe(5);
    expect(client("net", "localFire.ts")).toContain("ticksFor(reloadSecondsFor({ trainReload: me.trainReload ?? 0 }, stats))");
    // Review L5: the HUD reload ring divides by the trained reload too; no raw reloadS left in GameScene.
    const g = client("scenes", "GameScene.ts");
    expect(g).toContain("const totalTicks = ticksFor(reloadSecondsFor(player, stats));");
    expect(g.includes("ticksFor(stats.reloadS)")).toBe(false);
  });
});

describe("Stories 7.4 + 7.5 wiring (R2)", () => {
  it("RunRoom reads progress at Start and passes masks + Training to the controller; the controller passes them to addPlayer", () => {
    const room = server("rooms", "RunRoom.ts");
    expect(room).toContain("void this.loadAndStart();");
    expect(room).toMatch(/inits = await loadRunInits\(/);
    expect(room).toContain("const players = runPlayers(Array.from(this.members.values()), inits, devUnlocks.mask, devStartingWallet);");
    expect(room).toContain("const lenderName = o.lender === NO_LENDER ? \"\" : (this.runNames.get(o.lender) ?? \"\");");
    expect(server("run", "RunController.ts")).toContain("addPlayer(this.world, playerId, at.x, at.y, init)");
    expect(server("meta", "banking.ts")).toContain("lockedUsed: p.lockedUsed");
  });

  it("the schema copies (syncState, NetSimHost mirror) carry unlocks and the four Training levels", () => {
    const sync = server("rooms", "schema", "syncState.ts");
    for (const k of ["unlocks", "trainHp", "trainDmg", "trainMoney", "trainReload"]) {
      expect(sync).toContain(`if (s.${k} !== p.${k}) s.${k} = p.${k};`);
      expect(client("sim", "NetSimHost.ts")).toMatch(new RegExp(`p\\.${k} = \\(?s\\.${k} \\?\\? 0`));
    }
  });

  it("GameScene: practice solo starts from my cached progress; the build bar and the shop consumables use my unlocks", () => {
    const g = client("scenes", "GameScene.ts");
    expect(g).toContain("practiceInit(opts, progressStore.get().progress ?? cachedProgress())");
    expect(g.match(/buildBarItems\((host\.)?world\.balance, localUnlocks\(host\)\)/g)?.length).toBe(2);
    expect(g).toContain("consumables: inPoolOnly(shopConsumables(balance), localUnlocks(host))");
    expect(g).toMatch(/rows: \[\{ slot: 0, name: SOLO_NAME, kills: this\.kills, earned, training \}\]/);
    expect(client("net", "onlineFlow.ts")).toContain("training: { maxHp: p.trainHp ?? 0");
  });

  it("the shop card draws the borrowed tag; Results draws the Train column and the unlock line; the hub has the Training tab", () => {
    expect(client("ui", "ShopScreen.tsx")).toContain("{borrowedTag(c.borrowedFrom)}");
    const r = client("ui", "ResultsScreen.tsx");
    expect(r).toContain("<TrainCell r={r} />");
    expect(r).toContain("{view.unlockLine}");
    const hub = client("ui", "ProgressScreen.tsx");
    expect(hub).toContain('tab === "training"');
    expect(hub).toContain("void trainBoost(row.boost, row.level + 1, send.requestId)");
    expect(client("scenes", "repairPanel.ts")).toContain('this.upgradeErrorNow !== "not_unlocked"');
    expect(client("ui", "LobbyScreen.tsx")).toContain("startButton(startTap, performance.now()).label");
  });
});
