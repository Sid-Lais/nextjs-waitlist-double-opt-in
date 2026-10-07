import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default config;
