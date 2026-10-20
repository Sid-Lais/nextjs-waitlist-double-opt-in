import { brandName } from "@/lib/brand";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { confirmedCount } from "@/lib/waitlist";
import { QueueMachine } from "./queue-machine";
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
          Join the waitlist and confirm your email to take your number. Share your link and jump{" "}
          {bump} places for every friend who confirms.
        </p>
        <WaitlistForm refCode={typeof ref === "string" ? ref : undefined} />
        <p className="fine">We only email you about the launch. Unsubscribe any time.</p>
      </section>
      <QueueMachine
        name={name}
        inLine={inLine}
        yourNumber={inLine + 1}
        yourLabel="Your number"
        ticketNote="Serving starts at launch"
        ticketFoot={
          <>
            Confirm in <strong>48h</strong>
          </>
        }
        bump={bump}
      />
    </div>
  );
}
