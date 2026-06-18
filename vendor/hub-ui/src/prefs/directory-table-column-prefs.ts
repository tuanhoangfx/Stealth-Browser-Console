export type DirectoryTableColumnItem<K extends string = string> = {
  key: K;
  label: string;
  /** Cannot be hidden in Settings. */
  required?: boolean;
};

export type DirectoryTableColumnPrefs<K extends string> = {
  read: () => Set<K>;
  write: (columns: Set<K>) => void;
  reset: () => void;
  changeEvent: string;
};

export function countHiddenDirectoryTableColumns<K extends string>(
  items: readonly DirectoryTableColumnItem<K>[],
  visible: Set<K>,
): number {
  return items.filter((c) => !visible.has(c.key)).length;
}

/** SSOT localStorage + CustomEvent for directory table column visibility. */
export function createDirectoryTableColumnPrefs<K extends string>(config: {
  storageKey: string;
  items: readonly DirectoryTableColumnItem<K>[];
  defaultKeys: ReadonlySet<K>;
  changeEvent: string;
  legacyAliases?: Partial<Record<string, K>>;
}): DirectoryTableColumnPrefs<K> {
  const allKeys = new Set(config.items.map((c) => c.key));
  const requiredKeys = config.items.filter((c) => c.required).map((c) => c.key);

  function normalizeKeys(parsed: string[]): Set<K> {
    const next = new Set(
      parsed
        .map((k) => config.legacyAliases?.[k] ?? k)
        .filter((k): k is K => allKeys.has(k as K)),
    );
    for (const key of requiredKeys) next.add(key);
    return next.size ? next : new Set(config.defaultKeys);
  }

  function read(): Set<K> {
    if (typeof window === "undefined") return new Set(config.defaultKeys);
    try {
      const raw = window.localStorage.getItem(config.storageKey);
      if (!raw) return new Set(config.defaultKeys);
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return new Set(config.defaultKeys);
      return normalizeKeys(parsed);
    } catch {
      return new Set(config.defaultKeys);
    }
  }

  function write(columns: Set<K>) {
    const next = new Set(columns);
    for (const key of requiredKeys) next.add(key);
    window.localStorage.setItem(config.storageKey, JSON.stringify([...next]));
    window.dispatchEvent(new CustomEvent(config.changeEvent));
  }

  function reset() {
    window.localStorage.removeItem(config.storageKey);
    window.dispatchEvent(new CustomEvent(config.changeEvent));
  }

  return {
    read,
    write,
    reset,
    changeEvent: config.changeEvent,
  };
}
