import { GameOver } from "./GameOver";
import { RotateOverlay } from "./RotateOverlay";

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App() {
  return (
    <>
      <GameOver />
      <RotateOverlay />
    </>
  );
}
