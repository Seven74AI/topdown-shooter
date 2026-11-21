import * as Phaser from "phaser";
import { h, render } from "preact";
import { dpr } from "./display";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { HudScene } from "./scenes/HudScene";
import { RotateOverlay } from "./ui/RotateOverlay";
import "./ui/overlay.css";

// Phaser 4 has no `resolution` option: size the canvas in device pixels
// (capped at MAX_DPR) and zoom it back down to the CSS viewport.
const deviceSize = (): [number, number] => [
  Math.round(window.innerWidth * dpr()),
  Math.round(window.innerHeight * dpr()),
];

/** Touch pointers Phaser tracks: move stick + aim stick + one HUD button. */
const ACTIVE_TOUCH_POINTERS = 3;

const [width, height] = deviceSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#000000",
  width,
  height,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  input: { activePointers: ACTIVE_TOUCH_POINTERS },
  scene: [BootScene, GameScene, HudScene],
});

window.addEventListener("resize", () => {
  game.scale.resize(...deviceSize());
  game.scale.setZoom(1 / dpr());
});

const ui = document.getElementById("ui");
if (ui) render(h(RotateOverlay, {}), ui);
