import type { ProfileRow } from "../../types";

/** Profile detail modal — create + single edit + bulk edit in one component (P0020 TwofaAccountDetailModal parity). */
export type ProfileDetailModalProps =
  | {
      mode: "create";
      onClose: () => void;
      onProfilesChanged?: () => void;
    }
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
