import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import { HubTableColumnHeader } from "../content/HubTableColumnHeader";

/** Subsection label inside account-detail panels — same icon + label pattern as table headers. */
export function HubAdmSectionLabel({ header }: { header: HubTableColumnHeaderProps }) {
  return (
    <div className="hub-adm-section-label">
      <span className="hub-adm-section-label__inner hub-users-th-label hub-users-th-label--start">
        <HubTableColumnHeader {...header} />
      </span>
    </div>
  );
}
