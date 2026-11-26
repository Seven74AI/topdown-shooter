/**
 * Photoreal, group 5: FX (designer 2026-11-26, "A: FX"; the Behemoth's warning art IN: "I'm curious to see how they
 * would look like. So add them too."). Built into ../compare.html by build.mjs.
 *
 * ONE idea for the whole group (the skill's "one coherent model", applied to a family of effects):
 *   "Every effect is light or matter, and the street keeps the mark."
 * - LIGHT (muzzle flash, fire, blast flash, sparks, acid glow, the boss warnings) is emitted: added on top, a white-hot
 *   core that cools to its colour by temperature, a short pool of light on the ground and on bodies nearby, gone first.
 * - MATTER (blood, bile, bits, chunks, smoke, dust, gas, acid, rain) is lit by the street's one key light from the upper
 *   left (cool tint), solid bits cast a soft shadow down-right, it is thrown away from its cause, falls and settles.
 *   Only acid / infection glows (yellow-green), never blood or smoke.
 * - THE MARK (scorch, blood, acid puddle, crater, cracks, wet patch) is what stays: matte, darker than the street,
 *   fading on the game's own lifetimes.
 * - ONE CLOCK per event: light peaks first (0–0.05 s), matter flies (to ~0.4 s), smoke and dust rise after
 *   (secondary follows), the mark stays. Colours keep their meaning: red = danger (boss warnings, zombies), amber = an
 *   event you can use (CRASH), yellow-green = acid / gas / infection, white = pick-ups and people. Blood is dark
 *   red-brown, never the warning red.
 *
 * Page shell: the cards come from the family modules (see kit.ts for the contract). Query `?only=<family>` or
 * `?card=<id>` draws a part of the page (faster checks).
 */
import { LANES, make, idle, drawStats, type FxCard, type Look, type Stage } from "./kit";
import { cards as gunfire } from "./gunfire";
import { cards as fire } from "./fire";
import { cards as matter } from "./matter";
import { cards as telegraphs } from "./telegraphs";

const FAMILIES: readonly { id: FxCard["family"]; title: string; intro: string; cards: readonly FxCard[] }[] = [
  { id: "gunfire", title: "Gunfire, hits and blood", intro: "What every shot and every hit shows: the flash at the muzzle, the round in flight, the hit on a body, the blood, the melee arcs and sparks, and the small rings when you repair, upgrade, sell or a trap snaps.", cards: gunfire },
  { id: "fire", title: "Fire and explosions", intro: "Grenades, the launcher, mines, the Molotov, the flamethrower and everything that burns, plus the Bloater's burst.", cards: fire },
  { id: "matter", title: "Acid, gas, dust and rain", intro: "Spitter acid, gas clouds, smoke from events, the ruins' dust and grit, the dust when you place a building, rain and puddles, and the Behemoth's dust.", cards: matter },
  { id: "telegraphs", title: "The Behemoth's warnings", intro: "In group 5 on the designer's call (\"I'm curious to see how they would look like\"). Every take keeps what the warning tells you, its size and its timing: red = get out, amber = your window.", cards: telegraphs },
];

const Q = new URLSearchParams(location.search);
const ONLY = Q.get("only");
const ONLY_CARD = Q.get("card");
const GAME_PXM = 36;
const ZOOM_W = 360;
let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let speed = 1;
let low = false;

/* ---------------- The night street (same for every column) ---------------- */
const streets = new Map<string, HTMLCanvasElement>();
function street(w: number, h: number, pxm: number): HTMLCanvasElement {
  const key = `${w}x${h}@${pxm}`;
  const hit = streets.get(key);
  if (hit) return hit;
  const c = make(w, h);
  const g = c.getContext("2d")!;
  g.fillStyle = "#23282d";
  g.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = Math.round((w * h) / 45);
  const grain = Math.max(1, Math.min(2, pxm / 48));
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "120,130,140"},${0.04 + rnd() * 0.08})`;
    g.fillRect(rnd() * w, rnd() * h, grain * (1 + rnd() * 1.5), grain * (1 + rnd() * 1.5));
  }
  // a worn lane line across the lower part, for scale (0.12 m wide)
  g.fillStyle = "rgba(200,196,170,0.10)";
  for (let x = 0; x < w; x += pxm * 3) g.fillRect(x, h * 0.86, pxm * 1.8, pxm * 0.12);
  const vg = g.createRadialGradient(w * 0.35, h * 0.3, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(255,226,170,0.05)");
  vg.addColorStop(1, "rgba(0,0,0,0.38)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  streets.set(key, c);
  return c;
}

/* ---------------- Drawing one look at a time ---------------- */
function stageFor(card: FxCard, w: number, h: number, pxm: number, seed: number, only: string | null = null): Stage {
  const [ox, oy] = card.origin ?? [0.5, 0.5];
  return { pxm, w, h, cx: w * ox, cy: h * oy, only, seed, low };
}
function paint(c: HTMLCanvasElement, card: FxCard, look: Look, t: number, pxm: number, seed: number, only: string | null = null, bg = true): void {
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  if (bg) g.drawImage(street(c.width, c.height, pxm), 0, 0);
  else g.clearRect(0, 0, c.width, c.height);
  const st = stageFor(card, c.width, c.height, pxm, seed, only);
  if (bg && card.under) card.under(g, t, st);
  look.draw(g, t, st);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

interface Live {
  card: FxCard;
  look: Look;
  zoom: HTMLCanvasElement;
  small: HTMLCanvasElement;
  visible: boolean;
}
const live: Live[] = [];
const loopOf = (card: FxCard): number => card.lengthS + (card.gapS ?? 0.6);

function frame(ms: number): void {
  const tS = (ms / 1000) * speed;
  for (const l of live) {
    if (!l.visible) continue;
    const L = loopOf(l.card);
    const n = Math.floor(tS / L);
    const t = playing ? tS - n * L : (l.card.keyT[Math.min(1, l.card.keyT.length - 1)] ?? 0);
    const seed = playing ? n : 0;
    paint(l.zoom, l.card, l.look, t, l.zoom.width / l.card.viewM, seed);
    paint(l.small, l.card, l.look, t, GAME_PXM, seed);
  }
  if (playing) requestAnimationFrame(frame);
}
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const l = live.find((x) => x.zoom === e.target);
    if (l) l.visible = e.isIntersecting;
  }
  if (!playing) requestAnimationFrame(frame);
});

/* ---------------- Card ---------------- */
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function dope(card: FxCard): string {
  const p = card.plan;
  if (!p) return "";
  const ticks: number[] = [];
  const step = p.lengthS > 4 ? 1 : p.lengthS > 1.5 ? 0.5 : p.lengthS > 0.6 ? 0.1 : 0.05;
  for (let t = 0; t <= p.lengthS + 1e-6; t += step) ticks.push(t);
  const pct = (t: number): string => `${(t / p.lengthS) * 100}%`;
  return `<div class="plan"><p class="goal"><b>Goal:</b> ${p.goal}</p><p class="timing">${p.timing}</p>
    <div class="dope"><div class="ruler"><span></span><div class="track">${ticks.map((t) => `<i style="left:${pct(t)}">${Number(t.toFixed(2))} s</i>`).join("")}</div></div>
    ${LANES.filter(([id]) => p.lanes[id]?.length)
      .map(
        ([id, label]) =>
          `<div class="lane"><span>${label}</span><div class="track">${(p.lanes[id] ?? [])
            .map((b) => `<div class="bar${b.key ? " key" : ""}${b.nw ? " nw" : ""}" style="left:${pct(b.t0)};width:calc(${pct(Math.max(0.0001, b.t1 - b.t0))} - 2px)" title="${esc(b.label)}">${b.label}</div>`)
            .join("")}</div></div>`,
      )
      .join("")}</div></div>`;
}

async function buildCard(card: FxCard, host: HTMLElement): Promise<void> {
  const art = document.createElement("article");
  art.className = "card fx";
  art.id = card.id;
  const takeCodes = card.looks.filter((l) => l.code !== "now").map((l) => l.code).join(" · ");
  art.innerHTML = `<h3><small>${card.code}</small>${card.name}<span class="codes">${takeCodes}</span></h3>
    <div class="cols2"><div><h4>Brief</h4><div class="txt">${card.brief}</div></div><div><h4>In the game now</h4><div class="txt">${card.game}</div></div></div>
    <div class="looks"></div>
    ${card.plan ? `<h4>Action plan (timeline)</h4>${dope(card)}` : ""}
    <details class="decomp"><summary>Decomposition: frames, diffs, parts, performance</summary><div class="dhost"></div></details>`;
  host.append(art);
  const looks = art.querySelector(".looks")!;
  const aspect = card.aspect ?? 0.75;
  for (const look of card.looks) {
    await look.bake();
    await idle();
    const fig = document.createElement("figure");
    fig.className = look.code === "now" ? "now" : "";
    const zoom = make(ZOOM_W, Math.round(ZOOM_W * aspect));
    const sw = Math.round(card.viewM * GAME_PXM);
    const small = make(sw, Math.round(sw * aspect));
    const row = document.createElement("div");
    row.className = "pair";
    const zw = document.createElement("div");
    zw.className = "zoom";
    zw.append(zoom);
    const sm = document.createElement("div");
    sm.className = "game";
    sm.append(small);
    sm.insertAdjacentHTML("beforeend", `<span>game size</span>`);
    row.append(zw, sm);
    fig.append(row);
    fig.insertAdjacentHTML("beforeend", `<figcaption>${look.code === "now" ? "Now" : look.code} · ${look.title}</figcaption><p class="note">${look.note}</p>`);
    // the composed key moments (stills)
    const stills = document.createElement("div");
    stills.className = "stills";
    for (const t of card.keyT) {
      const c = make(150, Math.round(150 * aspect));
      paint(c, card, look, t, c.width / card.viewM, 0);
      const f = document.createElement("figure");
      f.append(c);
      f.insertAdjacentHTML("beforeend", `<figcaption>${t.toFixed(2)} s</figcaption>`);
      stills.append(f);
    }
    fig.append(stills);
    looks.append(fig);
    const l: Live = { card, look, zoom, small, visible: false };
    live.push(l);
    io.observe(zoom);
    paint(zoom, card, look, card.keyT[Math.min(1, card.keyT.length - 1)] ?? 0, zoom.width / card.viewM, 0);
    paint(small, card, look, card.keyT[Math.min(1, card.keyT.length - 1)] ?? 0, GAME_PXM, 0);
  }
  const det = art.querySelector("details")!;
  det.addEventListener("toggle", () => {
    if (det.open && !det.dataset.built) {
      det.dataset.built = "1";
      void decompose(card, det.querySelector(".dhost") as HTMLElement);
    }
  });
  if (Q.get("open") === card.id || Q.get("open") === "all") det.open = true;
}

/* ---------------- Decomposition ---------------- */
const SMALL = 132;
function thumb(src: HTMLCanvasElement, label: string, cls = ""): HTMLElement {
  const f = document.createElement("figure");
  if (cls) f.className = cls;
  const c = make(SMALL, SMALL);
  const g = c.getContext("2d")!;
  g.fillStyle = "#1a1f24";
  g.fillRect(0, 0, SMALL, SMALL);
  const k = Math.min(SMALL / src.width, SMALL / src.height);
  g.drawImage(src, (SMALL - src.width * k) / 2, (SMALL - src.height * k) / 2, src.width * k, src.height * k);
  f.append(c);
  f.insertAdjacentHTML("beforeend", `<figcaption>${label}</figcaption>`);
  return f;
}
/** Pixels that differ between two pictures, in magenta over the second one (dimmed). Returns the changed share. */
function diff(a: HTMLCanvasElement, b: HTMLCanvasElement): { pic: HTMLCanvasElement; share: number } {
  const w = a.width;
  const h = a.height;
  const da = a.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const db = b.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const c = make(w, h);
  const g = c.getContext("2d")!;
  g.globalAlpha = 0.35;
  g.drawImage(b, 0, 0);
  g.globalAlpha = 1;
  const img = g.getImageData(0, 0, w, h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    const d = Math.abs((da[j] as number) - (db[j] as number)) + Math.abs((da[j + 1] as number) - (db[j + 1] as number)) + Math.abs((da[j + 2] as number) - (db[j + 2] as number)) + Math.abs((da[j + 3] as number) - (db[j + 3] as number));
    if (d > 24) {
      n++;
      img.data[j] = 255;
      img.data[j + 1] = 0;
      img.data[j + 2] = 255;
      img.data[j + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { pic: c, share: n / (w * h) };
}
/** Inspector: the whole picture greyed, the part alone in flat cyan on top. */
function inspect(card: FxCard, look: Look, part: string, t: number): HTMLCanvasElement {
  const W = 240;
  const H = Math.round(W * (card.aspect ?? 0.75));
  const full = make(W, H);
  paint(full, card, look, t, W / card.viewM, 0);
  const only = make(W, H);
  paint(only, card, look, t, W / card.viewM, 0, part, false);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  g.filter = "grayscale(1) brightness(0.55)";
  g.drawImage(full, 0, 0);
  g.filter = "none";
  const og = only.getContext("2d")!;
  og.globalCompositeOperation = "source-in";
  og.fillStyle = "rgba(0,229,255,0.95)";
  og.fillRect(0, 0, W, H);
  g.drawImage(only, 0, 0);
  return c;
}
async function decompose(card: FxCard, host: HTMLElement): Promise<void> {
  for (const look of card.looks) {
    const sec = document.createElement("div");
    sec.className = "dlook";
    sec.innerHTML = `<h4>${look.code === "now" ? "Now (the game today)" : look.code + " · " + look.title}</h4>`;
    host.append(sec);
    // textures
    const tx = look.textures();
    const bytes = tx.reduce((s, x) => s + x.canvas.width * x.canvas.height * 4, 0);
    const trow = document.createElement("div");
    trow.className = "strip";
    for (const x of tx) trow.append(thumb(x.canvas, `${x.name} · ${x.canvas.width}×${x.canvas.height}${x.note ? " · " + x.note : ""}`));
    sec.insertAdjacentHTML("beforeend", `<p class="small">Textures: <b>${tx.length}</b>, ${(bytes / 1024).toFixed(0)} KB of video memory (RGBA).</p>`);
    sec.append(trow);
    await idle();
    // frames + diffs
    if (look.frames?.length) {
      sec.insertAdjacentHTML("beforeend", `<p class="small">Frames the game shows, in order, and the pixels that change from the frame before (magenta). Identical frames are flagged.</p>`);
      const fr = document.createElement("div");
      fr.className = "strip";
      let prev: HTMLCanvasElement | null = null;
      for (const f of look.frames) {
        const c = make(200, Math.round(200 * (card.aspect ?? 0.75)));
        paint(c, card, look, f.t, c.width / card.viewM, 0);
        fr.append(thumb(c, `${f.label} · ${f.t.toFixed(2)} s · ${f.when}`));
        if (prev) {
          const d = diff(prev, c);
          fr.append(thumb(d.pic, d.share < 0.0005 ? "⚠ IDENTICAL to the frame before" : `diff: ${(d.share * 100).toFixed(1)} % changed`, "diffc" + (d.share < 0.0005 ? " bad" : "")));
        }
        prev = c;
        await idle();
      }
      sec.append(fr);
    }
    // parts
    if (look.parts?.length) {
      sec.insertAdjacentHTML("beforeend", `<p class="small">Element inspector: each part alone in cyan, the rest greyed, at every key moment.</p>`);
      const tb = document.createElement("div");
      tb.className = "itable";
      for (const p of look.parts) {
        const row = document.createElement("div");
        row.className = "strip";
        row.insertAdjacentHTML("beforeend", `<span class="plabel">${p.label}</span>`);
        for (const t of card.keyT) row.append(thumb(inspect(card, look, p.id, t), `${t.toFixed(2)} s`));
        tb.append(row);
        await idle();
      }
      sec.append(tb);
    }
    // peak sprites
    const peak = peakSprites(card, look);
    sec.insertAdjacentHTML("beforeend", `<p class="small">Sprites on screen per event: peak <b>${peak.peak}</b> (at ${peak.at.toFixed(2)} s), ${peak.add} of them additive.</p>`);
  }
  if (card.findings?.length) host.insertAdjacentHTML("beforeend", `<h4>Findings</h4><ul class="finds">${card.findings.map((f) => `<li>${f}</li>`).join("")}</ul>`);
  host.insertAdjacentHTML("beforeend", `<h4>Performance</h4><div class="txt">${card.perf}</div>`);
}
function peakSprites(card: FxCard, look: Look): { peak: number; at: number; add: number } {
  const c = make(64, 48);
  let peak = 0;
  let at = 0;
  let add = 0;
  for (let i = 0; i <= 40; i++) {
    const t = (card.lengthS * i) / 40;
    drawStats.sprites = 0;
    drawStats.additive = 0;
    paint(c, card, look, t, 64 / card.viewM, 0, null, false);
    if (drawStats.sprites > peak) {
      peak = drawStats.sprites;
      at = t;
      add = drawStats.additive;
    }
  }
  return { peak, at, add };
}

/* ---------------- Page ---------------- */
async function main(): Promise<void> {
  const host = document.getElementById("fams")!;
  const loading = document.getElementById("loading")!;
  const toc = document.getElementById("toc")!;
  for (const fam of FAMILIES) {
    if (ONLY && ONLY !== fam.id) continue;
    const cards = fam.cards.filter((c) => !ONLY_CARD || c.id === ONLY_CARD);
    if (!cards.length) continue;
    toc.insertAdjacentHTML("beforeend", `<li><a href="#fam-${fam.id}">${fam.title}</a>: ${cards.map((c) => `<a href="#${c.id}">${c.code}</a>`).join(" ")}</li>`);
    const sec = document.createElement("section");
    sec.id = `fam-${fam.id}`;
    sec.innerHTML = `<h2>${fam.title}</h2><p>${fam.intro}</p>`;
    host.append(sec);
    for (const card of cards) {
      loading.textContent = `Drawing ${card.name}…`;
      await buildCard(card, sec);
    }
  }
  loading.remove();
  perfTable();
  document.body.dataset.ready = "1";
  if (playing) requestAnimationFrame(frame);
}
function perfTable(): void {
  const host = document.getElementById("perf")!;
  const rows: string[] = [];
  for (const fam of FAMILIES)
    for (const card of fam.cards) {
      if (ONLY && ONLY !== fam.id) continue;
      if (ONLY_CARD && card.id !== ONLY_CARD) continue;
      for (const look of card.looks) {
        const tx = look.textures();
        const kb = tx.reduce((s, x) => s + x.canvas.width * x.canvas.height * 4, 0) / 1024;
        const p = peakSprites(card, look);
        rows.push(`<tr><td>${card.code}</td><td>${look.code === "now" ? "Now" : look.code}</td><td>${tx.length}</td><td>${kb.toFixed(0)} KB</td><td>${p.peak} (${p.add} add)</td></tr>`);
      }
    }
  host.innerHTML = `<table class="perft"><thead><tr><th>Element</th><th>Look</th><th>Textures</th><th>Memory</th><th>Peak sprites / event</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

const animBtn = document.getElementById("anim")!;
animBtn.setAttribute("aria-pressed", String(playing));
animBtn.textContent = playing ? "Animation on" : "Animation off";
animBtn.addEventListener("click", () => {
  playing = !playing;
  animBtn.setAttribute("aria-pressed", String(playing));
  animBtn.textContent = playing ? "Animation on" : "Animation off";
  requestAnimationFrame(frame);
});
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
  b.addEventListener("click", () => {
    speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll("[data-speed]")) o.setAttribute("aria-pressed", String(o === b));
  });
}
const lowBtn = document.getElementById("low")!;
lowBtn.addEventListener("click", () => {
  low = !low;
  lowBtn.setAttribute("aria-pressed", String(low));
  if (!playing) requestAnimationFrame(frame);
});
void main();
