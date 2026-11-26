/**
 * Story 8.3 (H1, AC 9; Epic 8 D8): "You are now the host" — shown once when the room's `hostSlot` changes TO my slot
 * after the first patch. Never on the first patch (a lobby creator, a late joiner or a restarted scene that is host
 * from the start), never when it moves to someone else or stays. Pure; `HostToastWatch` keeps the previous patch.
 */
export const HOST_TOAST_TEXT = "You are now the host";

export function hostToast(prevHostSlot: number | null, hostSlot: number, mySlot: number | null | undefined, firstPatch: boolean): boolean {
  if (firstPatch || prevHostSlot === null || mySlot === null || mySlot === undefined) return false;
  return prevHostSlot !== hostSlot && hostSlot === mySlot;
}

/** One screen's view of the host slot over patches (the lobby screen, the Game scene): `observe` says when to toast. */
export class HostToastWatch {
  private prev: number | null = null;
  private seen = false;

  /** Call on each state change with the room's host slot and my slot (undefined before `run.joined`). */
  observe(hostSlot: number, mySlot: number | null | undefined): boolean {
    if (mySlot === null || mySlot === undefined) return false; // not seated yet: the first patch is still to come
    const show = hostToast(this.prev, hostSlot, mySlot, !this.seen);
    this.seen = true;
    this.prev = hostSlot;
    return show;
  }

  reset(): void {
    this.prev = null;
    this.seen = false;
  }
}
