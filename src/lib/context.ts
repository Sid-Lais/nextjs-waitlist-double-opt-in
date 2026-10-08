import { getConfig } from "./config";
import { getDb } from "./db";
import { createMailtrapMailer } from "./mailer";
import type { Ctx } from "./waitlist";

export function getCtx(): Ctx {
  return {
    db: getDb(),
    mailer: createMailtrapMailer(),
    config: getConfig(),
    now: Date.now,
    log: (msg, err) => console.error(msg, err instanceof Error ? err.message : err),
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}
