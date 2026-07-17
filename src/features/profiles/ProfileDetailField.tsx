import type { ComponentProps } from "react";
import {
  HubAdmClickEditField,
  HubAdmClickFilterField,
  HubAdmInlineFieldLabel,
} from "@tool-workspace/hub-ui";
import { profileFormFieldHeaderProps, profileFormFieldLabel } from "../../lib/profile-form-field-meta";
import { stealthFormFieldHintContent, type StealthFormFieldKey } from "../../lib/stealth-directory-column-hints";

export const PROFILE_ADM_CONTROL_CLASS = "field auth-gate-field stealth-adm-control";

/** Golden 3-slot aligned row — hub-account-detail-modal.css SSOT (P0020 parity). */
export const PROFILE_DETAIL_FORM_ROW_ALIGNED_3 =
  "hub-adm-form-row hub-adm-form-row--aligned twofa-adm-form-row--aligned";

type ClickEditProps = Omit<ComponentProps<typeof HubAdmClickEditField>, "header" | "fieldLabel" | "labelHint"> & {
  fieldKey: StealthFormFieldKey;
};

export function ProfileDetailClickEditField({ fieldKey, controlClassName, ...rest }: ClickEditProps) {
  return (
    <HubAdmClickEditField
      header={profileFormFieldHeaderProps(fieldKey)}
      fieldLabel={profileFormFieldLabel(fieldKey)}
      labelHint={stealthFormFieldHintContent(fieldKey)}
      controlClassName={controlClassName ?? PROFILE_ADM_CONTROL_CLASS}
      {...rest}
    />
  );
}

type ClickFilterProps = Omit<ComponentProps<typeof HubAdmClickFilterField>, "header" | "fieldLabel" | "labelHint"> & {
  fieldKey: StealthFormFieldKey;
};

export function ProfileDetailClickFilterField({ fieldKey, ...rest }: ClickFilterProps) {
  return (
    <HubAdmClickFilterField
      header={profileFormFieldHeaderProps(fieldKey)}
      fieldLabel={profileFormFieldLabel(fieldKey)}
      labelHint={stealthFormFieldHintContent(fieldKey)}
      {...rest}
    />
  );
}

/** Full-width multiline row (label col 1 · value cols 2–6) */
export const PROFILE_DETAIL_FORM_ROW_DETAIL_LINE = `${PROFILE_DETAIL_FORM_ROW_ALIGNED_3} hub-adm-form-row--detail-line`;

export function ProfileDetailInlineFieldLabel({ fieldKey }: { fieldKey: StealthFormFieldKey }) {
  return (
    <HubAdmInlineFieldLabel
      header={profileFormFieldHeaderProps(fieldKey)}
      labelHint={stealthFormFieldHintContent(fieldKey)}
    />
  );
}
