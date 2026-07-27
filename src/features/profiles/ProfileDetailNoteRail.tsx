import { HubAdmNoteRail } from "@tool-workspace/hub-ui";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { PROFILE_DETAIL_NOTE_LABEL, PROFILE_DETAIL_SECTION_NOTE } from "./profile-detail-toc";

/** Profile detail top rail — Note editor (replaces Run History; Create modal parity). */
export function ProfileDetailNoteRail({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <HubAdmNoteRail
      id={PROFILE_DETAIL_SECTION_NOTE}
      mode="editor"
      title={PROFILE_DETAIL_NOTE_LABEL}
      titleEmoji={PROFILE_MODAL_SECTION_STICKER.note}
      className="stealth-profile-adm-rail--note stealth-profile-detail-note-rail"
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? "Profile notes, credentials hints, proxy labels…"}
      controlClassName="field auth-gate-field hub-adm-note-textarea"
    />
  );
}
