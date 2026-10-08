import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@/lib/db/schema";
import { runLaunch } from "@/lib/launch";
import { AmbiguousError, RejectedError } from "@/lib/mailer";
import { signup } from "@/lib/waitlist";
import { getUser, join, makeCtx } from "./helpers";

async function seed(
  n: number,
  ctx: ReturnType<typeof makeCtx>["ctx"],
  mailer: ReturnType<typeof makeCtx>["mailer"],
) {
  for (let i = 1; i <= n; i++) await join(ctx, mailer, `u${i}@x.co`);
}
const bulkRecipients = (m: ReturnType<typeof makeCtx>["mailer"]) =>
  m.bulkCalls.flat().map((x) => x.to);

describe("launch", () => {
  it("sends only to confirmed users, never to pending ones", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(2, ctx, mailer);
    await signup(ctx, { email: "pending@x.co" });
    const r = await runLaunch(ctx);
    expect(bulkRecipients(mailer).sort()).toEqual(["u1@x.co", "u2@x.co"]);
    expect(r).toMatchObject({ confirmed: 2, eligible: 2, sent: 2, failed: 0 });
  });

  it("dry run reports counts and sends nothing", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(3, ctx, mailer);
    ctx.db.update(users).set({ unsubscribedAt: 1 }).where(eq(users.email, "u1@x.co")).run();
    ctx.db.update(users).set({ bouncedAt: 1 }).where(eq(users.email, "u2@x.co")).run();
    const r = await runLaunch(ctx, { dryRun: true });
    expect(r).toMatchObject({
      confirmed: 3,
      eligible: 1,
      chunks: 1,
      skipped: { unsubscribed: 1, bounced: 1 },
    });
    expect(mailer.bulkCalls).toHaveLength(0);
    expect(getUser(ctx, "u3@x.co").launchStatus).toBeNull();
  });

  it("skips unsubscribed, bounced and spam users", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(4, ctx, mailer);
    ctx.db.update(users).set({ unsubscribedAt: 1 }).where(eq(users.email, "u1@x.co")).run();
    ctx.db.update(users).set({ bouncedAt: 1 }).where(eq(users.email, "u2@x.co")).run();
    ctx.db.update(users).set({ spamAt: 1 }).where(eq(users.email, "u3@x.co")).run();
    const r = await runLaunch(ctx);
    expect(bulkRecipients(mailer)).toEqual(["u4@x.co"]);
    expect(r.skipped).toMatchObject({ unsubscribed: 1, bounced: 1, spam: 1 });
  });

  it("splits into chunks of at most 500", async () => {
    const { ctx, mailer } = makeCtx();
    const now = ctx.now();
    ctx.db
      .insert(users)
      .values(
        Array.from({ length: 1203 }, (_, i) => ({
          email: `bulk${i}@x.co`,
          createdAt: now,
          status: "confirmed" as const,
          position: i + 1,
          referralCode: `C${String(i).padStart(7, "0")}`,
        })),
      )
      .run();
    expect((await runLaunch(ctx, { dryRun: true })).chunks).toBe(3);
    const r = await runLaunch(ctx);
    expect(mailer.bulkCalls.map((c) => c.length)).toEqual([500, 500, 203]);
    expect(r.sent).toBe(1203);
  });

  it("stores the message id and a second run emails nobody twice", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(3, ctx, mailer);
    await runLaunch(ctx);
    expect(getUser(ctx, "u1@x.co")).toMatchObject({
      launchStatus: "sent",
      launchMessageId: expect.any(String),
    });
    const again = await runLaunch(ctx);
    expect(mailer.bulkCalls).toHaveLength(1);
    expect(again).toMatchObject({ eligible: 0, sent: 0, skipped: { alreadySent: 3 } });
  });

  it("checks every response: failed ones are retried on rerun, successful ones are not", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(4, ctx, mailer);
    mailer.bulkImpl = (msgs) =>
      msgs.map((m, i) =>
        m.to === "u2@x.co" || m.to === "u4@x.co"
          ? { ok: false, error: "invalid recipient" }
          : { ok: true, messageId: `m${i}` },
      );
    const first = await runLaunch(ctx);
    expect(first).toMatchObject({ sent: 2, failed: 2 });
    expect(getUser(ctx, "u2@x.co")).toMatchObject({
      launchStatus: "failed",
      launchError: "invalid recipient",
    });

    mailer.bulkImpl = (msgs) => msgs.map((_, i) => ({ ok: true, messageId: `r${i}` }));
    await runLaunch(ctx);
    expect(bulkRecipients(mailer)).toEqual([
      "u1@x.co",
      "u2@x.co",
      "u3@x.co",
      "u4@x.co",
      "u2@x.co",
      "u4@x.co",
    ]);
  });

  it("after a partial failure across chunks, rerun sends only what is left", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(5, ctx, mailer);
    let call = 0;
    mailer.bulkImpl = (msgs) => {
      if (++call === 2) throw new RejectedError("422 bad request");
      return msgs.map((_, i) => ({ ok: true, messageId: `m${call}-${i}` }));
    };
    const first = await runLaunch(ctx, { batchSize: 2 });
    expect(first).toMatchObject({ sent: 3, failed: 2 });
    await runLaunch(ctx, { batchSize: 2 });
    const all = bulkRecipients(mailer);
    expect(all.filter((e) => e === "u1@x.co")).toHaveLength(1);
    expect(new Set(all)).toEqual(new Set(["u1@x.co", "u2@x.co", "u3@x.co", "u4@x.co", "u5@x.co"]));
    expect(ctx.db.select().from(users).where(eq(users.launchStatus, "sent")).all()).toHaveLength(5);
    // 5 deliveries plus the 2 users of the refused chunk, each sent once more
    expect(all).toHaveLength(7);
  });

  it("an unknown outcome stops the run and is never silently retried", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(3, ctx, mailer);
    let call = 0;
    mailer.bulkImpl = (msgs) => {
      if (++call === 2) throw new AmbiguousError("timeout");
      return msgs.map((_, i) => ({ ok: true, messageId: `m${i}` }));
    };
    const first = await runLaunch(ctx, { batchSize: 2 });
    expect(first.aborted).toBe(true);
    expect(getUser(ctx, "u3@x.co")).toMatchObject({
      launchStatus: "sending",
      launchError: "timeout",
    });

    mailer.bulkImpl = (msgs) => msgs.map((_, i) => ({ ok: true, messageId: `n${i}` }));
    const second = await runLaunch(ctx, { batchSize: 2 });
    expect(second.skipped.unknownOutcome).toBe(1);
    expect(bulkRecipients(mailer)).toEqual(["u1@x.co", "u2@x.co", "u3@x.co"]);

    const third = await runLaunch(ctx, { batchSize: 2, retryUnknown: true });
    expect(third.sent).toBe(1);
  });

  it("re-checks suppression at send time: a user who unsubscribed after listing is not mailed", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(3, ctx, mailer);
    let call = 0;
    mailer.bulkImpl = (msgs) => {
      if (++call === 1)
        ctx.db.update(users).set({ unsubscribedAt: 5 }).where(eq(users.email, "u3@x.co")).run();
      return msgs.map((_, i) => ({ ok: true, messageId: `m${i}` }));
    };
    await runLaunch(ctx, { batchSize: 2 });
    expect(bulkRecipients(mailer)).toEqual(["u1@x.co", "u2@x.co"]);
  });

  it("a user who unsubscribes after being sent the launch email is counted as unsubscribed, not resent", async () => {
    const { ctx, mailer } = makeCtx();
    await seed(1, ctx, mailer);
    await runLaunch(ctx);
    ctx.db.update(users).set({ unsubscribedAt: 9 }).where(eq(users.email, "u1@x.co")).run();
    const r = await runLaunch(ctx);
    expect(r.skipped.unsubscribed).toBe(1);
    expect(mailer.bulkCalls).toHaveLength(1);
  });
});
