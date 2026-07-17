import type { ReactNode } from "react";
import type { HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import { HubAdmReadonlyField } from "./HubAdmClickEditField";
import { hubAdmSectionBlockClass } from "./hubAdmSectionHeaders";
import { HUB_RECORD_META_FIELD_HEADERS } from "./hubRecordMeta";

export type HubAdmRecordMetaRowProps = {
  vaultId: ReactNode;
  created: ReactNode;
  updated: ReactNode;
  className?: string;
  vaultIdHint?: HubDirectoryColumnHintContent;
  createdHint?: HubDirectoryColumnHintContent;
  updatedHint?: HubDirectoryColumnHintContent;
};

/**
 * Fixed record metadata row — Created · Update · Vault ID (standalone frame).
 * Place above domain sections (Order / Customer SSOT); no section heading.
 */
export function HubAdmRecordMetaRow({
  vaultId,
  created,
  updated,
  className = "",
  vaultIdHint,
  createdHint,
  updatedHint,
}: HubAdmRecordMetaRowProps) {
  return (
    <div className={`${hubAdmSectionBlockClass("record")} hub-adm-record-meta-row${className ? ` ${className}` : ""}`}>
      <div className="hub-adm-section-block__rows">
        <div className="hub-adm-form-row hub-adm-form-row--3 hub-adm-form-row--aligned hub-adm-meta-row">
          <HubAdmReadonlyField
            header={HUB_RECORD_META_FIELD_HEADERS.created}
            labelHint={createdHint}
            valueLayout="inline"
          >
            {created}
          </HubAdmReadonlyField>
          <HubAdmReadonlyField
            header={HUB_RECORD_META_FIELD_HEADERS.updated}
            labelHint={updatedHint}
            valueLayout="inline"
          >
            {updated}
          </HubAdmReadonlyField>
          <HubAdmReadonlyField
            header={HUB_RECORD_META_FIELD_HEADERS.vaultId}
            labelHint={vaultIdHint}
            valueLayout="inline"
          >
            {vaultId}
          </HubAdmReadonlyField>
        </div>
      </div>
    </div>
  );
}
