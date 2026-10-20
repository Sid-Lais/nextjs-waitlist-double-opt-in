"use client";

import { useState } from "react";

export function WaitlistForm({ refCode }: { refCode?: string }) {
  const [state, setState] = useState<{
    kind: "idle" | "busy" | "done" | "error";
    text?: string;
    email?: string;
  }>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: data.get("website"), ref: refCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setState({ kind: "done", email });
      else setState({ kind: "error", text: body.error ?? "Something went wrong, try again" });
    } catch {
      setState({ kind: "error", text: "Network error, try again" });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="sent" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
        <div>
          <b>Check your inbox.</b>
          <p>
            Click the link we sent to <strong>{state.email}</strong> to confirm your place. It
            expires in 48 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {refCode && (
        <p className="invite">You were invited by a friend. Confirming moves them up the line.</p>
      )}
      <form className="join-form" onSubmit={onSubmit} noValidate>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          aria-label="Email address"
        />
        <div className="hp" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button type="submit" disabled={state.kind === "busy"}>
          {state.kind === "busy" ? "Taking your number..." : "Take a number"}
        </button>
      </form>
      <p className={`msg ${state.kind === "error" ? "err" : ""}`} role="status">
        {state.kind === "error" ? state.text : ""}
      </p>
    </>
  );
}
