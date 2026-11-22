import { describe, expect, it } from "vitest";

/** Review L (Stories 4.6/4.7): the gesture resumes the shared context from any paused state, iOS's "interrupted" included. */
describe("unlockAudio", () => {
  it("resumes when suspended or interrupted, never when running or closed; audioContextIfRunning follows the state", async () => {
    let resumes = 0;
    class FakeCtx {
      static last: FakeCtx | null = null;
      state = "suspended";
      sampleRate = 8000;
      destination = {};
      constructor() {
        FakeCtx.last = this;
      }
      createGain() {
        return { gain: { value: 0 }, connect: (t: unknown) => t };
      }
      createBuffer(_c: number, len: number) {
        const d = new Float32Array(len);
        return { getChannelData: () => d };
      }
      resume() {
        resumes++;
        return Promise.resolve();
      }
    }
    (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx };
    const { unlockAudio, audioContextIfRunning } = await import("./placeholderSfx");
    expect(audioContextIfRunning()).toBe(null); // never creates one
    expect(FakeCtx.last).toBe(null);
    unlockAudio(); // the first gesture creates it (suspended) and resumes
    expect(resumes).toBe(1);
    const c = FakeCtx.last as FakeCtx | null;
    if (!c) throw new Error("no context");
    for (const [state, expected] of [
      ["interrupted", 1],
      ["running", 0],
      ["closed", 0],
      ["suspended", 1],
    ] as const) {
      c.state = state;
      const before = resumes;
      unlockAudio();
      expect(resumes - before, state).toBe(expected);
      expect(audioContextIfRunning() !== null, state).toBe(state === "running");
    }
    delete (globalThis as { window?: unknown }).window;
  });
});
