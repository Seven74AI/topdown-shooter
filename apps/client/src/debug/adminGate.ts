/**
 * Story 10.11 (AC 3, 5, 7): production builds load the cheat panel only once the server says this phone's account is
 * an admin, then show / hide it as that answer changes (a logout, a login to another account, `admin remove`), without
 * a reload. A guest or a non-admin never requests the chunk.
 */
import type * as Phaser from "phaser";
import type { AccountSnapshot } from "../net/accountStore";

interface PanelHandle {
  setVisible(visible: boolean): void;
}
interface AdminSource {
  get(): AccountSnapshot;
  subscribe(l: (s: AccountSnapshot) => void): () => void;
}
type MountPanel = (game: Phaser.Game, opts: { visible: boolean }) => PanelHandle;

/** Watches `store`; the first `admin: true` calls `load()` once and mounts the panel. Returns the unsubscribe. */
export function installAdminGate(game: Phaser.Game, store: AdminSource, load: () => Promise<{ mountAdminTools: MountPanel }>): () => void {
  let panel: PanelHandle | null = null;
  let loading = false;
  let want = false;
  const apply = (s: AccountSnapshot): void => {
    want = s.admin;
    if (panel) return panel.setVisible(want);
    if (!want || loading) return;
    loading = true;
    load().then(
      (m) => {
        panel = m.mountAdminTools(game, { visible: want });
      },
      () => {
        loading = false; // a failed download (offline): the next admin answer tries again
      },
    );
  };
  apply(store.get());
  return store.subscribe(apply);
}
