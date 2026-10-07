import { eq } from "drizzle-orm";
import { verifyWebhookSignature } from "mailtrap";
import type { Db } from "./db";
import { users, webhookEvents } from "./db/schema";
import { normalizeEmail } from "./validation";

type MailtrapEvent = { event?: string; email?: string; event_id?: string };

export type WebhookResult =
  | { status: 200; processed: number; duplicates: number }
  | { status: 400 | 401 | 503; error: string };

const FIELD_BY_EVENT = {
  unsubscribe: "unsubscribedAt",
  bounce: "bouncedAt",
  spam_complaint: "spamAt",
  spam: "spamAt",
} as const;

export function handleWebhook(
  db: Db,
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  now: number,
): WebhookResult {
  if (!secret) return { status: 503, error: "MAILTRAP_WEBHOOK_SECRET is not set" };
  if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    return { status: 401, error: "bad signature" };
  }

  let events: MailtrapEvent[];
  try {
    const body = JSON.parse(rawBody);
    events = Array.isArray(body?.events) ? body.events : [body];
  } catch {
    return { status: 400, error: "invalid JSON" };
  }

  let processed = 0;
  let duplicates = 0;
  db.transaction((tx) => {
    for (const e of events) {
      const type = e.event ?? "";
      const field = FIELD_BY_EVENT[type as keyof typeof FIELD_BY_EVENT];
      if (!field || !e.event_id || !e.email) continue;
      const fresh = tx
        .insert(webhookEvents)
        .values({ eventId: e.event_id, type, receivedAt: now })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.eventId })
        .get();
      if (!fresh) {
        duplicates++;
        continue;
      }
      tx.update(users).set({ [field]: now }).where(eq(users.email, normalizeEmail(e.email))).run();
      processed++;
    }
  });
  return { status: 200, processed, duplicates };
}
