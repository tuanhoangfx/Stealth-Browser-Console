import { COOKIE_BRIDGE_STORE_ID, SURFSHARK_STORE_ID } from "./stealth-extension-store-ids";

const MSG_KEY_RE = /^__MSG_(\w+)__$/;

/** Last-resort labels when manifest i18n was not resolved at cache read time. */
const EXTENSION_DISPLAY_NAME_FALLBACKS: Record<string, string> = {
  [COOKIE_BRIDGE_STORE_ID]: "E0001 Cookie Bridge",
  [SURFSHARK_STORE_ID]: "Surfshark VPN Extension",
};

export function isUnresolvedExtensionI18nName(name: string | undefined | null): boolean {
  const raw = String(name || "").trim();
  return MSG_KEY_RE.test(raw);
}

/** Renderer-safe display name — never show raw __MSG_* keys in UI. */
export function resolveExtensionDisplayName(input: {
  name?: string | null;
  storeId?: string | null;
  localKey?: string | null;
}): string {
  const raw = String(input.name || "").trim();
  if (raw && !MSG_KEY_RE.test(raw)) return raw;

  const id = String(input.storeId || input.localKey || "")
    .trim()
    .toLowerCase();
  if (id && EXTENSION_DISPLAY_NAME_FALLBACKS[id]) return EXTENSION_DISPLAY_NAME_FALLBACKS[id];

  const msgMatch = raw.match(MSG_KEY_RE);
  if (msgMatch) {
    const key = msgMatch[1]!.replace(/_/g, " ");
    if (/app\s*name/i.test(key) && id === SURFSHARK_STORE_ID) return "Surfshark VPN Extension";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  return raw || "Extension";
}
