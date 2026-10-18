import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export const sqlClient = postgres(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
export const db = drizzle(sqlClient, { schema, casing: "snake_case" });

export type DB = typeof db;
/** A transaction handle; services accept either so callers can compose them. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
