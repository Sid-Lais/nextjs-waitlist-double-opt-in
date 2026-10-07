import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  return db;
}

const globalForDb = globalThis as unknown as { __waitlistDb?: Db };

export function getDb(): Db {
  globalForDb.__waitlistDb ??= openDb(process.env.DATABASE_URL ?? "./data/waitlist.db");
  return globalForDb.__waitlistDb;
}

export { schema };
