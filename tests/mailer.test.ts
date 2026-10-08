import { beforeEach, describe, expect, it, vi } from "vitest";

const clients: {
  config: Record<string, unknown>;
  send: ReturnType<typeof vi.fn>;
  batchSend: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock("mailtrap", () => ({
  MailtrapClient: class {
    send = vi.fn(async () => ({ success: true, message_ids: ["t1"] }));
    batchSend = vi.fn();
    constructor(public config: Record<string, unknown>) {
      clients.push(this as never);
    }
  },
}));

const { AmbiguousError, RejectedError, createMailtrapMailer } = await import("@/lib/mailer");

const env = {
  MAILTRAP_API_TOKEN: "tok",
  MAILTRAP_FROM_EMAIL: "hi@example.com",
  MAILTRAP_TEMPLATE_CONFIRM: "tpl-confirm",
  MAILTRAP_TEMPLATE_WELCOME: "tpl-welcome",
  MAILTRAP_TEMPLATE_MOVED_UP: "tpl-moved",
  MAILTRAP_TEMPLATE_LAUNCH: "tpl-launch",
} as unknown as NodeJS.ProcessEnv;

const msg = (to: string) => ({ to, variables: { position: 1 } });

beforeEach(() => {
  clients.length = 0;
});

describe("streams", () => {
  it("sends transactional emails on the default client and launch emails on the bulk client", async () => {
    const mailer = createMailtrapMailer(env);
    const [transactional, bulk] = clients;
    expect(transactional.config.bulk).toBeUndefined();
    expect(bulk.config.bulk).toBe(true);

    await mailer.sendTransactional({ kind: "welcome", to: "a@x.co", variables: { position: 1 } });
    expect(transactional.send).toHaveBeenCalledWith(
      expect.objectContaining({ template_uuid: "tpl-welcome", to: [{ email: "a@x.co" }] }),
    );
    expect(bulk.send).not.toHaveBeenCalled();

    bulk.batchSend.mockResolvedValue({
      success: true,
      responses: [{ success: true, message_ids: ["m1"] }],
    });
    await mailer.sendBulk([msg("a@x.co")]);
    expect(bulk.batchSend).toHaveBeenCalledTimes(1);
    expect(bulk.batchSend.mock.calls[0][0].base.template_uuid).toBe("tpl-launch");
    expect(transactional.batchSend).not.toHaveBeenCalled();
  });
});

describe("sender", () => {
  it("sends the launch email from the bulk address when one is set, everything else from the main one", async () => {
    const mailer = createMailtrapMailer({
      ...env,
      MAILTRAP_BULK_FROM_EMAIL: "hi@news.example.com",
    } as NodeJS.ProcessEnv);
    const [transactional, bulk] = clients;
    bulk.batchSend.mockResolvedValue({
      success: true,
      responses: [{ success: true, message_ids: ["m1"] }],
    });
    await mailer.sendTransactional({ kind: "confirm", to: "a@x.co", variables: {} });
    await mailer.sendBulk([msg("a@x.co")]);
    expect(transactional.send.mock.calls[0][0].from.email).toBe("hi@example.com");
    expect(bulk.batchSend.mock.calls[0][0].base.from.email).toBe("hi@news.example.com");
  });
});

describe("bulk results", () => {
  it("maps each response to its message and surfaces per-message errors", async () => {
    const mailer = createMailtrapMailer(env);
    clients[1].batchSend.mockResolvedValue({
      success: false,
      responses: [
        { success: true, message_ids: ["m1"] },
        { success: false, errors: ["bad address"] },
      ],
    });
    expect(await mailer.sendBulk([msg("a@x.co"), msg("b@x.co")])).toEqual([
      { ok: true, messageId: "m1" },
      { ok: false, error: "bad address" },
    ]);
  });

  it("treats a response count mismatch as unknown outcome", async () => {
    const mailer = createMailtrapMailer(env);
    clients[1].batchSend.mockResolvedValue({
      success: true,
      responses: [{ success: true, message_ids: ["m1"] }],
    });
    await expect(mailer.sendBulk([msg("a@x.co"), msg("b@x.co")])).rejects.toBeInstanceOf(
      AmbiguousError,
    );
  });

  it.each([
    [422, RejectedError],
    [401, RejectedError],
    [500, AmbiguousError],
    [408, AmbiguousError],
    [undefined, AmbiguousError],
  ])("classifies HTTP %s", async (status, cls) => {
    const mailer = createMailtrapMailer(env);
    clients[1].batchSend.mockRejectedValue(
      Object.assign(new Error("x"), { cause: { response: { status } } }),
    );
    await expect(mailer.sendBulk([msg("a@x.co")])).rejects.toBeInstanceOf(cls);
  });

  it("refuses more than 500 messages in one request", async () => {
    const mailer = createMailtrapMailer(env);
    await expect(
      mailer.sendBulk(Array.from({ length: 501 }, (_, i) => msg(`u${i}@x.co`))),
    ).rejects.toThrow(/exceeds 500/);
    expect(clients[1].batchSend).not.toHaveBeenCalled();
  });
});
