import { isRoomCode } from "@topdown/shared";

/**
 * Story 8.1 (AC 6, 7): the seat this tab holds in a run, in `sessionStorage` (per tab, survives a
 * reload, never shared with another tab): the room code, the SDK's reconnection token
 * (`roomId:token`) and my name (a takeover join needs one). A reload reads it before the start screen
 * and takes the seat straight back. Every access is guarded: storage can be off or throw
 * (private mode, blocked site data), and the game works without it (a reload then lands on the
 * start screen).
 */
export interface SavedSeat {
  readonly roomId: string;
  readonly token: string;
  readonly name: string;
}

const KEY = "topdown.seat";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export const seatStore = {
  save(seat: SavedSeat): void {
    try {
      storage()?.setItem(KEY, JSON.stringify(seat));
    } catch {
      // storage full or blocked: a reload simply won't find the seat
    }
  },
  load(): SavedSeat | null {
    try {
      const raw = storage()?.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as Partial<SavedSeat>;
      if (typeof v.roomId !== "string" || typeof v.token !== "string" || typeof v.name !== "string") return null;
      if (!isRoomCode(v.roomId) || v.token.length > 200 || v.name.length > 64) return null;
      return { roomId: v.roomId, token: v.token, name: v.name };
    } catch {
      return null;
    }
  },
  clear(): void {
    try {
      storage()?.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  },
};
