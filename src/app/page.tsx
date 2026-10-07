import { WaitlistForm } from "./waitlist-form";

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <h1>Be first in line.</h1>
      <p>Join the waitlist, confirm your email, then share your link to move up the queue.</p>
      <WaitlistForm refCode={typeof ref === "string" ? ref : undefined} />
    </>
  );
}
