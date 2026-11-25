/**
 * Story 9.13 (B17): where a bake is done with a scratch canvas. By default its pixels are freed at once (Safari keeps
 * them until the size is 0); the characters' bake worker recycles them instead (`setCanvasRecycler`): in a running
 * game a NEW canvas's first readback waits for the busy GPU process (measured headless: ~60 ms each), a reused one's
 * doesn't.
 */
let recycler = (c: HTMLCanvasElement): void => {
  c.width = 0;
  c.height = 0;
};
export function freeCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (c) recycler(c);
}
export function setCanvasRecycler(fn: (c: HTMLCanvasElement) => void): void {
  recycler = fn;
}
