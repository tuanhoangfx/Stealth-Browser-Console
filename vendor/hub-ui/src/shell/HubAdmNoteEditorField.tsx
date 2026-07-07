import { useCallback, useRef } from "react";
import { HubAdmNoteHighlightText } from "./HubAdmNoteHighlightText";
import { HubAdmNoteSearchBar } from "./HubAdmNoteSearchBar";
import { useHubAdmNoteSearch } from "./hubAdmNoteSearch";

export type HubAdmNoteEditorFieldProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  controlClassName?: string;
  rows?: number;
  searchLabel?: string;
  searchPlaceholder?: string;
};

/** Editable note rail — Search note + textarea with match mirror (P0020 Mail golden). */
export function HubAdmNoteEditorField({
  value,
  onChange,
  name = "hub-adm-note",
  placeholder = "Optional notes…",
  controlClassName = "field auth-gate-field hub-adm-note-textarea",
  rows = 8,
  searchLabel,
  searchPlaceholder,
}: HubAdmNoteEditorFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const syncBackdropScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!textarea || !backdrop) return;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }, []);

  const scrollToOffset = useCallback(
    (start: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 16;
      const linesBefore = value.slice(0, start).split("\n").length - 1;
      textarea.scrollTop = Math.max(0, linesBefore * lineHeight - textarea.clientHeight / 3);
      syncBackdropScroll();
    },
    [syncBackdropScroll, value],
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
  } = useHubAdmNoteSearch(value);

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
        placeholder={searchPlaceholder}
      />
      <div className="hub-adm-note-editor">
        {hasSearch && value ? (
          <div ref={backdropRef} className="hub-adm-note-editor__backdrop" aria-hidden>
            <span className="hub-adm-note-editor__mirror">
              <HubAdmNoteHighlightText
                text={value}
                ranges={matchRanges}
                activeIndex={mirrorActiveIndex}
              />
            </span>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className={`${controlClassName}${hasSearch && value ? " hub-adm-note-textarea--searching" : ""}`}
          name={name}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncBackdropScroll}
          rows={rows}
        />
      </div>
    </>
  );
}
