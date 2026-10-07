import { createHash, randomBytes } from "node:crypto";

export const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// no 0/O/1/I/L to keep codes readable
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newReferralCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
