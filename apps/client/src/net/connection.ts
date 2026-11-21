import { Client, type Room } from "@colyseus/sdk";
import { RUN_ROOM_NAME, err, loadBalance, ok, type JoinOptions, type Result, type RunStateView } from "@topdown/shared";
import { joinErrorText } from "./joinErrors";

/** A connected run room; `state` is read through the plain views from shared. */
export type RunConnection = Room<unknown, RunStateView>;

/**
 * The game server, always on the page's own origin under `/api` (the Vite proxy in dev, Caddy in
 * production, Story 2.2), so a phone on the same Wi-Fi works too. `VITE_SERVER_URL` overrides it.
 */
export function serverUrl(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  return override ?? `${location.origin}/api`;
}

let client: Client | null = null;
let balanceVersion: string | null = null;

const sdk = (): Client => (client ??= new Client(serverUrl()));
/** The bundled balance version; the server refuses any other one (AC 4). */
const clientBalanceVersion = (): string => (balanceVersion ??= loadBalance().version);

/** Creates a run (Story 2.1). The error is player text from `joinErrorText`. */
export async function createGame(name: string): Promise<Result<RunConnection, string>> {
  const options: JoinOptions = { intent: "create", name, balanceVersion: clientBalanceVersion() };
  try {
    const room = await sdk().create<RunStateView>(RUN_ROOM_NAME, options);
    return ok(room as RunConnection);
  } catch (e) {
    return err(joinErrorText(e));
  }
}
