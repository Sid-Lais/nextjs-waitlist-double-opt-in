import { z } from "zod";

export function normalizeEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export const signupSchema = z.object({
  email: z
    .string()
    .max(254)
    .transform(normalizeEmail)
    .pipe(z.string().email("Enter a valid email address")),
  ref: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/)
    .optional()
    .catch(undefined),
  // honeypot, humans never see this field
  website: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
