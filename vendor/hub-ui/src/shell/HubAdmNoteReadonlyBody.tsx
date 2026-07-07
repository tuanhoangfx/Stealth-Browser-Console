import { useCallback, useRef } from "react";
import { HubAdmNoteHighlightText } from "./HubAdmNoteHighlightText";
import { HubAdmNoteSearchBar } from "./HubAdmNoteSearchBar";
import { useHubAdmNoteSearch } from "./hubAdmNoteSearch";

export type HubAdmNoteReadonlyBodyProps = {
  note: string;
  emptyMessage?: string;
  searchLabel?: string;
  placeholder?: string;
};

/** Read-only note rail body — Search note + in-note filter (P0020 Mail golden). */
export function HubAdmNoteReadonlyBody({
  note,
  emptyMessage = "No notes.",
  searchLabel,
  placeholder,
}: HubAdmNoteReadonlyBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const text = note.trim();

  const scrollToOffset = useCallback(
    (start: number) => {
      const el = bodyRef.current;
      if (!el) return;
      const lineHeight = 16;
      const linesBefore = text.slice(0, start).split("\n").length - 1;
      el.scrollTop = Math.max(0, linesBefore * lineHeight - el.clientHeight / 3);
    },
    [text],
  );

  const refocusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const {
    searchQuery,
    setSearchQuery,
    matchRevealed,
    matchRanges,
    hasSearch,
    mirrorActiveIndex,
    matchLabel,
    revealMatch,
    stepMatch,
  } = useHubAdmNoteSearch(text);

  const onRevealFirst = useCallback(() => {
    revealMatch(0, scrollToOffset);
    refocusSearch();
  }, [refocusSearch, revealMatch, scrollToOffset]);

  const onStepMatch = useCallback(
    (delta: number) => {
      stepMatch(delta, scrollToOffset);
      refocusSearch();
    },
    [refocusSearch, scrollToOffset, stepMatch],
  );

  return (
    <>
      <HubAdmNoteSearchBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        hasSearch={hasSearch}
        matchLabel={matchLabel}
        matchRangesLength={matchRanges.length}
        matchRevealed={matchRevealed}
        onRevealFirst={onRevealFirst}
        onStepMatch={onStepMatch}
        inputRef={searchRef}
        searchLabel={searchLabel}
        placeholder={placeholder}
      />
      <div ref={bodyRef} className="hub-adm-note-readonly-body">
        {text ? (
          <HubAdmNoteHighlightText text={text} ranges={matchRanges} activeIndex={mirrorActiveIndex} />
        ) : (
          <span className="text-[var(--muted)]">{emptyMessage}</span>
        )}
      </div>
    </>
  );
}
