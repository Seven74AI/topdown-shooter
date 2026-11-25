import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { createPerfSnapshot, perf } from "./perfStats";
import { stressRun } from "./stressScenario";
import { hitsLine } from "./reversedHits";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";
import { netMeter } from "../net/netMeter";
import { activeThrottle, throttleLossText } from "../net/devThrottle";
import { urlOptions } from "./urlOptions";
import { gfxStatus } from "../render/gfx/gfxStatus";

/** Monospace text, CSS px × dpr (≥ 12 px rule). */
const TEXT_CSS_PX = 13;
const MARGIN_CSS_PX = 12;
const PAD_CSS_PX = 6;
/** Story 2.11: the overlay starts below the ☰ button (same right edge), with this gap. */
const BELOW_MENU_GAP_CSS_PX = 8;
const TOP_CSS_PX = MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + BELOW_MENU_GAP_CSS_PX;
/** The text is rebuilt 4 times a second, not every frame (string building allocates). */
const REFRESH_MS = 250;
/** The horde frame rate is measured over windows at least this long. */
const HORDE_RATE_WINDOW_MS = 1000;

/**
 * Performance overlay (Story 1.11), drawn in the HUD scene, top-right under the ☰ button (2.11): FPS and 1-s minimum, zombies
 * alive and in view, simulation step time, render time, the run seed (Story 4.4). Shown with `?debug=1`, a three-finger tap or
 * the stress scenario; available in release builds. Online (Story 2.10) it adds the network lines:
 * a TEST SCENARIO tag, ping / delay / jitter, down and up KB/s (payload, KB = 1024 B), horde frames
 * per second with corrections and snaps, and hits with reversed hits (2.7).
 */
export class PerfOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly snap = createPerfSnapshot();
  private nextRefreshMs = 0;
  private shownOn = false;
  /** Last text set: `setText` only when it changed. */
  private lastText = "";
  private hordeFrames = 0;
  private hordeAtMs = 0;
  private hordeRate = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const k = dpr();
    this.text = scene.add
      .text(0, 0, "", {
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: `${Math.round(TEXT_CSS_PX * k)}px`,
        color: "#e8ffe8",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: PAD_CSS_PX * k, y: PAD_CSS_PX * k },
      })
      .setOrigin(1, 0)
      .setDepth(1000)
      .setVisible(false);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private onResize(): void {
    const k = dpr();
    this.text.setFontSize(Math.round(TEXT_CSS_PX * k)).setPadding(PAD_CSS_PX * k, PAD_CSS_PX * k);
    this.nextRefreshMs = 0;
  }

  update(): void {
    const on = perf.overlayOn;
    if (on !== this.shownOn) {
      this.shownOn = on;
      this.text.setVisible(on);
      this.nextRefreshMs = 0;
      this.lastText = "";
    }
    if (!on) return;
    const now = performance.now();
    if (now < this.nextRefreshMs) return;
    this.nextRefreshMs = now + REFRESH_MS;
    const s = perf.snapshot(now, this.snap);
    const lines = [
      `FPS ${Math.round(s.fps)} (min ${Math.round(s.minFps)})`,
      `alive ${perf.alive} · in view ${perf.inView}`,
      `tick ${s.tickAvgMs.toFixed(1)} ms (max ${s.tickMaxMs.toFixed(1)})`,
      `render ${s.renderAvgMs.toFixed(1)} ms · upd ${s.updateAvgMs.toFixed(1)}`,
    ];
    // Story 4.4: the run seed (online the server's, from the room state).
    const seed = perf.net ? perf.net.runSeed : perf.soloSeed;
    if (seed !== null) lines.push(`seed ${seed}`);
    lines.push(gfxStatus.line()); // Story 4.13: WebGL / Canvas, lost / restored counts
    const net = perf.net;
    if (net) {
      const n = net.netStats;
      if (net.scenario) lines.unshift(`TEST SCENARIO ${net.scenario}`);
      else if (urlOptions().scenario && net.isHost) lines.unshift(`scenario ${urlOptions().scenario} refused by the server`);
      lines.push(`ping ${Math.round(n.rttMs)} ms · delay ${Math.round(n.delayMs)} ms · jitter ${Math.round(n.jitterMs)} ms${throttleLossText(activeThrottle.current)}`); // Story 8.8: + the lossy line
      lines.push(
        `down ${netMeter.downKBps(now).toFixed(1)} KB/s (avg ${netMeter.avgDownKBps(now).toFixed(1)}, peak ${netMeter.peakDownKBps(now).toFixed(1)}) · up ${netMeter.upKBps(now).toFixed(1)} KB/s`,
      );
      lines.push(`horde ${this.hordePerS(now, net.hordeStats.framesReceived)}/s · corrections ${n.corrections} · snaps ${n.snaps}`);
      lines.push(hitsLine(n));
    } else {
      const h = perf.hits;
      if (h) lines.push(hitsLine(h));
    }
    const st = stressRun.state;
    if (st.phase === "warmup") lines.push(`stress ${st.walkers}: warming up`);
    else if (st.phase === "running") lines.push(`stress ${st.walkers}: ${st.secondsLeft} s left`);
    else if (st.phase === "done" && st.result) {
      lines.push(`stress done: avg ${st.result.avgFps.toFixed(1)} · min ${st.result.minFps.toFixed(1)}`);
    }
    const k = dpr();
    const safe = safeArea();
    const text = lines.join("\n");
    if (text !== this.lastText) {
      this.lastText = text;
      this.text.setText(text);
    }
    this.text.setPosition(this.scene.scale.width - (MARGIN_CSS_PX + safe.right) * k, (TOP_CSS_PX + safe.top) * k);
  }

  /** Horde frames per second, over windows of at least HORDE_RATE_WINDOW_MS. */
  private hordePerS(nowMs: number, frames: number): number {
    const dt = nowMs - this.hordeAtMs;
    if (frames < this.hordeFrames || this.hordeAtMs === 0) {
      this.hordeFrames = frames; // a new host: start over
      this.hordeAtMs = nowMs;
    } else if (dt >= HORDE_RATE_WINDOW_MS) {
      this.hordeRate = Math.round(((frames - this.hordeFrames) * 1000) / dt);
      this.hordeFrames = frames;
      this.hordeAtMs = nowMs;
    }
    return this.hordeRate;
  }
}
