/**
 * Re-review RR-L1 (Story 7.3): the unlock call waits longer than the route's worst case (≈ 2 s account lookup + 2 s
 * pool checkout + 1.8 s transaction budget ≈ 5.8 s), so a purchase can't commit after the phone gave up. The session
 * call keeps its 3 s (`ACCOUNT_TIMEOUT_MS`). Its own module so `ui/hubModel.ts` (imported by tools checks) stays free of
 * browser-only code.
 */
export const UNLOCK_TIMEOUT_MS = 7000;
