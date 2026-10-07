import { NextResponse } from "next/server";
import { clientIp, getCtx } from "@/lib/context";
import { getDb } from "@/lib/db";
import { hit } from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validation";
import { SendFailedError, signup } from "@/lib/waitlist";

export const runtime = "nodejs";

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { email, ref, website } = parsed.data;

  // Honeypot: bots get the normal success response and nothing happens.
  if (website) return NextResponse.json({ ok: true });

  if (!hit(getDb(), `signup:${clientIp(req.headers)}`, LIMIT, WINDOW_MS, Date.now())) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

  try {
    await signup(getCtx(), { email, ref });
  } catch (err) {
    if (err instanceof SendFailedError) {
      return NextResponse.json({ error: "We couldn't send the email, try again" }, { status: 502 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
