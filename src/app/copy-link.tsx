"use client";

import { useRef, useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. insecure context). Select the text so it can be copied by hand.
      input.current?.select();
    }
  }

  return (
    <div className="copy">
      <input
        ref={input}
        readOnly
        value={url}
        aria-label="Your referral link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
