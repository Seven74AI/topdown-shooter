/**
 * Story 7.8: contact sheet of every catalogue part drawn by the game code (`drawSurvivor` + `survivorParts.ts`),
 * big and at game size (r = 14 px), default colours and a sample colour set. Run: npx tsx docs/art/7-8/sheet.ts
 */
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { COSMETICS, DEFAULT_LOOK, type SurvivorLook } from "@topdown/shared";
import { drawSurvivor } from "../../../apps/client/src/render/city/spriteArt";
import { resolveLook } from "../../../apps/client/src/render/city/survivorLook";

const SAMPLE = { top: "#b8336a", hair: "#8a5a2b", accent: "#e0b33a" };
const CELL = 150;
const cols = 9;
const rows = Math.ceil(COSMETICS.parts.length / cols) * 2;
const cv = createCanvas(cols * CELL, rows * CELL);
const g = cv.getContext("2d") as unknown as CanvasRenderingContext2D;
g.fillStyle = "#16181b";
g.fillRect(0, 0, cv.width, cv.height);
COSMETICS.parts.forEach((p, i) => {
  for (const sample of [false, true]) {
    const l: Record<string, unknown> = { ...DEFAULT_LOOK, [p.slot]: p.id, colours: sample ? SAMPLE : DEFAULT_LOOK.colours };
    if (p.slot === "hair") l.head = "none";
    if (p.slot === "skin") { l.head = "none"; l.hair = "bald"; }
    const look = resolveLook(l as SurvivorLook, 1);
    const x = (i % cols) * CELL;
    const y = (Math.floor(i / cols) * 2 + (sample ? 1 : 0)) * CELL;
    g.fillStyle = sample ? "#1c1e22" : "#1a1c1f";
    g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    g.save(); g.translate(x + 62, y + 70); g.rotate(-Math.PI / 2); drawSurvivor(g, 30, undefined, undefined, look); g.restore();
    g.save(); g.translate(x + 128, y + 110); g.rotate(-Math.PI / 2); drawSurvivor(g, 14, undefined, undefined, look); g.restore();
    g.fillStyle = "#d9d4c7"; g.font = "12px sans-serif"; g.fillText(`${p.slot}:${p.id}`, x + 6, y + 144);
  }
});
writeFileSync(new URL("./ingame/parts-sheet.png", import.meta.url), cv.toBuffer("image/png"));
console.log("wrote parts-sheet.png", cv.width, cv.height);
