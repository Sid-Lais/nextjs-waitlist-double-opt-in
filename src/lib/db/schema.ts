import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    status: text("status", { enum: ["pending", "confirmed"] })
      .notNull()
      .default("pending"),
    // sha256 of the emailed token; the raw token is never stored
    tokenHash: text("token_hash").unique(),
    tokenExpiresAt: integer("token_expires_at"),
    tokenUsedAt: integer("token_used_at"),
    confirmationSentAt: integer("confirmation_sent_at"),
    createdAt: integer("created_at").notNull(),
    confirmedAt: integer("confirmed_at"),
    // dense 1..n among confirmed users
    position: integer("position"),
    referralCode: text("referral_code").unique(),
    referredByCode: text("referred_by_code"),
    referralCredited: integer("referral_credited", { mode: "boolean" }).notNull().default(false),
    movedUpEmailAt: integer("moved_up_email_at"),
    unsubscribedAt: integer("unsubscribed_at"),
    bouncedAt: integer("bounced_at"),
    spamAt: integer("spam_at"),
    // null = never attempted, sending = request in flight or outcome unknown, sent, failed
    launchStatus: text("launch_status", { enum: ["sending", "sent", "failed"] }),
    launchAttemptedAt: integer("launch_attempted_at"),
    launchMessageId: text("launch_message_id"),
    launchError: text("launch_error"),
  },
  (t) => [index("users_status_position").on(t.status, t.position)],
);

export const webhookEvents = sqliteTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: integer("received_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});
