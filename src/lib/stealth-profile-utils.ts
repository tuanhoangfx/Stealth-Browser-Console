export const PROXY_PRESETS = [
  { id: "local", label: "Local IP", value: "" },
  { id: "http", label: "HTTP proxy", value: "http://user:pass@host:port" },
  { id: "socks5", label: "SOCKS5 proxy", value: "socks5://user:pass@host:port" }
] as const;

/** Parse host:port:user:pass or full URL into a proxy string for CloakBrowser. */
export function parseProxyLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.includes("://")) return trimmed;

  const parts = trimmed.split(":");
  if (parts.length >= 4) {
    const host = parts[0]!;
    const port = parts[1]!;
    const user = parts[2]!;
    const pass = parts.slice(3).join(":");
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${parts[0]}:${parts[1]}`;
  }
  return trimmed;
}

/** Dummy sample for parseProxyLine docs/tests — never a real endpoint. */
export const PROXY_TEST_LINE = "203.0.113.10:8080:user:pass";
export const PROXY_TEST_URL = parseProxyLine(PROXY_TEST_LINE);

export function randomFingerprintSeed() {
  return Math.floor(10000 + Math.random() * 89999);
}

/** Filesystem-safe profile label for export/download basenames. */
export function sanitizeProfileExportBasename(name: string) {
  const token = String(name || "profile")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return token || "profile";
}

/** Local timestamp token for export filenames — `YYYY-MM-DD_HH-mm-ss`. */
export function profileExportTimestampToken(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Export basename — one profile: `{Name}_{timestamp}.ext`; many: `{First}_+{n-1}_{timestamp}.ext`.
 * Empty names → `all-profiles_{timestamp}.ext`.
 */
export function buildProfileExportFilename(profileNames: string[], ext: "json" | "zip") {
  const ts = profileExportTimestampToken();
  const names = profileNames.map(sanitizeProfileExportBasename).filter(Boolean);
  let base: string;
  if (names.length === 0) base = "all-profiles";
  else if (names.length === 1) base = names[0]!;
  else base = `${names[0]!}_+${names.length - 1}`;
  return `${base}_${ts}.${ext}`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatRunDuration(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRunTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
