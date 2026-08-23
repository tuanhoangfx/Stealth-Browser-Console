/** Shared fetch bounds for Hub resolve-login + GoTrue password grant. */

/** Home Server GoTrue password grants often take 5–8s; 7s aborted mid-flight ("signal is aborted"). */
export const HUB_GOTRUE_FETCH_TIMEOUT_MS = 16_000;
/** Resolve-login bound — Vite compile + Home Server first-hit can exceed 5s. */
export const HUB_RESOLVE_LOGIN_FETCH_TIMEOUT_MS = 12_000;
export const HUB_AUTH_FETCH_RETRY_DELAY_MS = 280;
export const HUB_AUTH_FETCH_TIMEOUT_MESSAGE =
  "Sign-in timed out — Tool Hub is slow. Wait a moment and try again.";

export function isTransientAuthHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504 || status === 530;
}

export function isTransientAuthFetchError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name ?? "");
    if (name === "AbortError" || name === "TimeoutError") return true;
  }
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("aborted")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type FetchHubAuthOptions = {
  timeoutMs: number;
  retries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
};

/** One timeout + one retry on Cloudflare 502/530 / Failed to fetch. */
export async function fetchHubAuth(
  url: string,
  init: RequestInit,
  options: FetchHubAuthOptions,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const retries = Math.max(0, options.retries ?? 1);
  const retryDelayMs = options.retryDelayMs ?? HUB_AUTH_FETCH_RETRY_DELAY_MS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(HUB_AUTH_FETCH_TIMEOUT_MESSAGE),
      Math.max(250, options.timeoutMs),
    );
    try {
      const res = await doFetch(url, { ...init, signal: controller.signal });
      if (attempt < retries && isTransientAuthHttpStatus(res.status)) {
        lastError = new Error(`HTTP ${res.status}`);
        await sleep(retryDelayMs);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries && isTransientAuthFetchError(err)) {
        await sleep(retryDelayMs);
        continue;
      }
      throw normalizeAuthFetchError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw normalizeAuthFetchError(lastError);
}

export function normalizeAuthFetchError(err: unknown): Error {
  if (isTransientAuthFetchError(err)) {
    return new Error(HUB_AUTH_FETCH_TIMEOUT_MESSAGE);
  }
  return err instanceof Error ? err : new Error(String(err ?? "Failed to fetch"));
}
