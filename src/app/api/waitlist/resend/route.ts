import { NextResponse } from "next/server";
import { clientIp, getCtx } from "@/lib/context";
import { getDb } from "@/lib/db";
import { hit } from "@/lib/rate-limit";
import { SendFailedError, resendByToken } from "@/lib/waitlist";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  if (typeof token !== "string" || token.length === 0 || token.length > 200)
    return to("/check-email");

  if (!hit(getDb(), `signup:${clientIp(req.headers)}`, 5, 10 * 60 * 1000, Date.now())) {
    return to("/check-email?error=rate");
  }
  try {
    await resendByToken(getCtx(), token);
  } catch (err) {
    if (err instanceof SendFailedError) return to("/check-email?error=send");
    throw err;
  }
  return to("/check-email");
}
