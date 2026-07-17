import type { ProfileRow } from "../../types";
import { ProfileDetailModal } from "./ProfileDetailModal";

/** @deprecated Use ProfileDetailModal — kept for smoke/import parity. */
export function EditProfileModal({
  profile,
  onClose,
  onProfilesChanged,
}: {
  profile: ProfileRow;
  onClose: () => void;
  onProfilesChanged?: () => void;
}) {
  return (
    <ProfileDetailModal mode="edit" profile={profile} onClose={onClose} onProfilesChanged={onProfilesChanged} />
  );
}
