import { hubAccountDetailShellClass } from "@tool-workspace/hub-ui";

/** Shared ADM shell — P0020 Mail Account Detail golden pattern. */
const PROFILE_DETAIL_ADM_SHELL = hubAccountDetailShellClass({
  extra: "stealth-profile-detail-modal hub-tool-detail-modal--fit",
});

/** New profile — split main + note/log rail. */
export const PROFILE_FORM_MODAL_SHELL_CLASS = PROFILE_DETAIL_ADM_SHELL;

/** New profile — split main + log rail (bulk create activity). */
export const PROFILE_CREATE_MODAL_SHELL_CLASS = `${PROFILE_DETAIL_ADM_SHELL} hub-tool-detail-modal--split`;

/** Edit profile — ADM scaffold main + note/log rail. */
export const PROFILE_EDIT_MODAL_SHELL_CLASS = `${PROFILE_DETAIL_ADM_SHELL} hub-tool-detail-modal--split`;
