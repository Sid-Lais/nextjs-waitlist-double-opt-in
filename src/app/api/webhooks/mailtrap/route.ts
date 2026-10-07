import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { handleWebhook } from "@/lib/webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // the signature covers the raw body, so read text and never re-serialize
  const raw = await req.text();
  const result = handleWebhook(
    getDb(),
    raw,
    req.headers.get("mailtrap-signature"),
    getConfig().webhookSecret,
    Date.now(),
  );
  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}
