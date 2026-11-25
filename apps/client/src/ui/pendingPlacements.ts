/**
 * Story 8.5 (AC 9): how many of my placements are still waiting for the server (the Game scene publishes its
 * `PendingPlacements.count` when it changes). Save and quit's Save waits for 0, so everything I placed is in the save.
 */
type Listener = (count: number) => void;
let count = 0;
const listeners = new Set<Listener>();

export const pendingPlacements = {
  get: (): number => count,
  set(n: number): void {
    if (n === count) return;
    count = n;
    for (const l of listeners) l(n);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
