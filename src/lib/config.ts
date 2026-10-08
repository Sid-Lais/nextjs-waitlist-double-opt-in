export type Config = {
  appUrl: string;
  launchUrl: string;
  productName: string;
  postalAddress: string;
  referralBumpPlaces: number;
  webhookSecret: string | undefined;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bump = Number(env.REFERRAL_BUMP_PLACES ?? 3);
  const appUrl = (env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    appUrl,
    launchUrl: env.LAUNCH_URL || appUrl,
    productName: env.MAILTRAP_FROM_NAME || "our team",
    postalAddress: env.POSTAL_ADDRESS ?? "",
    referralBumpPlaces: Number.isInteger(bump) && bump > 0 ? bump : 3,
    webhookSecret: env.MAILTRAP_WEBHOOK_SECRET || undefined,
  };
}

/** Template variables every email shares (footer and branding). */
export function baseVariables(config: Config) {
  return { product_name: config.productName, postal_address: config.postalAddress };
}

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}
