import { StickyNote } from "lucide-react";

export function ProfileDetailNoteRail({
  note,
  onNoteChange,
  notePlaceholder = "Profile notes, credentials hints, proxy labels…",
}: {
  note: string;
  onNoteChange: (value: string) => void;
  notePlaceholder?: string;
}) {
  return (
    <section className="stealth-profile-adm-rail stealth-profile-adm-rail--note" aria-label="Note">
      <div className="stealth-profile-adm-rail__head">
        <StickyNote size={12} aria-hidden />
        Note
      </div>
      <div className="stealth-profile-adm-rail__body stealth-profile-adm-rail__body--note">
        <textarea
          className="field stealth-profile-adm-note-textarea"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={notePlaceholder}
          spellCheck={false}
        />
      </div>
    </section>
  );
}
