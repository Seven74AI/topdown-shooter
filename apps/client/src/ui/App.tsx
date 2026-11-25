import { ResultsScreen } from "./ResultsScreen";
import { EvacVote } from "./EvacVote";
import { InRunMenu } from "./InRunMenu";
import { ShopScreen } from "./ShopScreen";
import { StartScreen } from "./StartScreen";
import { LobbyScreen } from "./LobbyScreen";
import { ProgressScreen } from "./ProgressScreen";
import { RotateOverlay } from "./RotateOverlay";
import { ServerNotice } from "./ServerNotice";
import { ConnectionOverlay } from "./ConnectionOverlay";
import { GfxNotice } from "./GfxNotice";
import { TuningPanel } from "../debug/TuningPanel";
import { urlOptions } from "../debug/urlOptions";
import { StressResults } from "../debug/StressResults";
import { NetResults } from "../debug/NetResults";

export interface AppProps {
  /** Code from a share link `/j/<code>` (Story 2.3), prefilled on the start screen. */
  joinCode?: string | null;
}

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App({ joinCode = null }: AppProps) {
  return (
    <>
      <StartScreen joinCode={joinCode} />
      <LobbyScreen />
      <ProgressScreen />
      <EvacVote />
      <ResultsScreen />
      <ShopScreen />
      <InRunMenu />
      {urlOptions().tune && <TuningPanel />}
      <StressResults />
      <NetResults />
      <ConnectionOverlay />
      <ServerNotice />
      <GfxNotice />
      <RotateOverlay />
    </>
  );
}
