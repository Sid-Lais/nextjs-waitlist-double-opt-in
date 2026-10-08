import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleWebhook } from "@/lib/webhook";
import { getUser, join, makeCtx } from "./helpers";

const SECRET = "s3cret";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");
const body = (...events: object[]) => JSON.stringify({ events });

describe("mailtrap webhook", () => {
  it("rejects missing or wrong signatures and unset secret", () => {
    const { ctx } = makeCtx();
    const b = body({ event: "unsubscribe", event_id: "e1", email: "a@x.co" });
    expect(handleWebhook(ctx.db, b, null, SECRET, 1).status).toBe(401);
    expect(handleWebhook(ctx.db, b, sign(b, "other"), SECRET, 1).status).toBe(401);
    expect(handleWebhook(ctx.db, b, sign(b), undefined, 1).status).toBe(503);
  });

  it("marks unsubscribe, bounce and spam on the matching user, case-insensitively", async () => {
    const { ctx, mailer } = makeCtx();
    for (const e of ["a", "b", "c", "d"]) await join(ctx, mailer, `${e}@x.co`);
    const b = body(
      { event: "unsubscribe", event_id: "e1", email: "A@x.co" },
      { event: "bounce", event_id: "e2", email: "b@x.co" },
      { event: "spam_complaint", event_id: "e3", email: "c@x.co" },
      { event: "delivery", event_id: "e4", email: "d@x.co" },
    );
    const r = handleWebhook(ctx.db, b, sign(b), SECRET, 1234);
    expect(r).toMatchObject({ status: 200, processed: 3 });
    expect(getUser(ctx, "a@x.co").unsubscribedAt).toBe(1234);
    expect(getUser(ctx, "b@x.co").bouncedAt).toBe(1234);
    expect(getUser(ctx, "c@x.co").spamAt).toBe(1234);
    expect(getUser(ctx, "d@x.co")).toMatchObject({
      unsubscribedAt: null,
      bouncedAt: null,
      spamAt: null,
    });
  });

  it("accepts the payload event name spam as well as spam_complaint", async () => {
    const { ctx, mailer } = makeCtx();
    await join(ctx, mailer, "a@x.co");
    const b = body({ event: "spam", event_id: "s1", email: "a@x.co" });
    expect(handleWebhook(ctx.db, b, sign(b), SECRET, 7)).toMatchObject({
      status: 200,
      processed: 1,
    });
    expect(getUser(ctx, "a@x.co").spamAt).toBe(7);
  });

  it("parses the JSON Lines payload format with several events", async () => {
    const { ctx, mailer } = makeCtx();
    for (const e of ["a", "b"]) await join(ctx, mailer, `${e}@x.co`);
    const lines = [
      JSON.stringify({ event: "unsubscribe", event_id: "l1", email: "a@x.co" }),
      JSON.stringify({ event: "bounce", event_id: "l2", email: "b@x.co" }),
      JSON.stringify({ event: "delivery", event_id: "l3", email: "b@x.co" }),
    ].join("\n");
    expect(handleWebhook(ctx.db, lines, sign(lines), SECRET, 9)).toMatchObject({
      status: 200,
      processed: 2,
    });
    expect(getUser(ctx, "a@x.co").unsubscribedAt).toBe(9);
    expect(getUser(ctx, "b@x.co").bouncedAt).toBe(9);
  });

  it("dedupes on event_id", async () => {
    const { ctx, mailer } = makeCtx();
    await join(ctx, mailer, "a@x.co");
    const b = body({ event: "unsubscribe", event_id: "same", email: "a@x.co" });
    expect(handleWebhook(ctx.db, b, sign(b), SECRET, 100)).toMatchObject({
      processed: 1,
      duplicates: 0,
    });
    expect(handleWebhook(ctx.db, b, sign(b), SECRET, 200)).toMatchObject({
      processed: 0,
      duplicates: 1,
    });
    expect(getUser(ctx, "a@x.co").unsubscribedAt).toBe(100);
  });

  it("returns 200 for unknown emails and 400 for invalid JSON", () => {
    const { ctx } = makeCtx();
    const b = body({ event: "bounce", event_id: "e9", email: "ghost@x.co" });
    expect(handleWebhook(ctx.db, b, sign(b), SECRET, 1).status).toBe(200);
    expect(handleWebhook(ctx.db, "{nope", sign("{nope"), SECRET, 1).status).toBe(400);
    expect(handleWebhook(ctx.db, "{}\n{nope", sign("{}\n{nope"), SECRET, 1).status).toBe(400);
  });
});
