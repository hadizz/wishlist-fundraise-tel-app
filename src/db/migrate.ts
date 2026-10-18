import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "./client";

// Run as a one-shot job (k8s Job / init container) before api + bot roll out.
await migrate(db, { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await sqlClient.end();
console.log("migrations applied");
