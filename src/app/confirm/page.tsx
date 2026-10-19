import Link from "next/link";
import { brandName } from "@/lib/brand";
import { getCtx } from "@/lib/context";
import { confirm, confirmedCount, positionAfterReferrals, referralUrl } from "@/lib/waitlist";
import { CopyLink } from "../copy-link";
import { Ticket } from "../ticket";

export const dynamic = "force-dynamic";

export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0 || token.length > 200)
    return <Problem kind="invalid" />;

  const ctx = getCtx();
  const result = await confirm(ctx, token);
  if (result.kind !== "confirmed")
    return <Problem kind={result.kind} token={result.kind === "invalid" ? undefined : token} />;

  const { user } = result;
  const position = user.position!;
  const total = confirmedCount(ctx.db);
  const bump = ctx.config.referralBumpPlaces;
  const name = brandName();
  // Where the next few referrals would take this user, stopping once they reach #1.
  const milestones = [1, 2, 3]
    .map((friends) => ({ friends, to: positionAfterReferrals(position, friends, bump) }))
    .filter((m, i, all) => i === 0 || all[i - 1].to > 1);
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="narrow">
      <span className="badge-ok">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.5 2.8 2.7L16 9.5" />
        </svg>
        Email confirmed
      </span>
      <h1>You&apos;re on the list.</h1>
      <Ticket
        wide
        top={
          <div className="t-split">
            <div>
              <div className="t-label">Your place in line</div>
              <div className="t-num">#{n(position)}</div>
            </div>
            <div className="t-of">
              out of
              <b>
                {n(total)} {total === 1 ? "person" : "people"}
              </b>
            </div>
          </div>
        }
        bottom={
          <>
            <h2>Share your link to move up</h2>
            <p>Every friend who confirms through your link moves you up {bump} places.</p>
            <CopyLink url={referralUrl(ctx, user.referralCode!)} />
            {position > 1 ? (
              <div className="milestones">
                {milestones.map((m) => (
                  <div key={m.friends}>
                    <span>
                      {m.friends} {m.friends === 1 ? "friend" : "friends"}
                    </span>
                    <b>#{n(m.to)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="first">You&apos;re first in line.</p>
            )}
          </>
        }
      />
      <p className="after">
        {name ? `We'll email you the moment ${name} launches.` : "We'll email you on launch day."}
      </p>
    </div>
  );
}

function Problem({ kind, token }: { kind: "expired" | "used" | "invalid"; token?: string }) {
  const text = {
    expired: "This confirmation link has expired.",
    used: "This confirmation link was already used.",
    invalid: "We don't recognise this confirmation link.",
  }[kind];
  return (
    <div className="narrow">
      <h1>{text}</h1>
      <p className="lead">
        Links work once and expire after 48 hours. If you haven&apos;t confirmed yet, we can send a
        fresh one. If you already confirmed, you&apos;re all set.
      </p>
      {token ? (
        <form action="/api/waitlist/resend" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Send me a new link</button>
        </form>
      ) : (
        <p>
          <Link href="/" className="back">
            Back to the signup form
          </Link>
        </p>
      )}
    </div>
  );
}
