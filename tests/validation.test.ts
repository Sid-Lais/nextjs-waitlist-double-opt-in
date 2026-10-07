import { describe, expect, it } from "vitest";
import { normalizeEmail, signupSchema } from "@/lib/validation";

describe("signup validation", () => {
  it("normalizes email: trim, lowercase, unicode compatibility forms", () => {
    expect(normalizeEmail("  Ann@Example.COM ")).toBe("ann@example.com");
    expect(signupSchema.parse({ email: "  Ann@Example.COM " }).email).toBe("ann@example.com");
    // fullwidth characters fold to ASCII
    expect(normalizeEmail("ａnn@example.com")).toBe("ann@example.com");
  });

  it.each(["", "nope", "a@", "@b.com", "a b@c.com", "a@b", `${"x".repeat(250)}@b.com`])("rejects %j", (email) => {
    expect(signupSchema.safeParse({ email }).success).toBe(false);
  });

  it("rejects a missing or non-string email", () => {
    expect(signupSchema.safeParse({}).success).toBe(false);
    expect(signupSchema.safeParse({ email: 5 }).success).toBe(false);
  });

  it("keeps a well-formed ref code uppercased and drops a malformed one instead of failing", () => {
    expect(signupSchema.parse({ email: "a@b.co", ref: "abcd2345" }).ref).toBe("ABCD2345");
    expect(signupSchema.parse({ email: "a@b.co", ref: "<script>" }).ref).toBeUndefined();
  });

  it("passes the honeypot field through so the route can detect it", () => {
    expect(signupSchema.parse({ email: "a@b.co", website: "http://spam" }).website).toBe("http://spam");
  });
});
