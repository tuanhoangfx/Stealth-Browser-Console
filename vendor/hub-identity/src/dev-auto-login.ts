/** Dev-only silent sign-in on localhost — credentials via VITE_* or NEXT_PUBLIC_* in .env.local */

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

/** Next.js only inlines static process.env.NEXT_PUBLIC_* references. */
function readNextPublicDevAutoLoginEmail(): string {
  const val = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL;
  return val != null && String(val).trim() ? String(val).trim() : "";
}

function readNextPublicDevAutoLoginPassword(): string {
  const val = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD;
  return val != null && String(val).trim() ? String(val).trim() : "";
}

function readNextPublicDevAutoLoginAllowedEmail(): string {
  const val = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_ALLOWED_EMAIL;
  return val != null && String(val).trim() ? String(val).trim() : "";
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

export function isDevAutoLoginEnabled(hostname?: string): boolean {
  return isBundlerDev() && isDevLocalHost(hostname);
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
