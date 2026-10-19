/** Product name shown in the UI. Same source as the emails (MAILTRAP_FROM_NAME). Empty when unset. */
export function brandName(env: NodeJS.ProcessEnv = process.env): string {
  return env.MAILTRAP_FROM_NAME?.trim() ?? "";
}
