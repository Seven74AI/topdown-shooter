// Story 7.1: Drizzle Kit config. `npm run db:generate` writes a new migration under ./drizzle from src/db/schema.ts
// (no database needed); `npm run db:migrate` applies them (src/db/migrateCli.ts, PostgreSQL or PGlite).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
