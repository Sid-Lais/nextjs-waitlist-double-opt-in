import "./load-env";
import { createHmac, randomUUID } from "node:crypto";

// Usage: npm run webhook:test -- <email> [unsubscribe|bounce|spam] [url]
const [
  email,
  event = "unsubscribe",
  url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/mailtrap`,
] = process.argv.slice(2);
const secret = process.env.MAILTRAP_WEBHOOK_SECRET;
if (!email || !secret) {
  console.error(
    "Usage: npm run webhook:test -- <email> [unsubscribe|bounce|spam] [url]\nNeeds MAILTRAP_WEBHOOK_SECRET.",
  );
  process.exit(2);
}

const body = JSON.stringify({
  events: [{ event, email, event_id: randomUUID(), timestamp: Math.floor(Date.now() / 1000) }],
});
const signature = createHmac("sha256", secret).update(body).digest("hex");
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "mailtrap-signature": signature },
  body,
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
