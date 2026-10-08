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
  // the payload says "spam", the Webhooks API filter calls it "spam_complaint"
  spam: "spamAt",
  spam_complaint: "spamAt",
} as const;

/** Accepts the JSON format ({"events": [...]}) and the JSON Lines format (one event per line). */
function parseEvents(raw: string): MailtrapEvent[] | null {
  const docs: unknown[] = [];
  try {
    docs.push(JSON.parse(raw));
  } catch {
    try {
      for (const line of raw.split(/\r?\n/)) if (line.trim()) docs.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  if (docs.length === 0) return null;
  return docs.flatMap((d) =>
    Array.isArray((d as { events?: unknown })?.events)
      ? (d as { events: MailtrapEvent[] }).events
      : [d as MailtrapEvent],
  );
}

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

  const events = parseEvents(rawBody);
  if (!events) return { status: 400, error: "invalid payload" };

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
      tx.update(users)
        .set({ [field]: now })
        .where(eq(users.email, normalizeEmail(e.email)))
        .run();
      processed++;
    }
  });
  return { status: 200, processed, duplicates };
}
