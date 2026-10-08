import "./load-env";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import Database from "better-sqlite3";

// End-to-end check against a running app and the real Mailtrap API.
// Mail goes to an Email Testing inbox (MAILTRAP_TEST_INBOX_ID), so no real recipient is emailed.
// Usage: npm run e2e   (app must be running with the same .env and MAILTRAP_TEST_INBOX_ID set)

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.MAILTRAP_API_TOKEN!;
const ACCOUNT = process.env.MAILTRAP_ACCOUNT_ID;
const INBOX = process.env.MAILTRAP_TEST_INBOX_ID;
const SECRET = process.env.MAILTRAP_WEBHOOK_SECRET;
const DB = process.env.DATABASE_URL ?? "./data/waitlist.db";
if (!TOKEN || !ACCOUNT || !INBOX || !SECRET) {
  console.error("Set MAILTRAP_API_TOKEN, MAILTRAP_ACCOUNT_ID, MAILTRAP_TEST_INBOX_ID and MAILTRAP_WEBHOOK_SECRET.");
  process.exit(2);
}

const api = `https://mailtrap.io/api/accounts/${ACCOUNT}/inboxes/${INBOX}`;
const auth = { Authorization: `Bearer ${TOKEN}` };
function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

// Mailtrap API calls occasionally reset the connection, retry a few times.
async function mt(url: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { ...init, headers: auth });
    } catch (err) {
      if (i >= 4) throw err;
      await sleep(1000);
    }
  }
}

type Msg = { id: number; to_email: string; subject: string };
async function inbox(): Promise<Msg[]> {
  const res = await mt(`${api}/messages`);
  if (!res.ok) throw new Error(`inbox list ${res.status}`);
  return res.json();
}
async function html(id: number): Promise<string> {
  return (await mt(`${api}/messages/${id}/body.html`)).text();
}
async function waitFor(pred: (m: Msg[]) => boolean, what: string): Promise<Msg[]> {
  for (let i = 0; i < 60; i++) {
    const m = await inbox();
    if (pred(m)) return m;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const to = (m: Msg[], email: string, re: RegExp) => m.filter((x) => x.to_email === email && re.test(x.subject));

// the app closes idle keep-alive sockets, so never reuse one
function appFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), connection: "close" } });
}

let ipCounter = 10;
async function signup(email: string, ref?: string) {
  const res = await appFetch(`${APP}/api/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${ipCounter++}` },
    body: JSON.stringify({ email, ref }),
  });
  return res.status;
}
async function confirmLink(email: string): Promise<string> {
  const m = await waitFor((x) => to(x, email, /Confirm your spot/).length > 0, `confirmation for ${email}`);
  const msgs = to(m, email, /Confirm your spot/);
  const body = await html(msgs[0].id);
  const link = body.match(/href="([^"]*\/confirm\?token=[^"]+)"/)?.[1];
  if (!link) throw new Error("no confirm link in email");
  return link.replace(/&amp;/g, "&");
}
async function page(url: string) {
  const res = await appFetch(url, { redirect: "manual" });
  return { status: res.status, text: await res.text() };
}
function sql<T>(q: string, ...p: unknown[]): T[] {
  const db = new Database(DB);
  try {
    return db.prepare(q).all(...p) as T[];
  } finally {
    db.close();
  }
}
function exec(q: string, ...p: unknown[]) {
  const db = new Database(DB);
  try {
    db.prepare(q).run(...p);
  } finally {
    db.close();
  }
}
function webhook(email: string, event: string, eventId = randomUUID()) {
  const body = JSON.stringify({ events: [{ event, email, event_id: eventId }] });
  const sig = createHmac("sha256", SECRET!).update(body).digest("hex");
  return appFetch(`${APP}/api/webhooks/mailtrap`, { method: "POST", headers: { "mailtrap-signature": sig }, body }).then((r) => r.status);
}
function launch(...args: string[]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/launch.ts", ...args], { encoding: "utf8" });
  return r.stdout + r.stderr;
}

const run = randomUUID().slice(0, 8);
const users = ["a", "b", "c", "d", "e"].map((n) => `${n}-${run}@example.com`);
const [a, b, c, d, e] = users;

// clean slate
await mt(`${api}/clean`, { method: "PATCH" });

// 1. validation and honeypot
check("invalid email rejected with 400", (await signup("nope")) === 400);
const hp = await appFetch(`${APP}/api/waitlist`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.9.0.200" },
  body: JSON.stringify({ email: `bot-${run}@example.com`, website: "spam" }),
});
check("honeypot returns 200", hp.status === 200);

// 2. signup, normalization, duplicate within 60 s
check("signup returns 200", (await signup(a.toUpperCase())) === 200);
check("duplicate signup returns 200", (await signup(a)) === 200);
let m = await waitFor((x) => to(x, a, /Confirm/).length > 0, "confirmation");
await sleep(2000);
m = await inbox();
check("normalized email, one confirmation within 60 s", to(m, a, /Confirm/).length === 1, `${to(m, a, /Confirm/).length}`);
check("honeypot signup sent nothing", m.every((x) => !x.to_email.startsWith("bot-")));
check("pending user has no welcome email", to(m, a, /on the list|in:/i).length === 0);
const rows = sql<{ n: number }>("select count(*) n from users where email = ?", a);
check("one record for duplicate email", rows[0].n === 1);

// 3. confirmation link: template variable rendered, token stored hashed
const link = await confirmLink(a);
const token = new URL(link).searchParams.get("token")!;
check("confirm link rendered from template variable", link.startsWith(`${APP}/confirm?token=`));
check("raw token not stored", sql<{ n: number }>("select count(*) n from users where token_hash = ?", token)[0].n === 0);

// 4. confirm, reuse, welcome
let r = await page(link);
check("confirm shows queue position 1", r.status === 200 && /on the list/.test(r.text) && /#(<!-- -->)?1</.test(r.text), r.text.slice(0, 80));
const refA = sql<{ referral_code: string }>("select referral_code from users where email = ?", a)[0].referral_code;
check("referral code assigned", /^[A-Z0-9]{8}$/.test(refA));
r = await page(link);
check("reused token shows friendly page with resend button", /already used/.test(r.text) && /Send me a new link/.test(r.text));
m = await waitFor((x) => x.some((y) => y.to_email === a && !/Confirm/.test(y.subject)), "welcome");
const welcome = m.find((x) => x.to_email === a && !/Confirm/.test(x.subject))!;
check("welcome email sent with position in subject", !!welcome && /#1/.test(welcome.subject), welcome?.subject);
const wbody = await html(welcome.id);
check("welcome email contains referral link", wbody.includes(`ref=${refA}`));

// 5. expired token
await signup(b);
const linkB = await confirmLink(b);
exec("update users set token_expires_at = ? where email = ?", Date.now() - 1000, b);
r = await page(linkB);
check("expired token shows friendly page with resend button", /expired/.test(r.text) && /Send me a new link/.test(r.text));
check("expired token did not confirm", sql<{ status: string }>("select status from users where email = ?", b)[0].status === "pending");
const before = (await inbox()).length;
exec("update users set confirmation_sent_at = ? where email = ?", Date.now() - 120_000, b);
const resend = await appFetch(`${APP}/api/waitlist/resend`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.0.201" },
  body: `token=${encodeURIComponent(new URL(linkB).searchParams.get("token")!)}`,
  redirect: "manual",
});
check("resend button redirects", resend.status === 303);
await waitFor((x) => x.length > before, "resend email");
const msgsB = to(await inbox(), b, /Confirm/);
check("new confirmation sent after resend", msgsB.length === 2, `${msgsB.length}`);
const newest = msgsB.sort((x, y) => y.id - x.id)[0];
const linkB2 = (await html(newest.id)).match(/href="([^"]*\/confirm\?token=[^"]+)"/)![1].replace(/&amp;/g, "&");
check("new link confirms", /on the list/.test((await page(linkB2)).text));

// 6. referral: c, d join, e joins, then a new user referred by e moves e up
for (const u of [c, d, e]) {
  await signup(u);
  await page(await confirmLink(u));
}
const posBefore = Object.fromEntries(sql<{ email: string; position: number }>("select email, position from users where status = 'confirmed'").map((x) => [x.email, x.position]));
check("positions dense in confirmation order", [a, b, c, d, e].every((u, i) => posBefore[u] === i + 1), JSON.stringify(posBefore));
const refE = sql<{ referral_code: string }>("select referral_code from users where email = ?", e)[0].referral_code;
const f = `f-${run}@example.com`;
check("referred signup accepted", (await signup(f, refE)) === 200);
let posAfter = sql<{ position: number }>("select position from users where email = ?", e)[0].position;
check("referrer does not move before the referred user confirms", posAfter === 5);
await page(await confirmLink(f));
posAfter = sql<{ position: number }>("select position from users where email = ?", e)[0].position;
check("referrer moved up 3 places on confirmation (5 to 2)", posAfter === 2, `${posAfter}`);
check("people in between shifted down", sql<{ position: number }>("select position from users where email = ?", b)[0].position === 3);
m = await waitFor((x) => to(x, e, /moved up/i).length > 0, "moved-up email");
check("moved-up email sent", to(m, e, /moved up/i).length === 1);

// 7. webhook: signature, unsubscribe, dedupe
check("webhook without signature is 401", (await appFetch(`${APP}/api/webhooks/mailtrap`, { method: "POST", body: "{}" })).status === 401);
const evId = randomUUID();
check("unsubscribe webhook accepted", (await webhook(c, "unsubscribe", evId)) === 200);
check("bounce webhook accepted", (await webhook(d, "bounce")) === 200);
const dup = await appFetch(`${APP}/api/webhooks/mailtrap`, {
  method: "POST",
  headers: { "mailtrap-signature": createHmac("sha256", SECRET).update(JSON.stringify({ events: [{ event: "unsubscribe", event_id: evId, email: c }] })).digest("hex") },
  body: JSON.stringify({ events: [{ event: "unsubscribe", event_id: evId, email: c }] }),
});
check("duplicate event_id is deduped", (await dup.json()).duplicates === 1);

// 8. launch
const dry = launch("--dry-run");
console.log(dry.split("\n").map((l) => "      " + l).join("\n"));
check("dry run reports 4 would-send", /Would send to:\s+4 in 1/.test(dry) && /unsubscribed:\s+1/.test(dry) && /bounced:\s+1/.test(dry));
const beforeLaunch = (await inbox()).length;
await sleep(500);
check("dry run sent nothing", (await inbox()).length === beforeLaunch);

// The free sandbox rate-limits individual messages inside a batch, so a run can partly fail.
// That is a real partial failure: rerun until nothing is left and check nobody got two emails.
await sleep(16_000);
let sawPartialFailure = false;
let out = "";
for (let attempt = 1; attempt <= 8; attempt++) {
  out = launch();
  console.log(out.split("\n").map((l) => "      " + l).join("\n"));
  if (/Failed:\s+[1-9]/.test(out)) sawPartialFailure = true;
  if (/Failed:\s+0/.test(out)) break;
  await sleep(16_000);
}
console.log(`      partial failure seen and retried: ${sawPartialFailure}`);
check("final launch run has no failures", /Failed:\s+0/.test(out));
m = await waitFor((x) => x.filter((y) => /We're live/i.test(y.subject)).length >= 4, "launch emails");
const launched = m.filter((y) => /We're live/i.test(y.subject)).map((y) => y.to_email).sort();
check("each eligible user got exactly one launch email, nobody else", JSON.stringify(launched) === JSON.stringify([a, b, e, f].sort()), launched.join(","));
const states = sql<{ launch_status: string | null; launch_message_id: string | null }>("select launch_status, launch_message_id from users where status = 'confirmed' and unsubscribed_at is null and bounced_at is null");
check("sent state and message id stored per user", states.length === 4 && states.every((s) => s.launch_status === "sent" && !!s.launch_message_id));
check("suppressed users were never marked", sql<{ n: number }>("select count(*) n from users where launch_status is not null and (unsubscribed_at is not null or bounced_at is not null)")[0].n === 0);
const lbody = await html(m.find((y) => /We're live/i.test(y.subject))!.id);
console.log(`      unsubscribe link in rendered launch email: ${lbody.match(/href="([^"]*)"[^>]*>Unsubscribe/)?.[1] ?? "none"}`);

const again = launch();
check("rerun sends nobody twice", /Eligible:\s+0/.test(again) && /already sent:\s+4/.test(again));
await sleep(1000);
check("inbox unchanged after rerun", (await inbox()).filter((y) => /We're live/i.test(y.subject)).length === 4);
check("unconfirmed signup never got launch/welcome", (await inbox()).every((x) => !x.to_email.startsWith("bot-")));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
