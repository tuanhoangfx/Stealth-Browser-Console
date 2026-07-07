import { useEffect, useRef, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { HubFormFieldLabel } from "./HubFormFieldLabel";
import { HubSearchField } from "./HubSearchField";

export type HubAdmNoteSearchBarProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  hasSearch: boolean;
  matchLabel: string;
  matchRangesLength: number;
  matchRevealed: boolean;
  onRevealFirst: () => void;
  onStepMatch: (delta: number) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  searchLabel?: string;
  placeholder?: string;
};

/** Golden note rail search row — label + filter + match navigation. */
export function HubAdmNoteSearchBar({
  searchQuery,
  onSearchQueryChange,
  hasSearch,
  matchLabel,
  matchRangesLength,
  matchRevealed,
  onRevealFirst,
  onStepMatch,
  inputRef: inputRefProp,
  searchLabel = "Search note",
  placeholder = "Filter in note…",
}: HubAdmNoteSearchBarProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const searchRef = inputRefProp ?? localRef;

  useEffect(() => {
    const el = searchRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!matchRangesLength) return;
      if (!matchRevealed) {
        onRevealFirst();
        return;
      }
      onStepMatch(e.shiftKey ? -1 : 1);
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [matchRangesLength, matchRevealed, onRevealFirst, onStepMatch, searchRef]);

  return (
    <div className="hub-adm-note-search-wrap">
      <HubFormFieldLabel icon={Search} iconClassName="text-indigo-300">
        {searchLabel}
      </HubFormFieldLabel>
      <div className="hub-adm-note-search" role="search">
        <HubSearchField
          value={searchQuery}
          onChange={onSearchQueryChange}
          placeholder={placeholder}
          showShortcutHint={false}
          inputRef={searchRef}
          className="hub-adm-note-search__field"
        />
        {hasSearch ? (
          <div className="hub-adm-note-search__nav">
            <span className="hub-adm-note-search__count" aria-live="polite">
              {matchLabel}
            </span>
            <button
              type="button"
              className="hub-adm-note-search__btn"
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
              disabled={!matchRangesLength || !matchRevealed}
              onClick={() => onStepMatch(-1)}
            >
              <ChevronUp size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="hub-adm-note-search__btn"
              aria-label="Next match"
              title="Next match (Enter)"
              disabled={!matchRangesLength}
              onClick={() => {
                if (!matchRevealed) {
                  onRevealFirst();
                  return;
                }
                onStepMatch(1);
              }}
            >
              <ChevronDown size={12} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
