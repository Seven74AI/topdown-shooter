import * as Phaser from "phaser";
import { dpr, safeArea } from "../display";
import { createPerfSnapshot, perf } from "./perfStats";
import { stressRun } from "./stressScenario";
import { hitsLine } from "./reversedHits";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";

/** Monospace text, CSS px × dpr (≥ 12 px rule). */
const TEXT_CSS_PX = 13;
const MARGIN_CSS_PX = 12;
const PAD_CSS_PX = 6;
/** Story 2.11: the overlay starts below the ☰ button (same right edge), with this gap. */
const BELOW_MENU_GAP_CSS_PX = 8;
const TOP_CSS_PX = MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + BELOW_MENU_GAP_CSS_PX;
/** The text is rebuilt 4 times a second, not every frame (string building allocates). */
const REFRESH_MS = 250;

/**
 * Performance overlay (Story 1.11), drawn in the HUD scene, top-right under the ☰ button (2.11): FPS and 1-s minimum, zombies
 * alive and in view, simulation step time, render time. Shown with `?debug=1`, a three-finger tap or
 * the stress scenario; available in release builds. Room is left for the network lines of Story 2.10.
 */
export class PerfOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly snap = createPerfSnapshot();
  private nextRefreshMs = 0;
  private shownOn = false;

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
    const h = perf.hits;
    if (h) lines.push(hitsLine(h));
    const st = stressRun.state;
    if (st.phase === "warmup") lines.push(`stress ${st.walkers}: warming up`);
    else if (st.phase === "running") lines.push(`stress ${st.walkers}: ${st.secondsLeft} s left`);
    else if (st.phase === "done" && st.result) {
      lines.push(`stress done: avg ${st.result.avgFps.toFixed(1)} · min ${st.result.minFps.toFixed(1)}`);
    }
    const k = dpr();
    const safe = safeArea();
    this.text
      .setText(lines.join("\n"))
      .setPosition(this.scene.scale.width - (MARGIN_CSS_PX + safe.right) * k, (TOP_CSS_PX + safe.top) * k);
  }
}
