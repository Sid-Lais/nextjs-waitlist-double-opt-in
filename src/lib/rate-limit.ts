import { eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { rateLimits } from "./db/schema";

// Fixed window counter stored in the DB, so it also works across serverless instances.
export function hit(db: Db, key: string, limit: number, windowMs: number, now: number): boolean {
  return db.transaction((tx) => {
    const row = tx.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
    if (!row || now - row.windowStart >= windowMs) {
      tx.insert(rateLimits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({ target: rateLimits.key, set: { windowStart: now, count: 1 } })
        .run();
      return true;
    }
    if (row.count >= limit) return false;
    tx.update(rateLimits)
      .set({ count: sql`${rateLimits.count} + 1` })
      .where(eq(rateLimits.key, key))
      .run();
    return true;
  });
}
