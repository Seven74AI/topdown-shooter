/**
 * Story 7.9 (AC 5, 13): this device's copy of my survivor look code (from the last `/api/account/session` answer).
 * Used when the server can't be reached (the join still carries my look) and for practice solo (D4). Storage may
 * be blocked (private mode): then there is no copy and the default look is drawn. Never sent anywhere but the join.
 */
import { LOOK_CODE_MAX } from "@topdown/shared";

export const DEVICE_LOOK_KEY = "topdown.look";

export interface LookStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceLookStore {
  /** The cached code, or undefined (none, blocked storage, or not a plausible code). */
  get(): string | undefined;
  /** The server's look: a code is stored, null (the default look) clears the copy. */
  set(look: string | null): void;
}

export function deviceLookStore(storage: () => LookStorage): DeviceLookStore {
  return {
    get: () => {
      try {
        const v = storage().getItem(DEVICE_LOOK_KEY);
        return v !== null && v.length > 0 && v.length <= LOOK_CODE_MAX ? v : undefined;
      } catch {
        return undefined;
      }
    },
    set: (look) => {
      try {
        if (look === null) storage().removeItem(DEVICE_LOOK_KEY);
        else if (look.length <= LOOK_CODE_MAX) storage().setItem(DEVICE_LOOK_KEY, look);
      } catch {
        // storage blocked: no copy (the default look offline)
      }
    },
  };
}

export const deviceLook: DeviceLookStore = deviceLookStore(() => globalThis.localStorage);
