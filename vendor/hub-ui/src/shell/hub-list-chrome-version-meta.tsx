import React, { type ReactNode } from "react";
import type { TabHeaderMetaItem } from "./AppTabHeader";

/** Merge release-notes badge with any existing version `after` control (Update/Download). */
export function mergeHubListVersionMetaAfter(
  first: TabHeaderMetaItem,
  releaseNotesAfter: ReactNode,
): TabHeaderMetaItem {
  const existingAfter = first.after;
  if (!releaseNotesAfter) return first;
  if (!existingAfter) return { ...first, after: releaseNotesAfter };
  return {
    ...first,
    after: (
      <span className="inline-flex shrink-0 items-center gap-1">
        {existingAfter}
        {releaseNotesAfter}
      </span>
    ),
  };
}

/** Apply release-notes badge to the first meta item when code is set. */
export function applyHubListVersionReleaseNotesMeta(
  metaItems: TabHeaderMetaItem[],
  releaseNotesAfter: ReactNode | null,
): TabHeaderMetaItem[] {
  if (!releaseNotesAfter || !metaItems[0]) return metaItems;
  return [mergeHubListVersionMetaAfter(metaItems[0], releaseNotesAfter), ...metaItems.slice(1)];
}
