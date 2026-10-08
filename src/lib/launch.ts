import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { baseVariables } from "./config";
import { users } from "./db/schema";
import { AmbiguousError, MAX_BATCH, RejectedError } from "./mailer";
import { type Ctx, type User, referralUrl } from "./waitlist";

export type LaunchOptions = {
  dryRun?: boolean;
  /** Also retry users stuck in "sending" (outcome unknown). May send a duplicate. */
  retryUnknown?: boolean;
  batchSize?: number;
};

export type LaunchReport = {
  confirmed: number;
  skipped: {
    unsubscribed: number;
    bounced: number;
    spam: number;
    alreadySent: number;
    unknownOutcome: number;
  };
  eligible: number;
  chunks: number;
  sent: number;
  failed: number;
  /** true when the run stopped early because the API outcome was unknown */
  aborted: boolean;
};

function classify(all: User[], retryUnknown: boolean) {
  const skipped = { unsubscribed: 0, bounced: 0, spam: 0, alreadySent: 0, unknownOutcome: 0 };
  const eligible: User[] = [];
  for (const u of all) {
    // a suppressed user is skipped for that reason even if they were also marked sent
    if (u.unsubscribedAt) skipped.unsubscribed++;
    else if (u.bouncedAt) skipped.bounced++;
    else if (u.spamAt) skipped.spam++;
    else if (u.launchStatus === "sent") skipped.alreadySent++;
    else if (u.launchStatus === "sending" && !retryUnknown) skipped.unknownOutcome++;
    else eligible.push(u);
  }
  return { skipped, eligible };
}

export async function runLaunch(ctx: Ctx, opts: LaunchOptions = {}): Promise<LaunchReport> {
  const batchSize = Math.min(opts.batchSize ?? MAX_BATCH, MAX_BATCH);
  const confirmed = ctx.db
    .select()
    .from(users)
    .where(eq(users.status, "confirmed"))
    .orderBy(asc(users.position))
    .all();
  const { skipped, eligible } = classify(confirmed, Boolean(opts.retryUnknown));

  const report: LaunchReport = {
    confirmed: confirmed.length,
    skipped,
    eligible: eligible.length,
    chunks: Math.ceil(eligible.length / batchSize),
    sent: 0,
    failed: 0,
    aborted: false,
  };
  if (opts.dryRun) return report;

  const retryStatuses = opts.retryUnknown ? ["failed", "sending"] : ["failed"];

  for (let i = 0; i < eligible.length; i += batchSize) {
    const ids = eligible.slice(i, i + batchSize).map((u) => u.id);
    const now = ctx.now();

    // Claim the chunk first. A webhook or a parallel run may have changed users since the listing.
    const batch = ctx.db.transaction((tx) => {
      const rows = tx
        .select()
        .from(users)
        .where(
          and(
            inArray(users.id, ids),
            eq(users.status, "confirmed"),
            isNull(users.unsubscribedAt),
            isNull(users.bouncedAt),
            isNull(users.spamAt),
            or(
              isNull(users.launchStatus),
              inArray(users.launchStatus, retryStatuses as ("failed" | "sending")[]),
            ),
          ),
        )
        .orderBy(asc(users.position))
        .all();
      if (rows.length) {
        tx.update(users)
          .set({ launchStatus: "sending", launchAttemptedAt: now, launchError: null })
          .where(
            inArray(
              users.id,
              rows.map((r) => r.id),
            ),
          )
          .run();
      }
      return rows;
    });
    if (batch.length === 0) continue;

    let results;
    try {
      results = await ctx.mailer.sendBulk(
        batch.map((u) => ({
          to: u.email,
          variables: {
            ...baseVariables(ctx.config),
            launch_url: ctx.config.launchUrl,
            position: u.position!,
            referral_code: u.referralCode!,
            referral_url: referralUrl(ctx, u.referralCode!),
          },
        })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const batchIds = batch.map((u) => u.id);
      if (err instanceof RejectedError) {
        ctx.db
          .update(users)
          .set({ launchStatus: "failed", launchError: message })
          .where(inArray(users.id, batchIds))
          .run();
        report.failed += batch.length;
        continue;
      }
      // Unknown outcome: leave "sending" so a rerun cannot double send, and stop.
      ctx.db.update(users).set({ launchError: message }).where(inArray(users.id, batchIds)).run();
      report.aborted = true;
      if (!(err instanceof AmbiguousError)) throw err;
      return report;
    }

    ctx.db.transaction((tx) => {
      batch.forEach((u, idx) => {
        const r = results[idx];
        if (r.ok) {
          tx.update(users)
            .set({ launchStatus: "sent", launchMessageId: r.messageId, launchError: null })
            .where(eq(users.id, u.id))
            .run();
          report.sent++;
        } else {
          tx.update(users)
            .set({ launchStatus: "failed", launchError: r.error })
            .where(eq(users.id, u.id))
            .run();
          report.failed++;
        }
      });
    });
  }
  return report;
}
