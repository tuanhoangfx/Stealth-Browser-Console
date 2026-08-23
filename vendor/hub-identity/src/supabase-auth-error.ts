/** GoTrue / browser network failure — refresh or write may still succeed on retry. */
export function isAuthNetworkError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  return /failed to fetch|network|timeout|econnreset|etimedout|fetch failed|load failed/i.test(message);
}

/** Recognise a Supabase/PostgREST/GoTrue error that means "JWT missing/expired". */

export function isSupabaseAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : Number(e.status);
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  // PostgREST emits PGRST301 (JWT expired) / PGRST302; GoTrue/HTTP surface 401.
  if (code === "PGRST301" || code === "PGRST302" || code === "AUTH_REQUIRED") return true;
  if (status === 401) return true;
  // Anon/missing JWT writes hit table GRANTs (not RLS) → Postgres 42501.
  // Example: "permission denied for table order_desk_products".
  if (code === "42501" && /permission denied for table/.test(message)) return true;
  if (/permission denied for table/.test(message)) return true;
  return /jwt (expired|is expired)|token.*expired|invalid.*(jwt|token)|not authenticated|sign in required|auth required/.test(
    message,
  );
}
