import { matchesDirectoryIdSearch } from "@tool-workspace/hub-ui";
import type { ProfileRow } from "../types";

/** Trailing profile code — mirrors `electron/lib/profile-identity.cjs`. */
export function extractProfileCode(name: string, id = ""): string {
  const trimmed = String(name || "").trim();
  const tail = trimmed.match(/(\d{3,5})\s*$/);
  if (tail) return tail[1]!;
  const any = trimmed.match(/(\d+)/);
  if (any) return any[1]!.slice(-4);
  return String(id).replace(/-/g, "").slice(0, 4) || "0000";
}

export function profileTextBlob(profile: ProfileRow): string {
  return [profile.name, profile.groupName ?? "", profile.proxy ?? "", profile.startupUrl ?? "", profile.note ?? ""]
    .join("\u0001")
    .toLowerCase();
}

export function matchesProfileDirectorySearch(profile: ProfileRow, searchTerm: string): boolean {
  return matchesDirectoryIdSearch(
    { idText: extractProfileCode(profile.name, profile.id), textBlob: profileTextBlob(profile) },
    searchTerm,
    { mixedRequiresWhitespace: true },
  );
}
