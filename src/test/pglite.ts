import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "../db/client";
import * as schema from "../db/schema";

/** Fresh in-memory Postgres with the real migrations applied. */
export async function testDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: new URL("../db/migrations", import.meta.url).pathname });
  // Services are typed against the postgres-js driver; the query API is the same.
  return db as unknown as DB;
}
