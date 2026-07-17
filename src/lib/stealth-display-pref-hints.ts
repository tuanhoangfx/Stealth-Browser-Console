import type { PrefItem } from "@tool-workspace/hub-ui";
import {
  stealthDisplayPrefHintContent,
  type StealthDisplayPrefKey,
  type StealthDisplayPrefScope,
} from "./stealth-directory-column-hints";

function withDisplayPrefHints(
  items: PrefItem[],
  scope: StealthDisplayPrefScope,
): PrefItem[] {
  return items.map((item) => ({
    ...item,
    labelHint: stealthDisplayPrefHintContent(item.key as StealthDisplayPrefKey, scope, item.label),
  }));
}

export function stealthProfilesDisplayPrefItems(items: PrefItem[]): PrefItem[] {
  return withDisplayPrefHints(items, "profiles");
}

export function stealthWorkflowDisplayPrefItems(items: PrefItem[]): PrefItem[] {
  return withDisplayPrefHints(items, "workflow");
}
