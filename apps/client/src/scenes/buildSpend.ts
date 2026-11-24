import { buildingStats, healsSomeoneNow, type Balance, type Building, type SimEvent, type World } from "@topdown/shared";

/**
 * Story 5.20 (D7): what I paid for each of my buildings in the current build phase, from the events
 * every host hands the scene (solo and online alike: my `building.placed` at its type's price, my
 * `building.upgraded` at its step price; `build.started` forgets everything). The server's own
 * `paidThisBuild` never leaves the server (AC 4); this only picks the label ("Take back" / "Sell")
 * and the predicted "+$N". The refund that lands is the server's (`building.sold.refund`).
 */
export class BuildSpend {
  private readonly spent = new Map<number, number>();

  reset(): void {
    this.spent.clear();
  }

  handle(e: SimEvent, localId: string, balance: Balance): void {
    switch (e.type) {
      case "build.started":
        this.spent.clear();
        break;
      case "building.placed":
        if (e.ownerId === localId) this.spent.set(e.buildingId, buildingStats(balance, e.buildingType)?.price ?? 0);
        break;
      case "building.upgraded":
        if (e.playerId === localId) this.spent.set(e.buildingId, (this.spent.get(e.buildingId) ?? 0) + e.cost);
        break;
      case "building.sold":
      case "building.destroyed":
        this.spent.delete(e.buildingId);
        break;
      default:
        break;
    }
  }

  /**
   * Review M1, once per frame in a build phase: every one of my med stations bought this phase that
   * would heal someone now (`healsSomeoneNow` on the World this device sees) is marked used.
   */
  watchUsed(world: Readonly<World>, localId: string): void {
    if (world.run.phase !== "build" || this.spent.size === 0) return;
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (b.ownerId === localId && (this.spent.get(b.id) ?? 0) > 0 && healsSomeoneNow(world, b)) this.spent.set(b.id, 0);
    }
  }

  /** What I paid for building `id` in this build phase (0 = nothing). */
  spentOn(id: number): number {
    return this.spent.get(id) ?? 0;
  }
}
