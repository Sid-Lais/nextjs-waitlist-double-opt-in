import "./load-env";
import { getConfig } from "../src/lib/config";
import { getDb } from "../src/lib/db";
import { runLaunch } from "../src/lib/launch";
import { createMailtrapMailer } from "../src/lib/mailer";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const retryUnknown = args.has("--retry-unknown");
const unknown = [...args].filter((a) => !["--dry-run", "--retry-unknown"].includes(a));
if (unknown.length) {
  console.error(
    `Unknown option: ${unknown.join(" ")}\nUsage: npm run launch -- [--dry-run] [--retry-unknown]`,
  );
  process.exit(2);
}

const ctx = {
  db: getDb(),
  // a dry run never touches the API, so it works without Mailtrap credentials
  mailer: dryRun
    ? {
        sendTransactional: async () => {
          throw new Error("dry run");
        },
        sendBulk: async () => {
          throw new Error("dry run");
        },
      }
    : createMailtrapMailer(),
  config: getConfig(),
  now: Date.now,
  log: (msg: string, err?: unknown) => console.error(msg, err),
};

const r = await runLaunch(ctx, { dryRun, retryUnknown });
const s = r.skipped;

console.log(dryRun ? "Dry run, nothing will be sent." : "Launch run finished.");
console.log(`Confirmed users:        ${r.confirmed}`);
console.log(`Skipped, unsubscribed:  ${s.unsubscribed}`);
console.log(`Skipped, bounced:       ${s.bounced}`);
console.log(`Skipped, spam report:   ${s.spam}`);
console.log(`Skipped, already sent:  ${s.alreadySent}`);
console.log(
  `Skipped, unknown state: ${s.unknownOutcome}${s.unknownOutcome ? "  (see --retry-unknown in the README)" : ""}`,
);
console.log(
  `${dryRun ? "Would send to" : "Eligible"}:           ${r.eligible} in ${r.chunks} batch(es) of up to 500`,
);
if (!dryRun) {
  console.log(`Sent:                   ${r.sent}`);
  console.log(`Failed:                 ${r.failed}`);
  if (r.aborted)
    console.error("Stopped early: the API outcome was unknown. Check Mailtrap logs, then rerun.");
  process.exit(r.aborted ? 1 : r.failed ? 1 : 0);
}
