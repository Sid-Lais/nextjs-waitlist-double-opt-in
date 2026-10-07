import Link from "next/link";
import { getCtx } from "@/lib/context";
import { confirm, referralUrl } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return <Problem kind="invalid" />;

  const ctx = getCtx();
  const result = await confirm(ctx, token);
  if (result.kind !== "confirmed") return <Problem kind={result.kind} token={result.kind === "invalid" ? undefined : token} />;

  const { user } = result;
  return (
    <>
      <h1>You&apos;re on the list.</h1>
      <p>Your position</p>
      <div className="big">#{user.position}</div>
      <p>Every friend who confirms through your link moves you up {ctx.config.referralBumpPlaces} places.</p>
      <p><code>{referralUrl(ctx, user.referralCode!)}</code></p>
    </>
  );
}

function Problem({ kind, token }: { kind: "expired" | "used" | "invalid"; token?: string }) {
  const text = {
    expired: "This confirmation link has expired.",
    used: "This confirmation link was already used.",
    invalid: "We don't recognise this confirmation link.",
  }[kind];
  return (
    <>
      <h1>{text}</h1>
      <p>
        Links work once and expire after 48 hours. If you haven&apos;t confirmed yet, we can send a fresh one.
        If you already confirmed, you&apos;re all set.
      </p>
      {token ? (
        <form action="/api/waitlist/resend" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Send me a new link</button>
        </form>
      ) : (
        <p><Link href="/">Back to the signup form</Link></p>
      )}
    </>
  );
}
