import { routePointer, type ButtonRect, type PointerRoute } from "./routePointer";

/**
 * Registry of HUD buttons and which pointer is holding which button. The HUD asks it first on every
 * pointer-down; only touches it does not claim reach the sticks.
 */
export class HudButtons {
  private readonly rects: ButtonRect[] = [];
  private readonly handlers = new Map<string, () => void>();
  private readonly held = new Map<number, string>();

  /** Adds or updates a button; `onPress` runs once per press (on pointer-down). */
  set(rect: ButtonRect, onPress: () => void): void {
    const i = this.rects.findIndex((r) => r.id === rect.id);
    if (i >= 0) this.rects[i] = rect;
    else this.rects.push(rect);
    this.handlers.set(rect.id, onPress);
  }

  setVisible(id: string, visible: boolean): void {
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i] as ButtonRect;
      if (r.id === id) r.visible = visible;
    }
  }

  get(id: string): ButtonRect | undefined {
    return this.rects.find((b) => b.id === id);
  }

  /** Routes a new pointer. If it lands on a button, presses it and holds the pointer. */
  pointerDown(pointerId: number, x: number, y: number, screenWidth: number): PointerRoute {
    const route = routePointer(x, y, this.rects, screenWidth);
    if (route.kind === "button") {
      this.held.set(pointerId, route.id);
      this.handlers.get(route.id)?.();
    }
    return route;
  }

  /** True if this pointer is holding a button (its moves and lift must not reach the sticks). */
  owns(pointerId: number): boolean {
    return this.held.has(pointerId);
  }

  pointerUp(pointerId: number): void {
    this.held.delete(pointerId);
  }

  reset(): void {
    this.held.clear();
  }
}
