import type * as Phaser from "phaser";
import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CHEAT_BLACKOUT_LEVELS, CHEAT_BUILDING_DAMAGE, CHEAT_LEAVE_COUNT, CHEAT_MONEY, CHEAT_RING_RADIUS_M, MAP_STAGE_COUNT, ZOMBIE_TYPES, currentDecayStage, forceEvent, setLoadout, skipWave, spawnRing, weaponIds, type AdminCheat, type ZombieTypeId } from "@topdown/shared";
import type { GameScene } from "../scenes/GameScene";
import { LOCAL_PLAYER_ID } from "../sim/LocalSimHost";
import { perf } from "./perfStats";
import { spawnInView, type ViewRect } from "./stressScenario";
import { MAX_SPAWN, MIN_SPAWN, clampSpawnCount, damageNearestBuilding, leaveLast, spawnBehemothCheat, parseSeed, decayCheatAllowed, setDecayStageCheat, setForcedBlackoutCheat } from "./devCheatActions";
import { BLACKOUT_LEVELS } from "./urlOptions";
import { CollisionGridView } from "./collisionGridView";
import { uiStore } from "../ui/uiState";
import "./DevCheats.css";

/**
 * Dev cheats (Story 1.11). Toggled by the ⚙ button or the backtick key. Dev builds mount it at once (main.ts). Story
 * 10.11: a production build downloads it (through `adminTools.ts`, the neutrally named `assets/admin-tools-*` chunk)
 * only once the session says this phone's account is an admin (`adminGate.ts`); tools/checks/noCheatsInRelease
 * asserts that no other built file contains the strings below. Story 10.12: online (dev and production) every cheat
 * goes to the server as one `admin.cheat` message (the server checks admin itself and applies it on its World; no
 * confirm, Q6 B); Perf overlay and Collision / grid view stay local view tools. Solo / Practice is unchanged (local).
 */

/** Ring radius for "around me" (Story 10.12: shared with the server's cheat). */
const RING_RADIUS_M = CHEAT_RING_RADIUS_M;
/** "Leave last 5": the wave's last-5 rush (FR30) starts on the next tick. */
const LEAVE_COUNT = CHEAT_LEAVE_COUNT;
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

/** Story 10.11 (AC 5): turns off what the panel turned on for this phone when the admin mark goes (B-code B2). */
function dropCheatState(game: Phaser.Game): void {
  if (gridViewOn) {
    gridViewOn = false;
    gridView.hide();
  }
  const w = (game.scene.getScene("Game") as GameScene | null)?.debugWorld;
  if (w) w.debug.godMode = false;
}

function DevCheats({ game, visible }: { game: Phaser.Game; visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ZombieTypeId>(ZOMBIE_TYPES[0]);
  const [count, setCount] = useState("50");
  const [seedText, setSeedText] = useState("");
  // Story 3.3: the dev loadout (moved here from the Story 1.8 start-of-run picker).
  const [weapon0, setWeapon0] = useState("pistol");
  const [weapon1, setWeapon1] = useState(NO_WEAPON);
  // Story 10.12 (Q4 B): online god mode lives on the server (the admin's own survivor); the box shows what this phone
  // asked for in this run (by its seed: a restart or a new run starts without it).
  const [onlineGodSeed, setOnlineGodSeed] = useState<number | null>(null);
  // Review L2: the mirror World never gets the forced blackout level, so online the select shows what this phone set
  // (in this run, by its seed); otherwise it snapped back to "off" and "off" could never be sent.
  const [onlineBlackout, setOnlineBlackout] = useState<{ seed: number; pct: number } | null>(null);
  const [, setTick] = useState(0);
  // Story 7.9 review L5: no gear on the lobby (it sat on LEAVE); cheats are for runs.
  const [inLobby, setInLobby] = useState(uiStore.get().kind === "lobby");
  useEffect(() => uiStore.subscribe((sc) => setInLobby(sc.kind === "lobby")), []);
  const refresh = () => setTick((t) => t + 1);
  const scene = () => game.scene.getScene("Game") as GameScene | null;
  const world = () => scene()?.debugWorld ?? null;

  useEffect(() => {
    if (!visible) return; // Story 10.11 (AC 5): no backtick panel once the admin mark is gone
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Backquote" && !(e.target instanceof HTMLInputElement)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);
  useEffect(() => {
    if (visible) return;
    setOpen(false);
    dropCheatState(game);
  }, [visible]);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 500); // live seed / wave / alive readout while open
    return () => window.clearInterval(id);
  }, [open]);

  const w = world();
  const p = w?.players.get(LOCAL_PLAYER_ID);
  const n = clampSpawnCount(Number(count));
  const seed = parseSeed(seedText);
  const online = scene()?.isOnline ?? false;
  const seedNow = scene()?.runSeed ?? 0;
  /** Story 10.12: online the cheat goes to the server (`admin.cheat`); solo it runs here on the local World. */
  const act = (cheat: AdminCheat, solo: () => void) => {
    if (online) scene()?.sendAdminCheat(cheat);
    else solo();
    refresh();
  };
  const spawn = (where: "ring" | "view") => {
    const s = scene();
    if (!s) return;
    const view = s.debugView({ x: 0, y: 0, w: 0, h: 0 } as ViewRect);
    act({ cheat: "spawn", type, count: n, where, ...(where === "view" ? { view: { x: view.x, y: view.y, w: view.w, h: view.h } } : {}) }, () => {
      if (!w || !p) return;
      if (where === "ring") spawnRing(w, type, n, p.x, p.y, RING_RADIUS_M);
      else spawnInView(w, type, n, view, p.x, p.y);
    });
  };
  const godOn = online ? onlineGodSeed === seedNow : (w?.debug.godMode ?? false);

  if (!visible) return null;
  return (
    <>
      {!inLobby && (
        <button type="button" class="dev-gear" aria-label="Dev cheats" onClick={() => setOpen((o) => !o)}>
          ⚙
        </button>
      )}
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
            <button type="button" onClick={() => act({ cheat: "skip_wave" }, () => w && skipWave(w))}>
              Skip wave
            </button>
            <button type="button" onClick={() => act({ cheat: "leave_last" }, () => w && leaveLast(w, LEAVE_COUNT))}>
              Leave last 5
            </button>
            <button type="button" onClick={() => act({ cheat: "behemoth" }, () => w && spawnBehemothCheat(w))}>
              Spawn Behemoth
            </button>
          </div>
          <div class="dev-cheats__row">
            {/* Story 6.8: Force event ▸ kind (the coming wave, at 20 %) */}
            <button type="button" onClick={() => act({ cheat: "event", kind: "car_alarm" }, () => w && forceEvent(w, "car_alarm"))}>
              Force car alarm
            </button>
            <button type="button" onClick={() => act({ cheat: "event", kind: "stampede" }, () => w && forceEvent(w, "stampede"))}>
              Force stampede
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
                  const second = weapon1 === NO_WEAPON || weapon1 === weapon0 ? null : weapon1;
                  act({ cheat: "loadout", w0: weapon0, w1: second }, () => w && p && setLoadout(w.balance, p.loadout, [weapon0, second]));
                }}
              >
                Set loadout
              </button>
            </div>
            <div class="dev-cheats__row">
              <button type="button" onClick={() => act({ cheat: "money" }, () => p && (p.wallet += CHEAT_MONEY))}>
                +{CHEAT_MONEY} money
              </button>
              <button type="button" onClick={() => act({ cheat: "damage_building" }, () => w && p && damageNearestBuilding(w, p.x, p.y, CHEAT_BUILDING_DAMAGE))}>
                Damage nearest building 50 %
              </button>
            </div>
          </fieldset>
          <label class="dev-cheats__check">
            <input
              type="checkbox"
              checked={godOn}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                if (online) setOnlineGodSeed(on ? seedNow : null);
                act({ cheat: "god", on }, () => w && (w.debug.godMode = on));
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
                disabled={!w || !decayCheatAllowed(w)}
                onChange={(e) => {
                  const stage = Number((e.target as HTMLSelectElement).value);
                  act({ cheat: "decay", stage }, () => w && setDecayStageCheat(w, stage));
                }}
              >
                {Array.from({ length: MAP_STAGE_COUNT }, (_, i) => (
                  <option value={String(i + 1)}>stage {i + 1}</option>
                ))}
              </select>
            </div>
            <p class="dev-cheats__info">Runs the build-start decay for that stage (map mutations, cover, spawns, push-outs, flow fields, banner){online ? " on the server, for everyone" : ""}.</p>
            {w && !decayCheatAllowed(w) && <p class="dev-cheats__info">Build phase only (decay never changes mid-wave).</p>}
          </fieldset>
          <fieldset>
            <legend>Force blackout</legend>
            <div class="dev-cheats__row">
              <select
                value={String(online ? (onlineBlackout?.seed === seedNow ? onlineBlackout.pct : -1) : w && w.lights.forcedPct >= 0 ? w.lights.forcedPct : -1)}
                aria-label="Force blackout"
                disabled={!online && !w}
                onChange={(e) => {
                  const pct = Number((e.target as HTMLSelectElement).value) as (typeof CHEAT_BLACKOUT_LEVELS)[number];
                  if (online) setOnlineBlackout({ seed: seedNow, pct });
                  act({ cheat: "blackout", pct }, () => w && setForcedBlackoutCheat(w, pct));
                }}
              >
                <option value="-1">off</option>
                {BLACKOUT_LEVELS.map((p) => (
                  <option value={String(p)}>{p} %</option>
                ))}
              </select>
            </div>
            <p class="dev-cheats__info">Any phase: the darkness at that level (Story 6.3){online ? ", for everyone" : ""}.</p>
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
                disabled={seed === null}
                onClick={() => {
                  if (seed === null) return;
                  setOpen(false);
                  // Story 10.12 (AC 6): online the server restarts the room's run for everyone with this seed.
                  if (online) scene()?.sendAdminCheat({ cheat: "restart", seed });
                  else scene()?.restartRun(seed);
                }}
              >
                Restart with seed
              </button>
            </div>
            {online && <p class="dev-cheats__info">Online: restarts the run for everyone in the room.</p>}
          </fieldset>
        </div>
      )}
    </>
  );
}

/** Story 10.11: shows or hides the mounted panel (the ⚙, the backtick key and the open panel). */
export interface CheatPanelHandle {
  setVisible(visible: boolean): void;
}

/** Renders the cheat panel into the UI layer: at once in dev builds; for admins in production (`adminGate.ts`). */
export interface CheatPanelOptions {
  /** Shown at mount (default true). */
  visible?: boolean;
}

export function mountDevCheats(game: Phaser.Game, opts: CheatPanelOptions = {}): CheatPanelHandle {
  const { visible = true } = opts;
  const el = document.createElement("div");
  (document.getElementById("ui") ?? document.body).appendChild(el);
  const draw = (v: boolean) => render(h(DevCheats, { game, visible: v }), el);
  draw(visible);
  return { setVisible: draw };
}
