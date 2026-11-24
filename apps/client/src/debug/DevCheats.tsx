import type * as Phaser from "phaser";
import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { MAP_STAGE_COUNT, ZOMBIE_TYPES, currentDecayStage, setLoadout, skipWave, spawnRing, weaponIds, type ZombieTypeId } from "@topdown/shared";
import type { GameScene } from "../scenes/GameScene";
import { LOCAL_PLAYER_ID } from "../sim/LocalSimHost";
import { perf } from "./perfStats";
import { spawnInView, type ViewRect } from "./stressScenario";
import { MAX_SPAWN, MIN_SPAWN, clampSpawnCount, damageNearestBuilding, leaveLast, parseSeed, decayCheatAllowed, setDecayStageCheat, setForcedBlackoutCheat } from "./devCheatActions";
import { BLACKOUT_LEVELS } from "./urlOptions";
import { CollisionGridView } from "./collisionGridView";
import "./DevCheats.css";

/**
 * Dev cheats (Story 1.11). DEVELOPMENT BUILDS ONLY: main.ts loads this module with a dynamic import
 * inside `if (import.meta.env.DEV)`, so Vite drops it from production; tools/checks/noCheatsInRelease
 * asserts the built JS contains none of the strings below. Toggled by the ⚙ button or the backtick key.
 */

/** Ring radius for "around me", meters (inside the view on a phone in landscape). */
const RING_RADIUS_M = 8;
/** "Leave last 5": the wave's last-5 rush (FR30) starts on the next tick. */
const LEAVE_COUNT = 5;
/** Story 3.3: "+500 money" for shop checks (solo). */
const CHEAT_MONEY = 500;
/** Story 3.7: "Damage nearest building 50 %" (until Story 3.5's zombies do it). */
const CHEAT_BUILDING_DAMAGE = 0.5;
/** Story 3.3: the dev loadout's "no second weapon" choice. */
const NO_WEAPON = "";

/** Story 4.3: the collision / grid view, drawn every frame while on (one per page). */
const gridView = new CollisionGridView();
let gridViewOn = false;
let gridViewHooked = false;

function hookGridView(game: Phaser.Game): void {
  if (gridViewHooked) return;
  gridViewHooked = true;
  game.events.on("poststep", () => {
    if (!gridViewOn) return;
    const s = game.scene.getScene("Game") as GameScene | null;
    const w = s?.debugWorld ?? null;
    if (s && w && s.sys.isActive()) gridView.draw(s, w);
  });
}

function DevCheats({ game }: { game: Phaser.Game }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ZombieTypeId>(ZOMBIE_TYPES[0]);
  const [count, setCount] = useState("50");
  const [seedText, setSeedText] = useState("");
  // Story 3.3: the dev loadout (moved here from the Story 1.8 start-of-run picker).
  const [weapon0, setWeapon0] = useState("pistol");
  const [weapon1, setWeapon1] = useState(NO_WEAPON);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const scene = () => game.scene.getScene("Game") as GameScene | null;
  const world = () => scene()?.debugWorld ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Backquote" && !(e.target instanceof HTMLInputElement)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 500); // live seed / wave / alive readout while open
    return () => window.clearInterval(id);
  }, [open]);

  const w = world();
  const p = w?.players.get(LOCAL_PLAYER_ID);
  const n = clampSpawnCount(Number(count));
  const seed = parseSeed(seedText);
  // Story 4.4: online the server owns the run seed (host's ?seed= + DEV_ALLOW_RUN_SEED=1).
  const online = scene()?.isOnline ?? false;
  const spawn = (where: "ring" | "view") => {
    const s = scene();
    if (!w || !p || !s) return;
    if (where === "ring") spawnRing(w, type, n, p.x, p.y, RING_RADIUS_M);
    else spawnInView(w, type, n, s.debugView({ x: 0, y: 0, w: 0, h: 0 } as ViewRect), p.x, p.y);
    refresh();
  };

  return (
    <>
      <button type="button" class="dev-gear" aria-label="Dev cheats" onClick={() => setOpen((o) => !o)}>
        ⚙
      </button>
      {open && (
        <div class="dev-cheats" role="dialog" aria-label="Dev cheats">
          <h2>Dev cheats</h2>
          <p class="dev-cheats__info">
            seed {scene()?.runSeed ?? "—"} · wave {w?.waves.number ?? 0} · alive {w?.zombies.aliveCount ?? 0} · stage {w ? currentDecayStage(w) : "—"}
          </p>
          <fieldset>
            <legend>Spawn zombies</legend>
            <div class="dev-cheats__row">
              <select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as ZombieTypeId)}>
                {ZOMBIE_TYPES.filter((t) => w?.balance.zombies.types[t] !== undefined).map((t) => (
                  <option value={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                min={MIN_SPAWN}
                max={MAX_SPAWN}
                value={count}
                aria-label="How many"
                onInput={(e) => setCount((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="dev-cheats__row">
              <button type="button" onClick={() => spawn("ring")}>
                Spawn {n} around me
              </button>
              <button type="button" onClick={() => spawn("view")}>
                Spawn {n} in view
              </button>
            </div>
          </fieldset>
          <div class="dev-cheats__row">
            <button type="button" onClick={() => w && (skipWave(w), refresh())}>
              Skip wave
            </button>
            <button type="button" onClick={() => w && (leaveLast(w, LEAVE_COUNT), refresh())}>
              Leave last 5
            </button>
          </div>
          <fieldset>
            <legend>Dev loadout</legend>
            <div class="dev-cheats__row">
              <select value={weapon0} aria-label="Slot 1" onChange={(e) => setWeapon0((e.target as HTMLSelectElement).value)}>
                {(w ? weaponIds(w.balance) : []).map((id) => (
                  <option value={id}>{id}</option>
                ))}
              </select>
              <select value={weapon1} aria-label="Slot 2" onChange={(e) => setWeapon1((e.target as HTMLSelectElement).value)}>
                <option value={NO_WEAPON}>(none)</option>
                {(w ? weaponIds(w.balance) : []).filter((id) => id !== weapon0).map((id) => (
                  <option value={id}>{id}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (w && p) setLoadout(w.balance, p.loadout, [weapon0, weapon1 === NO_WEAPON || weapon1 === weapon0 ? null : weapon1]);
                  refresh();
                }}
              >
                Set loadout
              </button>
            </div>
            <div class="dev-cheats__row">
              <button type="button" onClick={() => {
                  if (p) p.wallet += CHEAT_MONEY; // a cheat: no "+N" event, not counted as earned
                  refresh();
                }}>
                +{CHEAT_MONEY} money
              </button>
              <button type="button" onClick={() => {
                  if (w && p) damageNearestBuilding(w, p.x, p.y, CHEAT_BUILDING_DAMAGE); // Story 3.7: repair checks
                  refresh();
                }}>
                Damage nearest building 50 %
              </button>
            </div>
          </fieldset>
          <label class="dev-cheats__check">
            <input
              type="checkbox"
              checked={w?.debug.godMode ?? false}
              onChange={(e) => {
                if (w) w.debug.godMode = (e.target as HTMLInputElement).checked;
                refresh();
              }}
            />
            God mode
          </label>
          <label class="dev-cheats__check">
            <input
              type="checkbox"
              checked={perf.overlayOn}
              onChange={(e) => {
                perf.overlayOn = (e.target as HTMLInputElement).checked;
                refresh();
              }}
            />
            Perf overlay
          </label>
          <label class="dev-cheats__check">
            <input
              type="checkbox"
              checked={gridViewOn}
              onChange={(e) => {
                gridViewOn = (e.target as HTMLInputElement).checked;
                hookGridView(game);
                if (gridViewOn) gridView.show();
                else gridView.hide();
                refresh();
              }}
            />
            Collision / grid view
          </label>
          <fieldset>
            <legend>Decay stage (whole map)</legend>
            <div class="dev-cheats__row">
              <select
                value={String(w ? currentDecayStage(w) : 1)}
                aria-label="Decay stage"
                disabled={online || !w || !decayCheatAllowed(w)}
                onChange={(e) => {
                  if (w && !online) setDecayStageCheat(w, Number((e.target as HTMLSelectElement).value));
                  refresh();
                }}
              >
                {Array.from({ length: MAP_STAGE_COUNT }, (_, i) => (
                  <option value={String(i + 1)}>stage {i + 1}</option>
                ))}
              </select>
            </div>
            <p class="dev-cheats__info">Solo: runs the build-start decay for that stage (map mutations, cover, spawns, refunds, push-outs, flow fields, banner).</p>
            {online && <p class="dev-cheats__info">Online: the server owns the decay stage (DEV_DECAY_STAGES=2,3 on a dev server).</p>}
            {!online && w && !decayCheatAllowed(w) && <p class="dev-cheats__info">Build phase only (decay never changes mid-wave).</p>}
          </fieldset>
          <fieldset>
            <legend>Force blackout</legend>
            <div class="dev-cheats__row">
              <select
                value={String(w && w.lights.forcedPct >= 0 ? w.lights.forcedPct : -1)}
                aria-label="Force blackout"
                disabled={online || !w}
                onChange={(e) => {
                  if (w && !online) setForcedBlackoutCheat(w, Number((e.target as HTMLSelectElement).value));
                  refresh();
                }}
              >
                <option value="-1">off</option>
                {BLACKOUT_LEVELS.map((p) => (
                  <option value={String(p)}>{p} %</option>
                ))}
              </select>
            </div>
            <p class="dev-cheats__info">Solo, any phase: the darkness at that level (Story 6.3). Online: DEV_FORCE_BLACKOUT=5 on a dev server.</p>
          </fieldset>
          <fieldset>
            <legend>Run seed</legend>
            <div class="dev-cheats__row">
              <input
                type="text"
                inputMode="numeric"
                placeholder="uint32"
                value={seedText}
                aria-label="Run seed"
                onInput={(e) => setSeedText((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                disabled={seed === null || online}
                onClick={() => {
                  if (seed === null || online) return;
                  setOpen(false);
                  scene()?.restartRun(seed);
                }}
              >
                Restart with seed
              </button>
            </div>
            {online && (
              <p class="dev-cheats__info">Online: the host opens the game with ?seed=N and the server runs with DEV_ALLOW_RUN_SEED=1.</p>
            )}
          </fieldset>
        </div>
      )}
    </>
  );
}

/** Renders the cheat panel into the UI layer. Called from main.ts in dev builds only. */
export function mountDevCheats(game: Phaser.Game): void {
  const el = document.createElement("div");
  (document.getElementById("ui") ?? document.body).appendChild(el);
  render(h(DevCheats, { game }), el);
}
