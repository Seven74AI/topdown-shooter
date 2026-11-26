/**
 * Story 10.1 (AC 10; decision 10.1-B15): after the server deleted my progress (and cleared the `__Host-tdg` cookie),
 * this phone forgets everything that named the old player: the guest token, the stored settings (+ pending mark), the
 * name, the look copy, the progress cache, the last-bank line and the remembered seat. Then the page reloads: the
 * normal start-up session call makes a fresh guest with 0 Supplies. Every storage call is wrapped (blocked storage).
 */
import { clearSettings } from "../settings/settings";
import { DEVICE_LOOK_KEY } from "./deviceLook";
import { GUEST_TOKEN_KEY } from "./guestToken";
import { LAST_BANK_KEY } from "./rewardsStore";
import { PROGRESS_CACHE_KEY } from "./progressStore";
import { LAST_USERNAME_KEY, accountStore } from "./accountStore";

/** Every localStorage key that belongs to the player (not the device's graphics caches). */
export const PLAYER_STORAGE_KEYS: readonly string[] = Object.freeze([GUEST_TOKEN_KEY, DEVICE_LOOK_KEY, PROGRESS_CACHE_KEY, LAST_BANK_KEY, "topdown.name", "topdown.seat", LAST_USERNAME_KEY]);

export function resetPhoneAfterDelete(storage: () => Pick<Storage, "removeItem"> | undefined = () => globalThis.localStorage, reload: () => void = () => location.reload()): void {
  accountStore.expectGuest(); // review L9: my own delete is not "the account went away elsewhere"
  for (const key of PLAYER_STORAGE_KEYS) {
    try {
      storage()?.removeItem(key);
    } catch {
      // storage blocked: nothing was kept there either
    }
  }
  clearSettings();
  reload();
}
