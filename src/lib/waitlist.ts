import { and, eq, gte, lt, max, sql } from "drizzle-orm";
import type { Db } from "./db";
import { users } from "./db/schema";
import type { Config } from "./config";
import type { Mailer } from "./mailer";
import { RESEND_COOLDOWN_MS, TOKEN_TTL_MS, hashToken, newReferralCode, newToken } from "./tokens";

export type User = typeof users.$inferSelect;

export type Ctx = {
  db: Db;
  mailer: Mailer;
  config: Config;
  now: () => number;
  log?: (msg: string, err?: unknown) => void;
};

export const MOVED_UP_EMAIL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class SendFailedError extends Error {}

export function isSuppressed(u: Pick<User, "unsubscribedAt" | "bouncedAt" | "spamAt">): boolean {
  return Boolean(u.unsubscribedAt || u.bouncedAt || u.spamAt);
}

export function referralUrl(ctx: Ctx, code: string): string {
  return `${ctx.config.appUrl}/?ref=${code}`;
}

/** Stores a fresh token and sends the confirmation, unless one went out in the last 60 s. */
async function issueConfirmation(ctx: Ctx, userId: number): Promise<"sent" | "skipped"> {
  const now = ctx.now();
  const { token, hash } = newToken();

  const claimed = ctx.db.transaction((tx) => {
    const u = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!u || u.status !== "pending") return null;
    if (u.confirmationSentAt && now - u.confirmationSentAt < RESEND_COOLDOWN_MS) return null;
    tx.update(users)
      .set({
        tokenHash: hash,
        tokenExpiresAt: now + TOKEN_TTL_MS,
        tokenUsedAt: null,
        confirmationSentAt: now,
      })
      .where(eq(users.id, userId))
      .run();
    return u;
  });
  if (!claimed) return "skipped";

  try {
    await ctx.mailer.sendTransactional({
      kind: "confirm",
      to: claimed.email,
      variables: { confirm_url: `${ctx.config.appUrl}/confirm?token=${token}` },
    });
  } catch (err) {
    // release the cooldown so the user can retry right away
    ctx.db
      .update(users)
      .set({ confirmationSentAt: claimed.confirmationSentAt })
      .where(eq(users.id, userId))
      .run();
    ctx.log?.("confirmation email failed", err);
    throw new SendFailedError("confirmation email failed");
  }
  return "sent";
}

export async function signup(
  ctx: Ctx,
  input: { email: string; ref?: string },
): Promise<"sent" | "skipped"> {
  const existing = ctx.db.select().from(users).where(eq(users.email, input.email)).get();
  if (existing) {
    // already confirmed: same response as any other signup, no email
    if (existing.status === "confirmed") return "skipped";
    return issueConfirmation(ctx, existing.id);
  }

  const inserted = ctx.db
    .insert(users)
    .values({ email: input.email, createdAt: ctx.now(), referredByCode: input.ref ?? null })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id })
    .get();
  // lost a race with a parallel identical signup; that request sends the email
  if (!inserted) return "skipped";
  return issueConfirmation(ctx, inserted.id);
}

export async function resendByToken(ctx: Ctx, token: string): Promise<"sent" | "skipped"> {
  const u = ctx.db.select().from(users).where(eq(users.tokenHash, hashToken(token))).get();
  if (!u || u.status !== "pending") return "skipped";
  return issueConfirmation(ctx, u.id);
}

export type ConfirmResult =
  | { kind: "confirmed"; user: User }
  | { kind: "expired" | "used" | "invalid" };

/** Moves `userId` up by `places`, shifting the people in between down by one. Returns places actually moved. */
export function moveUp(db: Pick<Db, "update">, userId: number, from: number, places: number): number {
  const to = Math.max(1, from - places);
  if (to === from) return 0;
  db.update(users)
    .set({ position: sql`${users.position} + 1` })
    .where(and(eq(users.status, "confirmed"), gte(users.position, to), lt(users.position, from)))
    .run();
  db.update(users).set({ position: to }).where(eq(users.id, userId)).run();
  return from - to;
}

export async function confirm(ctx: Ctx, token: string): Promise<ConfirmResult> {
  const now = ctx.now();
  const hash = hashToken(token);

  const outcome = ctx.db.transaction((tx) => {
    const u = tx.select().from(users).where(eq(users.tokenHash, hash)).get();
    if (!u) return { kind: "invalid" } as const;
    if (u.status === "confirmed" || u.tokenUsedAt) return { kind: "used" } as const;
    if (!u.tokenExpiresAt || u.tokenExpiresAt <= now) return { kind: "expired" } as const;

    const last = tx.select({ m: max(users.position) }).from(users).where(eq(users.status, "confirmed")).get();
    tx.update(users)
      .set({
        status: "confirmed",
        tokenUsedAt: now,
        confirmedAt: now,
        position: (last?.m ?? 0) + 1,
        referralCode: newReferralCode(),
      })
      .where(eq(users.id, u.id))
      .run();

    let referrerMove: { referrer: User; from: number; moved: number } | null = null;
    if (u.referredByCode && !u.referralCredited) {
      const ref = tx
        .select()
        .from(users)
        .where(and(eq(users.referralCode, u.referredByCode), eq(users.status, "confirmed")))
        .get();
      if (ref && ref.id !== u.id && ref.position) {
        const moved = moveUp(tx, ref.id, ref.position, ctx.config.referralBumpPlaces);
        tx.update(users).set({ referralCredited: true }).where(eq(users.id, u.id)).run();
        referrerMove = { referrer: ref, from: ref.position, moved };
      }
    }
    const user = tx.select().from(users).where(eq(users.id, u.id)).get()!;
    return { kind: "confirmed", user, referrerMove } as const;
  });

  if (outcome.kind !== "confirmed") return { kind: outcome.kind };
  const { user, referrerMove } = outcome;

  try {
    await ctx.mailer.sendTransactional({
      kind: "welcome",
      to: user.email,
      variables: {
        position: user.position!,
        referral_code: user.referralCode!,
        referral_url: referralUrl(ctx, user.referralCode!),
      },
    });
  } catch (err) {
    ctx.log?.("welcome email failed", err);
  }

  if (referrerMove && referrerMove.moved > 0) {
    await notifyMovedUp(ctx, referrerMove.referrer.id, referrerMove.from, referrerMove.moved);
  }
  return { kind: "confirmed", user };
}

/** At most one "you moved up" email per user per 24 h. Never for unconfirmed or suppressed users. */
async function notifyMovedUp(ctx: Ctx, userId: number, previous: number, places: number) {
  const now = ctx.now();
  const claimed = ctx.db.transaction((tx) => {
    const u = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!u || u.status !== "confirmed" || isSuppressed(u)) return null;
    if (u.movedUpEmailAt && now - u.movedUpEmailAt < MOVED_UP_EMAIL_INTERVAL_MS) return null;
    tx.update(users).set({ movedUpEmailAt: now }).where(eq(users.id, userId)).run();
    return u;
  });
  if (!claimed) return;

  try {
    // read the position again: the referrer may have moved more than once today
    const fresh = ctx.db.select().from(users).where(eq(users.id, userId)).get()!;
    await ctx.mailer.sendTransactional({
      kind: "moved_up",
      to: claimed.email,
      variables: {
        position: fresh.position!,
        previous_position: previous,
        places,
        referral_url: referralUrl(ctx, claimed.referralCode!),
      },
    });
  } catch (err) {
    ctx.db.update(users).set({ movedUpEmailAt: claimed.movedUpEmailAt }).where(eq(users.id, userId)).run();
    ctx.log?.("moved-up email failed", err);
  }
}
