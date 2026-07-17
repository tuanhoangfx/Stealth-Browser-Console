import type { ProfileRow } from "../../types";

/** Profile detail modal — single + bulk in one component (P0020 TwofaAccountDetailModal parity). */
export type ProfileDetailModalProps =
  | {
      mode: "edit";
      profile: ProfileRow;
      onClose: () => void;
      onProfilesChanged?: () => void;
    }
  | {
      mode: "bulk";
      profiles: ProfileRow[];
      onClose: () => void;
      onProfilesChanged?: () => void;
    };
