/** CS00001 … CS01500 store buyers — default E0001 + P0022 only (see hub-default-tool-access). */
export const HUB_CS_BUYER_LOGIN_MAX = 1500;

export function isHubCsBuyerLoginId(loginId: string | null | undefined): boolean {
  const raw = String(loginId ?? "").trim().toLowerCase();
  if (!/^cs\d+$/.test(raw)) return false;
  const digits = raw.slice(2).replace(/^0+/, "") || "0";
  const serial = Number(digits);
  return Number.isFinite(serial) && serial >= 1 && serial <= HUB_CS_BUYER_LOGIN_MAX;
}
