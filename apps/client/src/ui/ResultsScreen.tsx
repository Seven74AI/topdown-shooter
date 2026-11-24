import { useEffect, useState } from "preact/hooks";
import { resultsSub, resultsTitle, uiStore, type UiScreen } from "./uiState";
import { dawnLookFor, dawnProgress } from "./dawnModel";
import { clientBalance } from "../debug/clientBalance";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";

/**
 * Results after a team wipe (Story 2.8, FR11): the wave reached, then color dot, name and kills per
 * player (sorted by slot). Online: Back to lobby (the whole room goes back; a player who taps later
 * is already there). Solo: Restart, as in Epic 1. Story 3.10 (temporary until Epic 6's full
 * Results): after the last wave the title is "You held out!" with the wave reached under it, and
 * every row shows the money earned this run. Story 4.4: the run seed under the table.
 * Story 6.11: "Extracted" after the 4 s dawn (DW1 warm sunrise after wave 10, DW2 blue hour in
 * endless; a tap skips it, D6); Story 6.12: "Lost in the city" on the DW2 backdrop at once (D7).
 */
export function ResultsScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => {
    setSent(false);
    setSkipped(false);
    setNow(performance.now());
  }, [screen]);
  const endsAt = screen.kind === "results" ? screen.dawnEndsAtMs : 0;
  const progress = screen.kind === "results" ? dawnProgress(now, endsAt, clientBalance().waves.evac.dawnS, skipped) : 1;
  useEffect(() => {
    if (progress >= 1) return;
    const id = requestAnimationFrame(() => setNow(performance.now())); // the dawn's 4 s only
    return () => cancelAnimationFrame(id);
  }, [progress]);
  if (screen.kind !== "results") return null;
  const look = dawnLookFor(screen.ending, screen.endless);
  if (progress < 1) {
    // The dawn over the live map (the helicopter lifts off underneath): darkness lifting + the look's light.
    return (
      <div class={`dawn dawn--${look}`} role="presentation" onPointerDown={() => setSkipped(true)} data-testid="dawn">
        <div class="dawn__dark" style={{ opacity: String(1 - progress * (look === "dw2" ? 0.75 : 0.82)) }} />
        <div class="dawn__light" style={{ opacity: String(progress) }} />
        <p class="dawn__hint">Tap to skip</p>
      </div>
    );
  }
  const sub = resultsSub(screen);
  const cls = screen.ending === "extracted" ? "game-over results results--held" : screen.ending === "lost" ? "game-over results results--lost" : "game-over results";
  return (
    <div class={look !== "none" ? `results-backdrop results-backdrop--${look}` : undefined}>
    <div class={cls} role="dialog" aria-labelledby="results-title">
      <h1 id="results-title">{resultsTitle(screen)}</h1>
      {sub ? <p class="results__sub">{sub}</p> : null}
      <table class="results__table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Kills</th>
            <th scope="col">Earned</th>
          </tr>
        </thead>
        <tbody>
          {screen.rows.map((r) => (
            <tr key={r.slot}>
              <td class="results__name">
                <span
                  class="lobby__dot"
                  style={{ background: SLOT_COLOR_CSS[r.slot] }}
                  role="img"
                  aria-label={SLOT_COLOR_NAMES[r.slot]}
                />
                {r.name}
              </td>
              <td class="results__kills">{r.kills}</td>
              <td class="results__earned">${r.earned}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="results__seed">Run seed {screen.seed}</p>
      {screen.online ? (
        <button
          type="button"
          class="btn"
          disabled={sent}
          onClick={() => {
            setSent(true);
            uiStore.request("lobbyReturn");
          }}
        >
          Back to lobby
        </button>
      ) : (
        <button type="button" class="btn" onClick={() => uiStore.request("restart")}>
          Restart
        </button>
      )}
    </div>
    </div>
  );
}
