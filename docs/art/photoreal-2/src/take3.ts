/**
 * Characters, take 3 (designer 2026-11-25: "use [the Meshy pictures] as reference … a take 3, in game code,
 * photorealistic"). Game code only (Canvas 2D, like all the game's art); the four Meshy pictures in
 * ../refs are the target look: a cool key light from the upper left with deep soft shadows, cloth that
 * folds across the limbs and tears at the edges, spread fingers, detailed hair, muted colours. Unlike the
 * pictures (seen at an angle), these are strictly top-down, as the game's sprites must be.
 *
 * Engine: rounded body parts (ellipsoids, capsules) meeting as volumes, with torn edges, anisotropic folds,
 * regions for lettering and stitching, lit with a cool key and a dark ambient. 68 px per body radius (2× the
 * game's), 3× supersampled.
 */
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, fbm, hash2, night, rng, type G } from "../../asset-fixes-1/src/lib";
import { mix, cl, type Rgb } from "../../photoreal-1/src/relief";
import { R, TAU, build, cap, ell, hand, head, type Look, type Prim } from "./t3engine";

declare const REFS: Record<string, string>; // the Meshy reference pictures (data URLs), injected by build.mjs

// ─────────────────────────────── the four characters ───────────────────────────────

/** Walker (Meshy ref "zombie_walker"): torn blue-grey work shirt, bloody shoulders, grey-green arms reaching, matted hair. */
function walker(): HTMLCanvasElement {
  const shirt: Rgb = [84, 96, 112];
  const look: Look = { skin: [128, 140, 118], cloth: shirt, hair: [44, 38, 30], blood: 0.9, seed: 301 };
  const prims: Prim[] = [
    ell(-0.2, 0, 0.52, 0.98, 0.32, 0.3, "cloth", { torn: 0.25, fold: Math.PI / 2 }), // back and shoulders, torn hem
    cap(0.0, -0.66, 0.5, -0.7, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }), // ragged sleeves
    cap(0.0, 0.66, 0.55, 0.62, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }),
    cap(0.48, -0.7, 1.12, -0.6, 0.12, 0.32, 0.13, "zskin"), // bare forearms
    cap(0.53, 0.62, 1.18, 0.68, 0.12, 0.32, 0.13, "zskin"),
    ...hand(1.2, -0.6, 0.12, 0.2, "zskin", 0.22),
    ...hand(1.26, 0.68, -0.08, 0.2, "zskin", 0.25),
    ell(-0.05, -0.55, 0.09, 0.12, 0.6, 0.02, "wound", { torn: 0.3 }), // bite wounds on the shoulders
    ell(-0.15, 0.5, 0.07, 0.09, 0.6, 0.02, "wound", { torn: 0.3 }),
    ...head(0.14, 0, 0.44, "zskin", 0.75, 0.3),
  ];
  return build({ prims, extent: 1.55, look });
}

/** Brute BR1 (Meshy ref "zombie_brute"): black riot armour, segmented shoulder pads, POLICE plate, gloved fists, cracked helmet. */
function brute(): HTMLCanvasElement {
  const look: Look = { skin: [118, 124, 104], cloth: [32, 34, 38], hair: [20, 20, 20], blood: 0.35, seed: 311 };
  const armour: Rgb = [26, 27, 31];
  const pads: Prim[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) pads.push(ell(0.06 - k * 0.11, s * (0.93 + k * 0.03), 0.3 - k * 0.05, 0.27 - k * 0.04, 0.5 + k * 0.07, 0.08, "plastic", { col: armour })); // layered shoulder pads
  const prims: Prim[] = [
    cap(0.0, -0.8, 0.82, -0.72, 0.22, 0.36, 0.22, "cloth", { fold: 0.2 }), // black padded sleeves
    cap(0.0, 0.8, 0.82, 0.72, 0.22, 0.36, 0.22, "cloth", { fold: -0.2 }),
    ell(0.45, -0.77, 0.15, 0.21, 0.56, 0.1, "plastic", { col: armour }), // elbow guards
    ell(0.45, 0.77, 0.15, 0.21, 0.56, 0.1, "plastic", { col: armour }),
    ell(1.05, -0.7, 0.27, 0.24, 0.38, 0.26, "plastic", { col: [30, 30, 32] }), // gloved fists
    ell(1.05, 0.7, 0.27, 0.24, 0.38, 0.26, "plastic", { col: [30, 30, 32] }),
    ell(-0.2, 0, 0.62, 1.08, 0.38, 0.34, "cloth"),
    ell(-0.3, 0, 0.5, 0.84, 0.58, 0.22, "plastic", { col: [36, 38, 42] }), // back plate
    ...pads,
    ...head(0.22, 0, 0.37, "zskin", 0),
    ell(0.16, 0, 0.44, 0.42, 1.12, 0.26, "plastic", { col: [18, 19, 22] }), // helmet
    ell(0.55, 0, 0.1, 0.32, 1.1, 0.12, "metal", { col: [60, 74, 90] }), // visor
  ];
  return build({
    prims,
    extent: 1.5,
    look,
    regions: {
      letters: (g) => {
        g.save();
        g.translate(-0.3 * R, 0);
        g.rotate(Math.PI / 2);
        g.font = `700 ${Math.round(0.26 * R)}px Oswald, Impact, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("POLICE", 0, 0);
        g.restore();
      },
      plate: (g) => {
        g.save();
        g.translate(-0.3 * R, 0);
        g.fillRect(-0.17 * R, -0.5 * R, 0.34 * R, 1.0 * R);
        g.restore();
      },
      crack: (g) => {
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0.05 * R, -0.3 * R);
        g.lineTo(0.15 * R, -0.12 * R);
        g.lineTo(0.08 * R, 0.02 * R);
        g.lineTo(0.2 * R, 0.15 * R);
        g.stroke();
      },
    },
    albedo: (rx, ry, c, r) => {
      if ((r.letters ?? 0) > 0.5) return mix([176, 178, 182], [120, 122, 126], cl(fbm(rx * 30, ry * 30, 5, 2) - 0.3)); // worn print
      if ((r.plate ?? 0) > 0.5) c = mix(c, [58, 60, 64], 0.6); // the badge plate
      if ((r.crack ?? 0) > 0.5) c = [110, 116, 124];
      return c;
    },
  });
}

/** Survivor (Meshy ref "survivor_pistol"): blue jacket, dark baseball cap, small dark backpack, pistol in both hands. */
function survivorPistol(): HTMLCanvasElement {
  const look: Look = { skin: [196, 152, 120], cloth: [56, 84, 120], hair: [50, 36, 24], blood: 0, seed: 321 };
  const prims: Prim[] = [
    ell(-0.62, 0, 0.32, 0.6, 0.42, 0.3, "cloth", { col: [36, 36, 34], fold: Math.PI / 2 }), // backpack
    cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"), // its straps over the shoulders
    cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
    ell(-0.1, 0, 0.52, 0.96, 0.34, 0.3, "cloth", { fold: Math.PI / 2 }), // jacket
    cap(0.05, -0.68, 0.6, -0.34, 0.17, 0.34, 0.16, "cloth"), // arms to the grip
    cap(0.05, 0.68, 0.56, 0.4, 0.17, 0.34, 0.16, "cloth"),
    cap(0.6, -0.34, 0.95, -0.06, 0.11, 0.36, 0.11, "skin"),
    cap(0.56, 0.4, 0.92, 0.1, 0.11, 0.36, 0.11, "skin"),
    ell(1.15, 0.02, 0.24, 0.07, 0.46, 0.07, "metal"), // pistol
    ell(0.98, 0.02, 0.13, 0.15, 0.46, 0.1, "skin"), // hands wrapped round the grip
    ...head(0.08, 0, 0.43, "skin", 0.5, 0),
    ell(0.04, 0, 0.45, 0.43, 1.05, 0.22, "cloth", { col: [30, 34, 38] }), // cap crown
    ell(0.5, 0, 0.21, 0.35, 0.99, 0.06, "cloth", { col: [30, 34, 38] }), // brim
  ];
  return build({
    prims,
    extent: 2.7,
    look,
    regions: {
      seams: (g) => {
        g.lineWidth = 1;
        g.beginPath();
        for (const a of [0.5, 1.6, 2.6]) {
          g.moveTo(0.04 * R, 0);
          g.lineTo(0.04 * R + Math.cos(a + Math.PI) * 0.43 * R, Math.sin(a + Math.PI) * 0.43 * R);
        }
        g.stroke();
      },
      button: (g) => {
        g.beginPath();
        g.arc(0.04 * R, 0, 0.05 * R, 0, TAU);
        g.fill();
      },
      buckle: (g) => [-1, 1].forEach((s) => g.fillRect(-0.36 * R, s * 0.56 * R - 2, 6, 5)),
    },
    albedo: (_rx, _ry, c, r) => {
      if ((r.button ?? 0) > 0.5) return [36, 40, 44];
      if ((r.seams ?? 0) > 0.5) return mix(c, [12, 14, 16], 0.5);
      if ((r.buckle ?? 0) > 0.5) return [120, 122, 126];
      return c;
    },
  });
}

/** Survivor (Meshy ref "survivor_shotgun"): olive field jacket, ponytail, backpack, pump shotgun. */
function survivorShotgun(): HTMLCanvasElement {
  const look: Look = { skin: [200, 158, 126], cloth: [86, 88, 58], hair: [92, 66, 40], blood: 0, seed: 331 };
  const prims: Prim[] = [
    ell(-0.62, 0.02, 0.34, 0.62, 0.42, 0.3, "cloth", { col: [70, 62, 44], fold: Math.PI / 2 }), // backpack
    cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"),
    cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
    ell(-0.1, 0, 0.5, 0.92, 0.34, 0.3, "cloth", { fold: Math.PI / 2 }), // field jacket
    cap(0.05, -0.64, 0.62, -0.28, 0.16, 0.34, 0.15, "cloth"),
    cap(0.05, 0.64, 0.5, 0.36, 0.16, 0.34, 0.15, "cloth"),
    cap(0.62, -0.28, 1.2, 0.06, 0.1, 0.38, 0.1, "skin"), // left hand forward on the pump
    cap(0.5, 0.36, 0.72, 0.16, 0.1, 0.38, 0.1, "skin"), // right hand at the grip
    cap(0.3, 0.17, 0.78, 0.14, 0.1, 0.42, 0.08, "wood"), // stock against the shoulder
    cap(0.6, 0.12, 2.2, 0.06, 0.055, 0.45, 0.05, "metal"), // barrel and magazine tube
    cap(1.1, 0.1, 1.55, 0.08, 0.08, 0.45, 0.07, "wood"), // pump
    ell(1.22, 0.06, 0.12, 0.11, 0.5, 0.09, "skin"),
    ell(0.72, 0.16, 0.11, 0.11, 0.5, 0.09, "skin"),
    ...head(0.08, 0, 0.41, "skin", 0.85, 0),
    cap(-0.32, 0, -0.88, 0.05, 0.11, 1.0, 0.12, "hair", { fold: 0 }), // the ponytail down the back
    ell(-0.3, 0, 0.07, 0.1, 1.08, 0.06, "strap", { col: [20, 20, 20] }), // its band
  ];
  return build({
    prims,
    extent: 2.7,
    look,
    regions: {
      zip: (g) => {
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0.35 * R, -0.05 * R);
        g.lineTo(0.38 * R, 0.4 * R);
        g.stroke();
      },
      pockets: (g) => {
        g.lineWidth = 1;
        for (const s of [-1, 1]) g.strokeRect(-0.25 * R, s * 0.6 * R - 0.12 * R, 0.24 * R, 0.24 * R);
      },
    },
    albedo: (_rx, _ry, c, r) => {
      if ((r.zip ?? 0) > 0.5) return [40, 40, 36];
      if ((r.pockets ?? 0) > 0.5) return mix(c, [20, 20, 16], 0.5);
      return c;
    },
  });
}

// ─────────────────────────────── page ───────────────────────────────

const R_NOW = R;
function nowFigure(extent: number, draw: (g: G, r: number) => void): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R_NOW);
  const c = canvas(N, N);
  const g = ctx(c);
  g.translate(N / 2, N / 2);
  draw(g, R_NOW);
  return c;
}

function onStreet(obj: HTMLCanvasElement, size: number, zoom = 0.9): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  night(g, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]); // the street at night, lit from the upper left
  const s = (size * zoom) / obj.width;
  const off = (size - obj.width * s) / 2;
  g.save();
  g.globalAlpha = 0.6;
  g.filter = "blur(6px) brightness(0)";
  g.drawImage(obj, off + 10, off + 15, obj.width * s, obj.height * s);
  g.restore();
  g.drawImage(obj, off, off, obj.width * s, obj.height * s);
  return c;
}

const ITEMS = [
  { ref: "zombie_walker", name: "Walker", make: walker, now: () => nowFigure(1.55, (g, r) => drawZombie(g, "walker", r, 0)), zoom: 0.9 },
  { ref: "zombie_brute", name: "Brute (riot cop)", make: brute, now: () => nowFigure(1.5, (g, r) => drawZombie(g, "brute", r, 0)), zoom: 0.9 },
  { ref: "survivor_pistol", name: "Survivor (pistol)", make: survivorPistol, now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r)), zoom: 1.5 },
  { ref: "survivor_shotgun", name: "Survivor (shotgun)", make: survivorShotgun, now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r, (c, rr) => WEAPON_ART.shotgun?.(c, "held", rr))), zoom: 1.5 },
];

async function main(): Promise<void> {
  try {
    await document.fonts.load('700 20px "Oswald"');
  } catch {
    // fallback face
  }
  const list = document.getElementById("list") as HTMLElement;
  for (const it of ITEMS) {
    const row = document.createElement("article");
    row.className = "trio";
    row.innerHTML = `<h3>${it.name}</h3><div class="cols"><figure><img alt="Meshy reference" src="${REFS[it.ref]}"><figcaption>Meshy reference</figcaption></figure><figure><figcaption>Now</figcaption></figure><figure><figcaption>Take 3</figcaption></figure></div>`;
    const figs = row.querySelectorAll("figure");
    (figs[1] as HTMLElement).prepend(onStreet(it.now(), 300, it.zoom));
    (figs[2] as HTMLElement).prepend(onStreet(it.make(), 300, it.zoom));
    list.append(row);
    await new Promise((res) => setTimeout(res, 0));
  }
  document.getElementById("loading")?.remove();
  void hash2;
  void rng;
}

void main();
