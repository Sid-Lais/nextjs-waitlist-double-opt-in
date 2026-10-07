export type Config = {
  appUrl: string;
  referralBumpPlaces: number;
  webhookSecret: string | undefined;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bump = Number(env.REFERRAL_BUMP_PLACES ?? 3);
  return {
    appUrl: (env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    referralBumpPlaces: Number.isInteger(bump) && bump > 0 ? bump : 3,
    webhookSecret: env.MAILTRAP_WEBHOOK_SECRET || undefined,
  };
}

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}
