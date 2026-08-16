/** Dev-only silent sign-in on localhost — credentials via VITE_* or NEXT_PUBLIC_* in .env.local */

// Browser-only TypeScript projects consume this module too. Keep the runtime `typeof process`
// guards below, but declare the minimal Next.js replacement surface without requiring @types/node.
declare const process: { env: Record<string, string | undefined> };

export const DEV_AUTO_LOGIN_TIMEOUT_MS = 15_000;

/** Default allowlist when DEV_AUTO_LOGIN_ALLOWED_EMAIL is unset. */
export const DEFAULT_DEV_AUTO_LOGIN_ALLOWED_EMAIL = "czpgo@outlook.com";

type DevAutoLoginCreds = {
  email: string;
  password: string;
};

function readViteEnv(key: string): string {
  const viteMeta =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, unknown> }).env
      : undefined;
  const val = viteMeta?.[key];
  return val != null && String(val).trim() ? String(val).trim() : "";
}

/**
 * Next.js inlines static `process.env.NEXT_PUBLIC_*` at build time.
 * Vite browser has no `process` — guard before touch (Orders embed crash).
 */
function readNextPublicEnv(key: "NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL" | "NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD" | "NEXT_PUBLIC_DEV_AUTO_LOGIN_ALLOWED_EMAIL"): string {
  if (typeof process === "undefined") return "";
  // Keep static member access for Next.js inlining.
  const val =
    key === "NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL"
      ? process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL
      : key === "NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD"
        ? process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD
        : process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_ALLOWED_EMAIL;
  return val != null && String(val).trim() ? String(val).trim() : "";
}

function readNextPublicDevAutoLoginEmail(): string {
  return readNextPublicEnv("NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL");
}

function readNextPublicDevAutoLoginPassword(): string {
  return readNextPublicEnv("NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD");
}

function readNextPublicDevAutoLoginAllowedEmail(): string {
  return readNextPublicEnv("NEXT_PUBLIC_DEV_AUTO_LOGIN_ALLOWED_EMAIL");
}

function readBundledEnv(suffix: string): string {
  const viteVal = readViteEnv(`VITE_${suffix}`);
  if (viteVal) return viteVal;
  if (suffix === "DEV_AUTO_LOGIN_EMAIL") return readNextPublicDevAutoLoginEmail();
  if (suffix === "DEV_AUTO_LOGIN_PASSWORD") return readNextPublicDevAutoLoginPassword();
  if (suffix === "DEV_AUTO_LOGIN_ALLOWED_EMAIL") return readNextPublicDevAutoLoginAllowedEmail();
  return "";
}

function isBundlerDev(): boolean {
  const viteMeta =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: { DEV?: boolean } }).env
      : undefined;
  if (viteMeta?.DEV === true) return true;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
  return false;
}

export function isDevLocalHost(hostname = typeof window !== "undefined" ? window.location.hostname : ""): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

/** `?devAutoLogin=off` — sticky per tab so a smoke can exercise the real sign-in form. */
export const DEV_AUTO_LOGIN_PARAM = "devAutoLogin";
export const DEV_AUTO_LOGIN_SESSION_KEY = "hub:dev-auto-login";

export function isDevAutoLoginOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get(DEV_AUTO_LOGIN_PARAM);
    if (param != null) {
      const off = /^(0|off|false|no)$/i.test(param.trim());
      window.sessionStorage?.setItem(DEV_AUTO_LOGIN_SESSION_KEY, off ? "off" : "on");
      return off;
    }
    return window.sessionStorage?.getItem(DEV_AUTO_LOGIN_SESSION_KEY) === "off";
  } catch {
    return false;
  }
}

/**
 * Sticky per-tab opt-out after an explicit Sign Out.
 * Without this, `onSignedOut` no-ops while `VITE_DEV_AUTO_LOGIN_*` is set, and F5
 * re-runs silent password grant — the UI looks like Sign Out did nothing.
 */
export function optOutDevAutoLogin(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(DEV_AUTO_LOGIN_SESSION_KEY, "off");
  } catch {
    /* ignore — private mode / blocked storage */
  }
}

/** Clear sticky Sign Out opt-out so the next manual Sign In / Hub relay can proceed. */
export function clearDevAutoLoginOptOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(DEV_AUTO_LOGIN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isDevAutoLoginEnabled(hostname?: string): boolean {
  return isBundlerDev() && isDevLocalHost(hostname) && !isDevAutoLoginOptedOut();
}

/** Optional override — synced from DEV_AUTO_LOGIN_ALLOWED_EMAIL in .env.shared. */
export function readDevAutoLoginAllowedEmail(): string {
  const fromEnv = readBundledEnv("DEV_AUTO_LOGIN_ALLOWED_EMAIL");
  return (fromEnv || DEFAULT_DEV_AUTO_LOGIN_ALLOWED_EMAIL).toLowerCase();
}

export function isDevAutoLoginEmailAllowed(email: string): boolean {
  return email.trim().toLowerCase() === readDevAutoLoginAllowedEmail();
}

/** Read DEV_AUTO_LOGIN_EMAIL / DEV_AUTO_LOGIN_PASSWORD (VITE_* or NEXT_PUBLIC_* in .env.local). */
export function readDevAutoLoginCreds(): DevAutoLoginCreds | null {
  const email = readBundledEnv("DEV_AUTO_LOGIN_EMAIL");
  const password = readBundledEnv("DEV_AUTO_LOGIN_PASSWORD");
  if (!email || !password) return null;
  if (!isDevAutoLoginEmailAllowed(email)) return null;
  return { email, password };
}

export type { DevAutoLoginCreds };

export async function withDevAuthTimeout<T>(p: Promise<T>, ms = DEV_AUTO_LOGIN_TIMEOUT_MS): Promise<T> {
  let timer = 0;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("AUTH_TIMEOUT")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}
