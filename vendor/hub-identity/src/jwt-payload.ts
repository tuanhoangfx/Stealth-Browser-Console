/**
 * Decode a JWT payload segment to a UTF-8 JSON string.
 *
 * Browser `atob` returns a binary string (one char per byte). Parsing that with
 * `JSON.parse` mojibakes non-ASCII claims (e.g. Vietnamese `full_name` → `Tráº§n…`).
 * Always re-decode bytes as UTF-8 before `JSON.parse`.
 */
export function decodeJwtPayloadBase64(segment: string): string {
  const normalized = String(segment ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!normalized) throw new Error("empty-jwt-payload");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  const nodeBuffer = (
    globalThis as {
      Buffer?: { from(data: string, enc: string): { toString(enc: string): string } };
    }
  ).Buffer;
  if (!nodeBuffer) throw new Error("no-base64-decoder");
  return nodeBuffer.from(padded, "base64").toString("utf8");
}

/** Parse JWT payload JSON. Missing/malformed → null. */
export function parseJwtPayload(accessToken: string | null | undefined): Record<string, unknown> | null {
  const token = String(accessToken ?? "").trim();
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const parsed = JSON.parse(decodeJwtPayloadBase64(part)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
