import { describe, expect, it } from "vitest";
import { confirm, signup } from "@/lib/waitlist";
import { getUser, join, makeCtx, positions, tokenFrom } from "./helpers";

describe("queue positions", () => {
  it("assigns dense positions in confirmation order, not signup order", async () => {
    const { ctx, mailer } = makeCtx();
    await signup(ctx, { email: "first@x.co" });
    await signup(ctx, { email: "second@x.co" });
    await confirm(ctx, tokenFrom(mailer, "second@x.co"));
    await confirm(ctx, tokenFrom(mailer, "first@x.co"));
    expect(positions(ctx)).toEqual({ "second@x.co": 1, "first@x.co": 2 });
  });

  it("moves the referrer up N places and shifts the people in between down by one", async () => {
    const { ctx, mailer } = makeCtx({ bump: 3 });
    for (const e of ["a", "b", "c", "d", "e"]) await join(ctx, mailer, `${e}@x.co`);
    const e = getUser(ctx, "e@x.co");
    await join(ctx, mailer, "new@x.co", e.referralCode!);
    // e was #5, moves to #2. b, c, d shift down. a stays. new joins at the end.
    expect(positions(ctx)).toEqual({
      "a@x.co": 1,
      "e@x.co": 2,
      "b@x.co": 3,
      "c@x.co": 4,
      "d@x.co": 5,
      "new@x.co": 6,
    });
  });

  it("never goes above #1 and sends no email when nothing moved", async () => {
    const { ctx, mailer } = makeCtx({ bump: 3 });
    const a = await join(ctx, mailer, "a@x.co");
    await join(ctx, mailer, "b@x.co", a.referralCode!);
    expect(positions(ctx)["a@x.co"]).toBe(1);
    expect(mailer.sentTo("moved_up")).toHaveLength(0);
  });

  it("clamps at #1 when fewer than N places are available", async () => {
    const { ctx, mailer } = makeCtx({ bump: 5 });
    await join(ctx, mailer, "a@x.co");
    const b = await join(ctx, mailer, "b@x.co");
    await join(ctx, mailer, "c@x.co", b.referralCode!);
    expect(positions(ctx)).toMatchObject({ "b@x.co": 1, "a@x.co": 2, "c@x.co": 3 });
    expect(mailer.sentTo("moved_up", "b@x.co")[0].variables).toMatchObject({
      previous_position: 2,
      position: 1,
      places: 1,
    });
  });

  it("only credits a referral on confirmation, once", async () => {
    const { ctx, mailer } = makeCtx({ bump: 1 });
    const a = await join(ctx, mailer, "a@x.co");
    await join(ctx, mailer, "b@x.co");
    await signup(ctx, { email: "c@x.co", ref: a.referralCode! });
    expect(positions(ctx)["a@x.co"]).toBe(1);
    const t = tokenFrom(mailer, "c@x.co");
    await confirm(ctx, t);
    await confirm(ctx, t);
    expect(getUser(ctx, "c@x.co").referralCredited).toBe(true);
    expect(positions(ctx)).toEqual({ "a@x.co": 1, "b@x.co": 2, "c@x.co": 3 });
  });

  it("ignores self referral, unknown codes and unconfirmed referrers", async () => {
    const { ctx, mailer } = makeCtx();
    await join(ctx, mailer, "a@x.co");
    await join(ctx, mailer, "b@x.co");
    await join(ctx, mailer, "c@x.co", "ZZZZZZZZ");
    expect(positions(ctx)).toEqual({ "a@x.co": 1, "b@x.co": 2, "c@x.co": 3 });
    expect(mailer.sentTo("moved_up")).toHaveLength(0);
  });

  it("sends the welcome email with position and referral link only after confirming", async () => {
    const { ctx, mailer } = makeCtx();
    const a = await join(ctx, mailer, "a@x.co");
    expect(mailer.sentTo("welcome", "a@x.co")[0].variables).toEqual({
      product_name: "Acme",
      postal_address: "1 Main St",
      position: 1,
      referral_code: a.referralCode,
      referral_url: `https://example.test/?ref=${a.referralCode}`,
    });
  });
});

describe("moved-up email", () => {
  it("is sent at most once per 24 h, but the position keeps moving", async () => {
    const { ctx, mailer, clock } = makeCtx({ bump: 1 });
    for (const e of ["a", "b", "c", "d"]) await join(ctx, mailer, `${e}@x.co`);
    const d = getUser(ctx, "d@x.co");
    await join(ctx, mailer, "r1@x.co", d.referralCode!);
    await join(ctx, mailer, "r2@x.co", d.referralCode!);
    expect(positions(ctx)["d@x.co"]).toBe(2);
    expect(mailer.sentTo("moved_up", "d@x.co")).toHaveLength(1);

    clock.t += 24 * 3_600_000;
    await join(ctx, mailer, "r3@x.co", d.referralCode!);
    expect(positions(ctx)["d@x.co"]).toBe(1);
    expect(mailer.sentTo("moved_up", "d@x.co")).toHaveLength(2);
  });

  it("is not sent to a suppressed referrer, but the move still happens", async () => {
    const { ctx, mailer } = makeCtx({ bump: 1 });
    await join(ctx, mailer, "a@x.co");
    const b = await join(ctx, mailer, "b@x.co");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    ctx.db.update(users).set({ unsubscribedAt: 1 }).where(eq(users.id, b.id)).run();
    await join(ctx, mailer, "c@x.co", b.referralCode!);
    expect(positions(ctx)["b@x.co"]).toBe(1);
    expect(mailer.sentTo("moved_up")).toHaveLength(0);
  });
});
