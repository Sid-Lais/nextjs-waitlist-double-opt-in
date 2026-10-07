import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ["next-env.d.ts", ".next/**", "node_modules/**", "data/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
