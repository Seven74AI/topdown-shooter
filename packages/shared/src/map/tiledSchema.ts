import { z } from "zod";

/**
 * Story 4.1 (brief line 17): the part of the Tiled JSON map format (Tiled 1.10+, `.tmj`) that a
 * district uses, as a zod schema. Unknown keys are ignored (Tiled writes many); the shapes the sim
 * reads are checked. Semantic rules (layer names, lattice, kinds) are `loadTiledMap`'s.
 * Reference: https://doc.mapeditor.org/en/stable/reference/json-map-format/
 */

const finite = z.number().refine(Number.isFinite, "must be a finite number");

export const tiledPropertySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "int", "float", "bool", "color", "file", "object", "class"]).default("string"),
  value: z.union([z.string(), finite, z.boolean(), z.record(z.string(), z.unknown())]),
});
export type TiledProperty = z.infer<typeof tiledPropertySchema>;

const properties = z.array(tiledPropertySchema).optional();

/** Story 4.1 review L6: layer placement fields the loader refuses when not neutral (Tiled omits defaults). */
const placement = {
  visible: z.boolean().default(true),
  offsetx: finite.default(0),
  offsety: finite.default(0),
  parallaxx: finite.default(1),
  parallaxy: finite.default(1),
};

export const tiledObjectSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().default(""),
  /** The object's class ("type" in the JSON format). */
  type: z.string().default(""),
  x: finite,
  y: finite,
  width: finite.default(0),
  height: finite.default(0),
  rotation: finite.default(0),
  visible: z.boolean().default(true),
  point: z.boolean().optional(),
  ellipse: z.boolean().optional(),
  polygon: z.array(z.object({ x: finite, y: finite })).optional(),
  polyline: z.array(z.object({ x: finite, y: finite })).optional(),
  gid: z.number().optional(),
  text: z.unknown().optional(),
  properties,
});
export type TiledObject = z.infer<typeof tiledObjectSchema>;

export const tiledObjectGroupSchema = z.object({
  type: z.literal("objectgroup"),
  id: z.number().int().nonnegative(),
  name: z.string(),
  objects: z.array(tiledObjectSchema),
  ...placement,
  properties,
});
export type TiledObjectGroup = z.infer<typeof tiledObjectGroupSchema>;

/** Tile and image layers are allowed (a designer may add art) but carry no gameplay. */
const tiledOtherLayerSchema = z.object({
  type: z.enum(["tilelayer", "imagelayer"]),
  id: z.number().int().nonnegative(),
  name: z.string(),
  ...placement,
});

export interface TiledGroup {
  type: "group";
  id: number;
  name: string;
  layers: TiledLayer[];
  visible: boolean;
  offsetx: number;
  offsety: number;
  parallaxx: number;
  parallaxy: number;
}
export type TiledLayer = TiledObjectGroup | TiledGroup | z.infer<typeof tiledOtherLayerSchema>;

export const tiledLayerSchema: z.ZodType<TiledLayer> = z.lazy(() =>
  z.union([
    tiledObjectGroupSchema,
    z.object({
      type: z.literal("group"),
      id: z.number().int().nonnegative(),
      name: z.string(),
      layers: z.array(tiledLayerSchema),
      ...placement,
    }),
    tiledOtherLayerSchema,
  ]),
) as z.ZodType<TiledLayer>;

export const tiledMapSchema = z.object({
  type: z.literal("map"),
  orientation: z.string(),
  infinite: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(tiledLayerSchema),
  properties,
});
export type TiledMap = z.infer<typeof tiledMapSchema>;
