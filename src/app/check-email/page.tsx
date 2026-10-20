import Link from "next/link";

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (error === "rate")
    return (
      <div className="narrow">
        <h1>Slow down</h1>
        <p className="lead err">Too many requests. Try again in a few minutes.</p>
        <Link href="/" className="back">
          Back to the signup form
        </Link>
      </div>
    );
  if (error === "send")
    return (
      <div className="narrow">
        <h1>That didn&apos;t work</h1>
        <p className="lead err">We couldn&apos;t send the email, go back and try again.</p>
        <Link href="/" className="back">
          Back to the signup form
        </Link>
      </div>
    );
  return (
    <div className="narrow">
      <h1>Check your inbox</h1>
      <p className="lead">
        If that link was still waiting on a confirmation, a new one is on its way. It can take a
        minute.
      </p>
    </div>
  );
}
