/** Recognise a Supabase/PostgREST/GoTrue error that means "JWT missing/expired". */

export function isSupabaseAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : Number(e.status);
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  // PostgREST emits PGRST301 (JWT expired) / PGRST302; GoTrue/HTTP surface 401.
  if (code === "PGRST301" || code === "PGRST302") return true;
  if (status === 401) return true;
  return /jwt (expired|is expired)|token.*expired|invalid.*(jwt|token)|not authenticated/.test(message);
}
