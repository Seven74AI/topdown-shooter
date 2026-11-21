import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "./uiState";

/** "Game over" with the wave reached and a Restart button (new run, new seed). */
export function GameOver() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  useEffect(() => uiStore.subscribe(setScreen), []);
  if (screen.kind !== "gameOver") return null;
  return (
    <div class="game-over" role="dialog" aria-labelledby="game-over-title">
      <h1 id="game-over-title">Game over</h1>
      <p>Wave reached: {screen.waveReached}</p>
      <button type="button" class="btn" onClick={() => uiStore.request("restart")}>
        Restart
      </button>
    </div>
  );
}
