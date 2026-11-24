import { useEffect, useState } from "preact/hooks";
import { resultsTitle, uiStore, type UiScreen } from "./uiState";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";

/**
 * Results after a team wipe (Story 2.8, FR11): the wave reached, then color dot, name and kills per
 * player (sorted by slot). Online: Back to lobby (the whole room goes back; a player who taps later
 * is already there). Solo: Restart, as in Epic 1. Story 3.10 (temporary until Epic 6's full
 * Results): after the last wave the title is "You held out!" with the wave reached under it, and
 * every row shows the money earned this run. Story 4.4: the run seed under the table. Story 6.1: the
 * last wave is wave 10 ("Wave reached 10") until Story 6.11's evacuation vote.
 */
export function ResultsScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [sent, setSent] = useState(false);
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => setSent(false), [screen]);
  if (screen.kind !== "results") return null;
  return (
    <div class={screen.heldOut ? "game-over results results--held" : "game-over results"} role="dialog" aria-labelledby="results-title">
      <h1 id="results-title">{resultsTitle(screen)}</h1>
      {screen.heldOut ? <p class="results__sub">Wave reached {screen.wave}</p> : null}
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
  );
}
