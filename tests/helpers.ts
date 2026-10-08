import { eq } from "drizzle-orm";
import { openDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { BulkMessage, BulkResult, Mailer, TransactionalMessage } from "@/lib/mailer";
import { type Ctx, confirm, signup } from "@/lib/waitlist";

export class FakeMailer implements Mailer {
  transactional: TransactionalMessage[] = [];
  bulkCalls: BulkMessage[][] = [];
  failTransactional = false;
  /** Called for every bulk request; return per-message results or throw. */
  bulkImpl: (msgs: BulkMessage[]) => BulkResult[] | Promise<BulkResult[]> = (msgs) =>
    msgs.map((_, i) => ({ ok: true, messageId: `id-${this.bulkCalls.length}-${i}` }));

  async sendTransactional(msg: TransactionalMessage) {
    if (this.failTransactional) throw new Error("boom");
    this.transactional.push(msg);
  }
  async sendBulk(msgs: BulkMessage[]) {
    this.bulkCalls.push(msgs);
    return this.bulkImpl(msgs);
  }
  sentTo(kind: string, email?: string) {
    return this.transactional.filter((m) => m.kind === kind && (!email || m.to === email));
  }
}

export function makeCtx(overrides: { bump?: number } = {}) {
  const mailer = new FakeMailer();
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  const ctx: Ctx = {
    db: openDb(":memory:"),
    mailer,
    config: {
      appUrl: "https://example.test",
      launchUrl: "https://example.test/launch",
      productName: "Acme",
      postalAddress: "1 Main St",
      referralBumpPlaces: overrides.bump ?? 3,
      webhookSecret: "s3cret",
    },
    now: () => clock.t,
  };
  return { ctx, mailer, clock };
}

export function tokenFrom(mailer: FakeMailer, email: string): string {
  const msgs = mailer.sentTo("confirm", email);
  const url = String(msgs[msgs.length - 1].variables.confirm_url);
  return new URL(url).searchParams.get("token")!;
}

export function getUser(ctx: Ctx, email: string) {
  return ctx.db.select().from(users).where(eq(users.email, email)).get()!;
}

/** Signs up and confirms. Returns the confirmed user. */
export async function join(ctx: Ctx, mailer: FakeMailer, email: string, ref?: string) {
  await signup(ctx, { email, ref });
  const result = await confirm(ctx, tokenFrom(mailer, email));
  if (result.kind !== "confirmed") throw new Error(`confirm failed: ${result.kind}`);
  return getUser(ctx, email);
}

export function positions(ctx: Ctx): Record<string, number> {
  const rows = ctx.db.select().from(users).where(eq(users.status, "confirmed")).all();
  return Object.fromEntries(rows.map((r) => [r.email, r.position!]));
}
