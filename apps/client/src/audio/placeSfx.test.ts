import { describe, expect, it } from "vitest";

/** Story 5.23 (AC 2, 3; D4, D8): the placement sounds through the one audio module (fake Web Audio). */
describe("Story 5.23: placement sounds", () => {
  it("each sound makes voices; a far teammate's is scaled by its volume; one placed sound per kind per 50 ms", async () => {
    const gains: number[] = [];
    let oscillators = 0;
    const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
    const node = () => ({ connect: (t: unknown) => t, start: () => {}, stop: () => {} });
    class FakeCtx {
      state = "running";
      sampleRate = 8000;
      currentTime = 1;
      destination = {};
      createGain() {
        const g = { ...node(), gain: { ...param(), set value(v: number) { gains.push(v); }, get value() { return 0; } } };
        return g;
      }
      createBuffer(_c: number, len: number) {
        const d = new Float32Array(len);
        return { getChannelData: () => d };
      }
      createOscillator() {
        oscillators++;
        return { ...node(), type: "sine", frequency: param(), detune: param() };
      }
      createBiquadFilter() {
        return { ...node(), type: "lowpass", frequency: param(), Q: param() };
      }
      createBufferSource() {
        return { ...node(), buffer: null, loop: false };
      }
      createStereoPanner() {
        return { ...node(), pan: param() };
      }
      resume() {
        return Promise.resolve();
      }
    }
    (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx };
    const { playSfx, unlockAudio } = await import("./placeholderSfx");
    unlockAudio();
    for (const name of ["ui_build_pick", "building_placed_thunk", "building_placed_clank", "building_placed_click", "building_place_refused"] as const) {
      const before = oscillators;
      playSfx(name);
      expect(oscillators - before, name).toBeGreaterThan(0);
    }
    gains.length = 0;
    const before = oscillators;
    playSfx("building_placed_thunk", 0.5, 0.4); // the same instant: rate-limited
    expect(oscillators).toBe(before);
    // a later instant: plays, its output gain is the volume
    const anyCtx = (await import("./placeholderSfx")).audioContextIfRunning() as unknown as FakeCtx;
    anyCtx.currentTime = 2;
    playSfx("building_placed_thunk", 0.5, 0.4);
    expect(oscillators).toBeGreaterThan(before);
    expect(gains[0]).toBeCloseTo(0.4, 9);
  });
});
