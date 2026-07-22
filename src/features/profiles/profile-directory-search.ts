import { matchesDirectoryIdSearch } from "@tool-workspace/hub-ui";
import type { ProfileRow } from "../../types";
import { extractProfileCode } from "../../lib/profile-code";

export { extractProfileCode };

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
