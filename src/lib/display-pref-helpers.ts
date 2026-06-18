/** Coalesce stored pref Set with defaults when URL param is absent. */
export function coalescePrefSet(set: Set<string> | null, defaults: Set<string>): Set<string> {
  return set ?? defaults;
}

/** Hub-UI hub-display-visibility parity — local copy avoids vendor index export drift. */
export function defaultsForPrefItems(allItems: readonly { key: string }[], defaults?: Set<string>) {
  return defaults ?? new Set(allItems.map((item) => item.key));
}

export function isHubPrefVisible(set: Set<string> | null, defaults: Set<string>, key: string) {
  return set === null ? defaults.has(key) : set.has(key);
}
