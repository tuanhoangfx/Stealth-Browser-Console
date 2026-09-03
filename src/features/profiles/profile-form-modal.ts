import {
  STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS,
  STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS,
} from "../shared/stealth-adm-detail-modal";

/** Legacy alias — prefer CREATE / EDIT constants below. */
export const PROFILE_FORM_MODAL_SHELL_CLASS = STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS;

/** New profile — Layout 3 box (same as Edit) + split main + log rail. */
export const PROFILE_CREATE_MODAL_SHELL_CLASS = STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS;

/** Edit profile — fill height + scrollable main (no --fit; avoids section overlap). */
export const PROFILE_EDIT_MODAL_SHELL_CLASS = STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS;
