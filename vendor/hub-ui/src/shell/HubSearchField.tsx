import { Search, X } from "lucide-react";
import { startTransition, useEffect, useRef, useState, type Ref } from "react";
import { HUB_MODAL_SEARCH_ATTR } from "../keyboard/hub-modal-search";
import { HUB_NO_SPELLCHECK_PROPS } from "../lib/no-spellcheck";
import { compactIconSize } from "../ui-scale";

export type HubSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Show `F` focus hint when empty (directory FilterBar). Off in modals. */
  showShortcutHint?: boolean;
  /** Ignored — P0020 shell never animates the search icon. */
  queryPending?: boolean;
  /** Keyboard focus scope — FilterBar registers shortcuts when embedded. */
  shortcutScope?: string;
  /** Debounce parent onChange — keeps draft local so directory chrome does not re-render per keystroke. */
  debounceMs?: number;
  /** When true, tags input for global modal `F` shortcut (`data-hub-modal-search`). */
  modalSearch?: boolean;
};

/** Golden directory search input — P0004 FilterBar row-1 (shared across tools). */
export function HubSearchField({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  inputRef,
  showShortcutHint = true,
  debounceMs = 0,
  modalSearch = false,
}: HubSearchFieldProps) {
  const debounced = debounceMs > 0;
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!debounced) return;
    if (value !== draftRef.current) {
      setDraft(value);
    }
  }, [debounced, value]);

  useEffect(() => {
    if (!debounced) return;
    const id = window.setTimeout(() => startTransition(() => onChange(draft)), debounceMs);
    return () => window.clearTimeout(id);
  }, [debounced, debounceMs, draft, onChange]);

  const displayValue = debounced ? draft : value;

  const setDisplayValue = (next: string, flush = false) => {
    if (debounced) {
      setDraft(next);
      if (flush || next === "") onChange(next);
      return;
    }
    onChange(next);
  };

  return (
    <div className={`relative min-w-[var(--hub-search-min-w)] flex-1 ${className}`.trim()}>
      <Search
        size={compactIconSize(14)}
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        {...HUB_NO_SPELLCHECK_PROPS}
        name="hub-directory-search"
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        placeholder={placeholder}
        className="field h-[var(--hub-control-h)] w-full min-w-0 text-xs"
        style={{ paddingLeft: 31, paddingRight: displayValue ? 25 : 36 }}
        aria-label={placeholder}
        role="searchbox"
        {...(modalSearch ? { [HUB_MODAL_SEARCH_ATTR]: "" } : {})}
      />
      {showShortcutHint && !displayValue ? (
        <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:flex">
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200/90">
            F
          </kbd>
        </span>
      ) : null}
      {displayValue ? (
        <button
          type="button"
          onClick={() => setDisplayValue("", true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
          aria-label="Clear search"
        >
          <X size={compactIconSize(12)} />
        </button>
      ) : null}
    </div>
  );
}
