/**
 * Story 7.1: what the run room needs from the account side: the ticket key (to verify the join ticket in the static
 * `onAuth`, which Colyseus calls with the client's options only, so room options can't carry it) and the accounts
 * repository (the best-effort display-name save in `onJoin`). Set by `createGameServer`; one game server per process
 * (index.ts; each test file boots its servers one after the other, the newest wins).
 */
import type { AccountsRepo } from "../db/accountsRepo";
import { randomSessionSecret, verifyTicket } from "./ticket";

export interface RoomAccounts {
  sessionSecret: string;
  accounts: AccountsRepo | null;
}

let current: RoomAccounts = { sessionSecret: randomSessionSecret(), accounts: null };

export function setRoomAccounts(next: RoomAccounts): void {
  current = next;
}

/**
 * The account id of a valid ticket issued for this guest token (review M1), else null (pure HMAC: no database,
 * safe in `onAuth`; never a refusal, P3).
 */
export function ticketAccountId(ticket: string | undefined, guestTokenHash: string): string | null {
  return ticket === undefined ? null : verifyTicket(ticket, current.sessionSecret, guestTokenHash);
}

export function roomAccountsRepo(): AccountsRepo | null {
  return current.accounts;
}
