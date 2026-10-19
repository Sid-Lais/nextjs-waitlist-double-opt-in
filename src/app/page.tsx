import { brandName } from "@/lib/brand";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { confirmedCount } from "@/lib/waitlist";
import { Ticket } from "./ticket";
import { WaitlistForm } from "./waitlist-form";

// The queue length changes with every confirmation.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const name = brandName();
  const inLine = confirmedCount(getDb());
  const bump = getConfig().referralBumpPlaces;

  return (
    <div className="hero">
      <section>
        <h1>{name ? `Get early access to ${name}.` : "Get early access."}</h1>
        <p className="lead">
          Join the waitlist and confirm your email to claim your place. Share your link, and every
          friend who joins moves you up the line.
        </p>
        <WaitlistForm refCode={typeof ref === "string" ? ref : undefined} />
        {inLine > 0 && (
          <p className="in-line">
            <span className="pulse" aria-hidden="true" />
            {inLine.toLocaleString("en-US")} {inLine === 1 ? "person is" : "people are"} already in
            line
          </p>
        )}
        <p className="fine">We only email you about the launch. Unsubscribe any time.</p>
      </section>

      <Ticket
        tilted
        top={
          <>
            <div className="t-label">
              <span>{name ? `${name} early access` : "Early access"}</span>
              <span>Admit one</span>
            </div>
            <div className="t-num">#{(inLine + 1).toLocaleString("en-US")}</div>
            <div className="t-cap">Your place once you confirm</div>
          </>
        }
        bottom={
          <>
            Move up {bump} places for every friend who confirms.
            <div className="segments" aria-hidden="true">
              <span className="on" />
              <span className="on" />
              <span />
              <span />
              <span />
            </div>
          </>
        }
      />
    </div>
  );
}
