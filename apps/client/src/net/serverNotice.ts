/** Shown when the server stops or redeploys (Story 2.2 AC 5). */
export const SERVER_RESTARTING_TEXT = "Server restarting. Try again in a moment.";

/**
 * Colyseus `CloseCode.SERVER_SHUTDOWN`. Not imported from `@colyseus/sdk`: `main.ts` uses this file,
 * and the SDK must stay out of the main chunk (Story 2.1 loads it on the first Create game).
 */
export const SERVER_SHUTDOWN_CLOSE_CODE = 4001;

/** Why a joined room ended without the player leaving. */
/** Story 8.1: `taken_over` — this seat was opened in another tab or by a reload (D5), which now has it. */
/** Story 8.3: `removed` — the host removed this player (close 4022 or `player.removed`): terminal, never a reconnect. */
export type LostReason = "server_restarting" | "connection_lost" | "taken_over" | "removed";

/**
 * The server announces a stop with `server.shutdown_started`, then closes with 4001
 * (`SERVER_SHUTDOWN_CLOSE_CODE`). Either one means "server restarting"; anything else is a lost
 * connection.
 */
export function lostReason(code: number | undefined, sawShutdownMessage: boolean): LostReason {
  return sawShutdownMessage || code === SERVER_SHUTDOWN_CLOSE_CODE ? "server_restarting" : "connection_lost";
}

type Listener = (text: string | null) => void;

/** The one blocking notice over the menus (the "Server restarting" dialog). */
class ServerNoticeStore {
  private text: string | null = null;
  private readonly listeners = new Set<Listener>();

  get(): string | null {
    return this.text;
  }

  show(text: string): void {
    this.set(text);
  }

  dismiss(): void {
    this.set(null);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(text: string | null): void {
    this.text = text;
    for (const l of this.listeners) l(text);
  }
}

export const serverNotice = new ServerNoticeStore();
