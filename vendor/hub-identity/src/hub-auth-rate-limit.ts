/** Supabase GoTrue rate-limit / throttle messages (anon password grant). */
export const HUB_AUTH_RATE_LIMIT = /rate limit|too many requests|\b429\b/i;

export function isHubAuthRateLimitError(message: string | null | undefined): boolean {
  return HUB_AUTH_RATE_LIMIT.test(String(message ?? "").trim());
}
