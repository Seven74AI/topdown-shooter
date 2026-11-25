import { fileURLToPath } from "node:url";

/** Dev PGlite directory when neither `DATABASE_URL` nor `PGLITE_DIR` is set: `apps/server/.data/pglite` (gitignored). */
export const DEFAULT_PGLITE_DIR = fileURLToPath(new URL("../../.data/pglite", import.meta.url));
