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
  // Bulk can use its own address, ideally on a separate subdomain (see README).
  const bulkFrom = { email: env.MAILTRAP_BULK_FROM_EMAIL || from.email, name: from.name };
  const templates: Record<string, string> = {
    confirm: requireEnv("MAILTRAP_TEMPLATE_CONFIRM", env),
    welcome: requireEnv("MAILTRAP_TEMPLATE_WELCOME", env),
    moved_up: requireEnv("MAILTRAP_TEMPLATE_MOVED_UP", env),
    launch: requireEnv("MAILTRAP_TEMPLATE_LAUNCH", env),
  };
  // Same token for both streams, only the host differs (send.api vs bulk.api).
  const transactional = new MailtrapClient({ token });
  const bulk = new MailtrapClient({ token, bulk: true });

  return {
    async sendTransactional({ kind, to, variables }) {
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
      try {
        res = await bulk.batchSend({
          base: { from: bulkFrom, template_uuid: templates.launch },
          requests: msgs.map((m) => ({ to: [{ email: m.to }], template_variables: m.variables })),
        });
      } catch (err) {
        throw classify(err);
      }
      // One response per request, in order. The HTTP call can succeed while single messages fail.
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
