/**
 * Stories 7.4 (AC 11, decision 7.4 D1) and 7.5 (AC 7, T2 "solo too"): what Practice solo's survivor starts with —
 * the unlock mask and Training levels from the phone's last copy of the server's progress (`progressStore`, or the
 * `localStorage` cache it keeps; try/catch), the starter pool and Training 0 when there is none. Practice earns nothing
 * (decision 7.2 D1), so an edited cache only changes this phone's practice. Dev builds: `?unlocks=all|starter`,
 * `?training=5,5,5,5`, and `?shopall` implies all; `?wallet` sets the exact start money (dev wins over Training).
 */
import { ALL_UNLOCKED, NO_TRAINING, PROGRESSION, STARTER_ONLY, levelsFromProgress, progressViewSchema, unlockMask, type PlayerInit, type ProgressView, type TrainingLevels } from "@topdown/shared";
import { PROGRESS_CACHE_KEY } from "./progressStore";

export interface PracticeOptions {
  readonly unlocks: "all" | "starter" | null;
  readonly training: TrainingLevels | null;
  readonly shopAll: boolean;
  readonly startingWallet: number | null;
}

/** The last server progress on this phone (`progressStore`'s cache), or null. Never throws. */
export function cachedProgress(storage: () => Pick<Storage, "getItem"> | null = () => globalThis.localStorage ?? null): ProgressView | null {
  try {
    const raw = storage()?.getItem(PROGRESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = progressViewSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Practice solo's `addPlayer` init. */
export function practiceInit(o: PracticeOptions, progress: ProgressView | null): Required<PlayerInit> {
  const unlocks = o.shopAll || o.unlocks === "all" ? ALL_UNLOCKED : o.unlocks === "starter" ? STARTER_ONLY : progress ? unlockMask(PROGRESSION, progress.unlocks) : STARTER_ONLY;
  const training = o.training ?? (progress ? levelsFromProgress(progress.training) : NO_TRAINING);
  return { unlocks, training: o.startingWallet !== null ? { ...training, startMoney: 0 } : training };
}
