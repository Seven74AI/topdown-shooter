import type { DistrictMap, MapBox } from "./districtMap";

/** Story 4.6 (FR59): the `stage1_evening` prop kind of a lit shop front. */
export const SHOPFRONT_KIND = "shopfront";

/** The side of the shop-front strip that touches its shop (where the light comes from). */
export type ShopfrontFace = "n" | "s" | "e" | "w";

/**
 * Story 4.6: a lit shop front — the sidewalk strip in front of a shop that is open in the evening.
 * Data only (no collision, no shots): it marks a good spot to build, and the renderer (Story 4.9
 * CityView) glows it from `face`. `shop` names the collision box it belongs to.
 */
export interface Shopfront extends MapBox {
  readonly face: ShopfrontFace;
  readonly shop: string;
}

const cache = new WeakMap<DistrictMap, readonly Shopfront[]>();

/**
 * Story 4.6: the map's shop fronts (`kind: shopfront` props of the `stage1_evening` group), each with
 * the face that touches a collision box (the shop). A strip touching no box is skipped (a map error
 * the data test catches). Cached per map; allocates only on the first call.
 */
export function shopfrontsOf(map: DistrictMap): readonly Shopfront[] {
  const hit = cache.get(map);
  if (hit) return hit;
  const out: Shopfront[] = [];
  for (const p of map.stages[0] ?? []) {
    if (p.kind !== SHOPFRONT_KIND) continue;
    for (const s of map.solids) {
      const xOverlap = p.minX < s.maxX && p.maxX > s.minX;
      const yOverlap = p.minY < s.maxY && p.maxY > s.minY;
      let face: ShopfrontFace | null = null;
      if (xOverlap && p.minY === s.maxY) face = "n";
      else if (xOverlap && p.maxY === s.minY) face = "s";
      else if (yOverlap && p.minX === s.maxX) face = "w";
      else if (yOverlap && p.maxX === s.minX) face = "e";
      if (face) {
        out.push(Object.freeze({ name: p.name, minX: p.minX, minY: p.minY, maxX: p.maxX, maxY: p.maxY, face, shop: s.name }));
        break;
      }
    }
  }
  const frozen = Object.freeze(out);
  cache.set(map, frozen);
  return frozen;
}
