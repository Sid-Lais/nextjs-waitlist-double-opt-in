export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (error === "rate")
    return (
      <>
        <h1>Slow down</h1>
        <p className="err">Too many requests. Try again in a few minutes.</p>
      </>
    );
  if (error === "send")
    return (
      <>
        <h1>That didn&apos;t work</h1>
        <p className="err">We couldn&apos;t send the email, go back and try again.</p>
      </>
    );
  return (
    <>
      <h1>Check your inbox</h1>
      <p>
        If that link was still waiting on a confirmation, a new one is on its way. It can take a
        minute.
      </p>
    </>
  );
}
