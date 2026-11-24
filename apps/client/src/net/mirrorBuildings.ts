import { addBuildingAt, relocateBuilding, removeBuilding, setBuildingType, updateLightState, type Building, type BuildingRotation, type BuildingStateView, type ReadonlyMapView, type World } from "@topdown/shared";

/**
 * Story 3.4: the room state's buildings → a client World (the NetSimHost mirror, which draws them and
 * checks the placement preview, and the Predictor's World, whose `movePlayers` must collide with
 * exactly the server's buildings). Adds and removes by id (the map key), copies HP, (Story 5.9) a type change and (Story 5.22) a move; the World's list
 * stays sorted by id, so collision visits them in the server's order. Module-level callbacks and a
 * generation counter: no allocation per call unless a building appears (rare).
 */
let target: World | null = null;
let gen = 0;
/** Generation each building id was last seen in (ids are small integers that count up). */
const seen = new Map<number, number>();

const visit = (s: BuildingStateView, key: string): void => {
  const world = target as World;
  const id = Number(key);
  if (!Number.isInteger(id) || id <= 0) return;
  seen.set(id, gen);
  const list = world.buildings.list;
  let b: Building | undefined;
  for (let i = 0; i < list.length; i++) {
    if ((list[i] as Building).id === id) {
      b = list[i];
      break;
    }
  }
  if (!b) {
    const rot = (s.rot & 3) as BuildingRotation;
    addBuildingAt(world, { id, type: s.type, ownerId: s.owner, gx: s.gx, gy: s.gy, rot, hp: s.hp, trapState: s.trap ?? 0 });
    return;
  }
  // Story 5.14: a bear trap's jaws (server truth; `version` +1 so the renderers redraw open/closed).
  const trap = s.trap ?? 0;
  if (b.trapState !== trap) {
    b.trapState = trap;
    world.buildings.version++;
  }
  // Story 5.9: an upgrade changes the type in place (same id and footprint: collision is unchanged).
  if (b.type !== s.type) setBuildingType(world, b, s.type, s.hp);
  // Story 5.22: a move changes the spot in place (same id; version +1, wallVersion +1 for a wall: the
  // Predictor's collision, the views and the light list follow).
  if (b.gx !== s.gx || b.gy !== s.gy || b.rot !== (s.rot & 3)) relocateBuilding(world, b, s.gx, s.gy, (s.rot & 3) as BuildingRotation);
  if (b.hp !== s.hp) b.hp = s.hp;
};

/** Writes `buildings` into `world`. A missing map (an older server, a fake room) counts as empty. */
export function mirrorBuildings(buildings: ReadonlyMapView<BuildingStateView> | undefined, world: World): void {
  target = world;
  gen++;
  buildings?.forEach(visit);
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const id = (list[i] as Building).id;
    if (seen.get(id) !== gen) {
      removeBuilding(world, id);
      seen.delete(id);
    }
  }
  target = null;
  updateLightState(world); // Story 5.10: the derived light list follows the mirrored buildings (one compare when unchanged)
}
