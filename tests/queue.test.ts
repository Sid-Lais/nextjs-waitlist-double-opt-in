import { describe, expect, it } from "vitest";
import { confirmedCount, positionAfterReferrals, signup } from "@/lib/waitlist";
import { join, makeCtx } from "./helpers";

describe("queue length", () => {
  it("counts only confirmed users", async () => {
    const { ctx, mailer } = makeCtx();
    expect(confirmedCount(ctx.db)).toBe(0);
    await join(ctx, mailer, "a@x.co");
    await join(ctx, mailer, "b@x.co");
    await signup(ctx, { email: "pending@x.co" });
    expect(confirmedCount(ctx.db)).toBe(2);
  });
});

describe("position after referrals", () => {
  it("moves up by the bump per friend", () => {
    expect(positionAfterReferrals(20, 1, 3)).toBe(17);
    expect(positionAfterReferrals(20, 3, 3)).toBe(11);
  });

  it("never goes above #1", () => {
    expect(positionAfterReferrals(4, 2, 3)).toBe(1);
    expect(positionAfterReferrals(1, 1, 3)).toBe(1);
  });
});
