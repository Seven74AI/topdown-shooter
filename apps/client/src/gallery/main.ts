import { collectAssets, type Asset } from "./collect";
import "./gallery.css";

/**
 * Asset gallery (dev page, `/gallery.html`): every picture the game draws in code, cut into its
 * frames, for the designer to review. Nothing here is shipped to the game itself.
 */
const app = document.getElementById("app") as HTMLElement;
app.innerHTML = `<header class="bar">
  <h1>Asset gallery</h1>
  <input id="q" type="search" placeholder="Filter by name…" />
  <label>Zoom <input id="zoom" type="range" min="0.5" max="4" step="0.25" value="1.5" /></label>
  <label>Background <select id="bg"><option value="night">Night street</option><option value="checker">Checker</option><option value="light">Light</option></select></label>
  <span id="count"></span>
</header><nav id="toc"></nav><main id="grid"><p>Drawing every asset…</p></main>
<dialog id="big"><img alt="" /><p></p><form method="dialog"><button>Close</button></form></dialog>`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

void collectAssets().then((assets) => {
  Object.assign(window, { __assets: assets }); // for the export script (tools/gallery/export.ts)
  render(assets);
  for (const id of ["q", "zoom", "bg"]) $(id).addEventListener("input", () => render(assets));
});

function render(all: readonly Asset[]): void {
  const q = $<HTMLInputElement>("q").value.trim().toLowerCase();
  const zoom = Number($<HTMLInputElement>("zoom").value);
  document.body.dataset.bg = $<HTMLSelectElement>("bg").value;
  const shown = q ? all.filter((a) => a.id.toLowerCase().includes(q)) : all;
  const groups = new Map<string, Asset[]>();
  for (const a of shown) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  $("count").textContent = `${shown.length} of ${all.length} assets`;
  $("toc").innerHTML = [...groups].map(([g, l]) => `<a href="#g-${g}">${g} <small>${l.length}</small></a>`).join("");
  const grid = $("grid");
  grid.innerHTML = "";
  for (const [g, list] of groups) {
    const sec = document.createElement("section");
    sec.id = `g-${g}`;
    sec.innerHTML = `<h2>${g}</h2>`;
    const row = document.createElement("div");
    row.className = "tiles";
    for (const a of list) {
      const fig = document.createElement("figure");
      fig.innerHTML = `<div class="pic"><img src="${a.url}" width="${a.w * zoom}" height="${a.h * zoom}" alt="" /></div><figcaption>${a.name}<small>${a.w}×${a.h}</small></figcaption>`;
      fig.addEventListener("click", () => {
        const d = $<HTMLDialogElement>("big");
        const img = d.querySelector("img") as HTMLImageElement;
        const s = Math.min(6, Math.max(1, Math.floor(Math.min(innerWidth * 0.8 / a.w, innerHeight * 0.7 / a.h))));
        img.src = a.url;
        img.width = a.w * s;
        img.height = a.h * s;
        (d.querySelector("p") as HTMLElement).textContent = `${a.id} · ${a.w}×${a.h} px · shown ×${s}`;
        d.showModal();
      });
      row.append(fig);
    }
    sec.append(row);
    grid.append(sec);
  }
}
