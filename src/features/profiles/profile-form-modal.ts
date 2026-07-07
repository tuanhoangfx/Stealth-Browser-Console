/** Shared HubToolDetailModal shell — New profile forms (wide + Note/Log rail). */
export const PROFILE_FORM_MODAL_SHELL_CLASS =
  "hub-add-modal stealth-profile-create-modal stealth-profile-detail-modal hub-tool-detail-modal--fit";

/** New profile — split main + log rail (bulk create activity). */
export const PROFILE_CREATE_MODAL_SHELL_CLASS =
  `${PROFILE_FORM_MODAL_SHELL_CLASS} hub-tool-detail-modal--split`;

/** Edit profile — P0006 Job detail parity: split main + log rail. */
export const PROFILE_EDIT_MODAL_SHELL_CLASS =
  `${PROFILE_FORM_MODAL_SHELL_CLASS} hub-tool-detail-modal--split hub-account-detail-modal`;
