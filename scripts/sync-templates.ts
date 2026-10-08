import "./load-env";
import { readFileSync } from "node:fs";
import { MailtrapClient } from "mailtrap";

const TEMPLATES = [
  {
    file: "confirm",
    env: "MAILTRAP_TEMPLATE_CONFIRM",
    name: "Waitlist: confirm email",
    subject: "Confirm your spot on the waitlist",
    category: "waitlist-confirm",
  },
  {
    file: "welcome",
    env: "MAILTRAP_TEMPLATE_WELCOME",
    name: "Waitlist: welcome",
    subject: "You're on the list: #{{position}}",
    category: "waitlist-welcome",
  },
  {
    file: "moved_up",
    env: "MAILTRAP_TEMPLATE_MOVED_UP",
    name: "Waitlist: moved up",
    subject: "You moved up to #{{position}}",
    category: "waitlist-moved-up",
  },
  {
    file: "launch",
    env: "MAILTRAP_TEMPLATE_LAUNCH",
    name: "Waitlist: launch announcement",
    subject: "{{product_name}} is live",
    category: "waitlist-launch",
  },
];

const token = process.env.MAILTRAP_API_TOKEN;
if (!token) throw new Error("Set MAILTRAP_API_TOKEN first");

let accountId = Number(process.env.MAILTRAP_ACCOUNT_ID) || undefined;
if (!accountId) {
  const res = await fetch("https://mailtrap.io/api/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not list accounts: HTTP ${res.status}`);
  const accounts = (await res.json()) as { id: number; name: string }[];
  if (accounts.length !== 1) {
    throw new Error(
      `Found ${accounts.length} accounts, set MAILTRAP_ACCOUNT_ID (${accounts.map((a) => a.id).join(", ")})`,
    );
  }
  accountId = accounts[0].id;
}

const client = new MailtrapClient({ token, accountId });
const existing = await client.templates.getList();

console.log("# Add these to your .env\n");
for (const t of TEMPLATES) {
  const params = {
    name: t.name,
    subject: t.subject,
    category: t.category,
    body_html: readFileSync(`emails/${t.file}.html`, "utf8"),
    body_text: readFileSync(`emails/${t.file}.txt`, "utf8"),
  };
  const found = existing.find((e) => e.name === t.name);
  const tpl = found
    ? await client.templates.update(found.id, params)
    : await client.templates.create(params);
  console.log(`${t.env}=${tpl.uuid}`);
}
