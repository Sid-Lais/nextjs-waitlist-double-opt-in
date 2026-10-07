import { describe, expect, it } from "vitest";
import { hit } from "@/lib/rate-limit";
import { users } from "@/lib/db/schema";
import { SendFailedError, confirm, resendByToken, signup } from "@/lib/waitlist";
import { getUser, makeCtx, tokenFrom } from "./helpers";

describe("duplicates", () => {
  it("creates one record and sends one confirmation for the same email twice within 60 s", async () => {
    const { ctx, mailer, clock } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    clock.t += 59_000;
    await signup(ctx, { email: "a@x.co" });
    expect(ctx.db.select().from(users).all()).toHaveLength(1);
    expect(mailer.sentTo("confirm")).toHaveLength(1);
  });

  it("re-sends the confirmation after 60 s and the old link stops working", async () => {
    const { ctx, mailer, clock } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    const first = tokenFrom(mailer, "a@x.co");
    clock.t += 60_000;
    await signup(ctx, { email: "a@x.co" });
    expect(ctx.db.select().from(users).all()).toHaveLength(1);
    expect(mailer.sentTo("confirm")).toHaveLength(2);
    expect((await confirm(ctx, first)).kind).toBe("invalid");
    expect((await confirm(ctx, tokenFrom(mailer, "a@x.co"))).kind).toBe("confirmed");
  });

  it("two parallel identical signups send one email", async () => {
    const { ctx, mailer } = makeCtx();
    await Promise.all([signup(ctx, { email: "a@x.co" }), signup(ctx, { email: "a@x.co" })]);
    expect(mailer.sentTo("confirm")).toHaveLength(1);
  });

  it("does not email an already confirmed address again", async () => {
    const { ctx, mailer, clock } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    await confirm(ctx, tokenFrom(mailer, "a@x.co"));
    clock.t += 3_600_000;
    await signup(ctx, { email: "a@x.co" });
    expect(mailer.sentTo("confirm")).toHaveLength(1);
  });
});

describe("tokens", () => {
  it("stores only a hash of the token", async () => {
    const { ctx, mailer } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    const token = tokenFrom(mailer, "a@x.co");
    const u = getUser(ctx, "a@x.co");
    expect(u.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(u)).not.toContain(token);
  });

  it("accepts a token just inside 48 h and rejects it at 48 h", async () => {
    const a = makeCtx();
    await signup(a.ctx, { email: "a@x.co" });
    a.clock.t += 48 * 3_600_000 - 1;
    expect((await confirm(a.ctx, tokenFrom(a.mailer, "a@x.co"))).kind).toBe("confirmed");

    const b = makeCtx();
    await signup(b.ctx, { email: "b@x.co" });
    b.clock.t += 48 * 3_600_000;
    expect((await confirm(b.ctx, tokenFrom(b.mailer, "b@x.co"))).kind).toBe("expired");
    expect(getUser(b.ctx, "b@x.co").status).toBe("pending");
    expect(b.mailer.sentTo("welcome")).toHaveLength(0);
  });

  it("an expired token can request a new link, which then confirms", async () => {
    const { ctx, mailer, clock } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    const old = tokenFrom(mailer, "a@x.co");
    clock.t += 49 * 3_600_000;
    expect((await confirm(ctx, old)).kind).toBe("expired");
    expect(await resendByToken(ctx, old)).toBe("sent");
    expect((await confirm(ctx, tokenFrom(mailer, "a@x.co"))).kind).toBe("confirmed");
  });

  it("a reused token is rejected and does not change position or send another welcome", async () => {
    const { ctx, mailer } = makeCtx();
    await signup(ctx, { email: "a@x.co" });
    const t = tokenFrom(mailer, "a@x.co");
    expect((await confirm(ctx, t)).kind).toBe("confirmed");
    expect((await confirm(ctx, t)).kind).toBe("used");
    expect(mailer.sentTo("welcome")).toHaveLength(1);
    // asking for a new link when already confirmed sends nothing
    expect(await resendByToken(ctx, t)).toBe("skipped");
    expect(mailer.sentTo("confirm")).toHaveLength(1);
  });

  it("an unknown token is invalid", async () => {
    const { ctx } = makeCtx();
    expect((await confirm(ctx, "nope")).kind).toBe("invalid");
  });
});

describe("unconfirmed signups", () => {
  it("only ever get the confirmation email", async () => {
    const { ctx, mailer } = makeCtx();
    await signup(ctx, { email: "a@x.co", ref: "ZZZZZZZZ" });
    expect(mailer.transactional.map((m) => m.kind)).toEqual(["confirm"]);
    const u = getUser(ctx, "a@x.co");
    expect(u.status).toBe("pending");
    expect(u.referralCode).toBeNull();
    expect(u.position).toBeNull();
  });

  it("send failure surfaces, and the user can retry immediately", async () => {
    const { ctx, mailer } = makeCtx();
    mailer.failTransactional = true;
    await expect(signup(ctx, { email: "a@x.co" })).rejects.toBeInstanceOf(SendFailedError);
    mailer.failTransactional = false;
    await signup(ctx, { email: "a@x.co" });
    expect(mailer.sentTo("confirm")).toHaveLength(1);
  });
});

describe("rate limit", () => {
  it("allows `limit` hits per window, then blocks, then resets", () => {
    const { ctx } = makeCtx();
    const results = Array.from({ length: 4 }, () => hit(ctx.db, "ip:1", 3, 1000, 0));
    expect(results).toEqual([true, true, true, false]);
    expect(hit(ctx.db, "ip:2", 3, 1000, 0)).toBe(true);
    expect(hit(ctx.db, "ip:1", 3, 1000, 1000)).toBe(true);
  });
});
