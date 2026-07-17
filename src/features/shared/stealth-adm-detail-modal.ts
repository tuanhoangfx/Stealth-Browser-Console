import { hubAccountDetailShellClass } from "@tool-workspace/hub-ui";

/** Layout 3 ADM detail modal — Profile / Extension / future tool modals (P0020 golden). */
const STEALTH_ADM_DETAIL_MODAL_BASE = hubAccountDetailShellClass({
  extra: "stealth-adm-detail-modal stealth-profile-detail-modal",
});

/** Edit / fill-height detail — TOC · scrollable main · History + Console rail (50/50). */
export const STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS = `${STEALTH_ADM_DETAIL_MODAL_BASE} hub-tool-detail-modal--split`;

/** Create / compact fit + split main + log rail. */
export const STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS = `${STEALTH_ADM_DETAIL_MODAL_BASE} hub-tool-detail-modal--fit hub-tool-detail-modal--split stealth-profile-create-modal`;
