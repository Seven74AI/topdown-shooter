/**
 * Story 5.19 (AC 7, D8): the item chip's text while holding, built only when one of its parts
 * changes (no string per frame): carrying "{name} · ${price} · ×{n} left", pinned "↩ carry · {name}".
 */
export class ChipText {
  private name = "";
  private price = -1;
  private left = -1;
  private pinned = false;
  private text = "";

  get(name: string, price: number, left: number, pinned: boolean): string {
    if (name !== this.name || price !== this.price || left !== this.left || pinned !== this.pinned || this.text === "") {
      this.name = name;
      this.price = price;
      this.left = left;
      this.pinned = pinned;
      this.text = pinned ? `↩ carry · ${name}` : `${name} · $${price} · ×${left} left`;
    }
    return this.text;
  }
}

/**
 * Story 5.19 (AC 7): how many more of a type at `price` I can still place: the cap minus owned and
 * pending, and what the shown wallet (wallet − pending prices) covers; never below 0.
 */
export function chipLeft(cap: number, owned: number, pendingCount: number, shownWallet: number, price: number): number {
  const room = Math.max(0, cap - owned - pendingCount);
  if (!(price > 0)) return room;
  return Math.max(0, Math.min(room, Math.floor(shownWallet / price)));
}
