import { MailtrapClient } from "mailtrap";
import { requireEnv } from "./config";

export type TransactionalKind = "confirm" | "welcome" | "moved_up";
export type Variables = Record<string, string | number>;

export type TransactionalMessage = { kind: TransactionalKind; to: string; variables: Variables };
export type BulkMessage = { to: string; variables: Variables };
export type BulkResult = { ok: true; messageId: string } | { ok: false; error: string };

/** The request was refused before anything was sent (4xx). Safe to retry. */
export class RejectedError extends Error {}
/** The request may or may not have been processed (network error, timeout, 5xx). */
export class AmbiguousError extends Error {}

export interface Mailer {
  /** Transactional stream. Throws if the email was not accepted. */
  sendTransactional(msg: TransactionalMessage): Promise<void>;
  /** Bulk stream. Returns one result per message, in order. Throws RejectedError or AmbiguousError. */
  sendBulk(msgs: BulkMessage[]): Promise<BulkResult[]>;
}

export const MAX_BATCH = 500;
const SANDBOX_GAP_MS = 15_000;
// On globalThis: the app builds a mailer per request and each route gets its own module copy.
const pacing = globalThis as unknown as { __mailtrapNextSlot?: number };

function classify(err: unknown): Error {
  const cause = (err as { cause?: { response?: { status?: number } } })?.cause;
  const status = cause?.response?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status && status >= 400 && status < 500 && status !== 408) return new RejectedError(message);
  return new AmbiguousError(message);
}

export function createMailtrapMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const token = requireEnv("MAILTRAP_API_TOKEN", env);
  const from = { email: requireEnv("MAILTRAP_FROM_EMAIL", env), name: env.MAILTRAP_FROM_NAME };
  const templates: Record<string, string> = {
    confirm: requireEnv("MAILTRAP_TEMPLATE_CONFIRM", env),
    welcome: requireEnv("MAILTRAP_TEMPLATE_WELCOME", env),
    moved_up: requireEnv("MAILTRAP_TEMPLATE_MOVED_UP", env),
    launch: requireEnv("MAILTRAP_TEMPLATE_LAUNCH", env),
  };
  // Optional: route everything to an Email Testing inbox instead of real recipients.
  // The sandbox API has no bulk host, so both clients use the sandbox endpoint there.
  const inboxId = Number(env.MAILTRAP_TEST_INBOX_ID) || undefined;
  const sandbox = inboxId
    ? { sandbox: true, testInboxId: inboxId, accountId: Number(env.MAILTRAP_ACCOUNT_ID) || undefined }
    : null;
  const transactional = new MailtrapClient({ token, ...sandbox });
  const bulk = new MailtrapClient({ token, ...(sandbox ?? { bulk: true }) });

  // The free Email Testing plan rejects bursts of more than about 1 email per 10 s, so space sends out there.
  async function pace() {
    if (!sandbox) return;
    const at = Math.max(Date.now(), pacing.__mailtrapNextSlot ?? 0);
    pacing.__mailtrapNextSlot = at + SANDBOX_GAP_MS;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, Math.max(0, at - Date.now()));
    await promise;
  }

  return {
    async sendTransactional({ kind, to, variables }) {
      await pace();
      await transactional.send({
        from,
        to: [{ email: to }],
        template_uuid: templates[kind],
        template_variables: variables,
      });
    },

    async sendBulk(msgs) {
      if (msgs.length === 0) return [];
      if (msgs.length > MAX_BATCH) throw new Error(`Batch of ${msgs.length} exceeds ${MAX_BATCH}`);
      let res;
      await pace();
      try {
        res = await bulk.batchSend({
          base: { from, template_uuid: templates.launch },
          requests: msgs.map((m) => ({ to: [{ email: m.to }], template_variables: m.variables })),
        });
      } catch (err) {
        throw classify(err);
      }
      if (!Array.isArray(res.responses) || res.responses.length !== msgs.length) {
        throw new AmbiguousError(
          `Expected ${msgs.length} responses, got ${res.responses?.length ?? "none"}`,
        );
      }
      return res.responses.map((r) =>
        r.success && r.message_ids?.[0]
          ? { ok: true as const, messageId: r.message_ids[0] }
          : { ok: false as const, error: r.errors?.join("; ") || "unknown error" },
      );
    },
  };
}
