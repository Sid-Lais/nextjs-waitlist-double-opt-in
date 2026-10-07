"use client";

import { useState } from "react";

export function WaitlistForm({ refCode }: { refCode?: string }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; text?: string }>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), website: data.get("website"), ref: refCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setState({ kind: "done" });
      else setState({ kind: "error", text: body.error ?? "Something went wrong, try again" });
    } catch {
      setState({ kind: "error", text: "Network error, try again" });
    }
  }

  if (state.kind === "done") {
    return <p className="msg">Check your inbox and click the link to confirm your spot. It expires in 48 hours.</p>;
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <input type="email" name="email" placeholder="you@example.com" autoComplete="email" required aria-label="Email address" />
        <div className="hp" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button type="submit" disabled={state.kind === "busy"}>
          {state.kind === "busy" ? "Joining..." : "Join the waitlist"}
        </button>
      </form>
      <p className={`msg ${state.kind === "error" ? "err" : ""}`} role="status">
        {state.kind === "error" ? state.text : ""}
      </p>
    </>
  );
}
