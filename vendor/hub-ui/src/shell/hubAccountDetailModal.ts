/** Shell class — wide 3-frame account detail (TOC · main scroll · log rail). */
export const HUB_ACCOUNT_DETAIL_MODAL_SHELL_CLASS = "hub-account-detail-modal";

/** Shared ADM form context — detail modal + add modal (glow tokens, click-edit grid). */
export const HUB_ADM_FORM_SHELL_CLASS = "hub-adm-form-shell";

/** Preset — softer hairline glow (multiply token alphas via --hub-adm-glow-strength). */
export const HUB_ADM_GLOW_SUBTLE_CLASS = "hub-adm-glow--subtle";

/** CSS custom properties for ADM field glow — set on `.hub-account-detail-modal` / `.hub-add-modal`. */
export const HUB_ADM_GLOW_CSS_VARS = {
  strength: "--hub-adm-glow-strength",
  rgb: "--hub-adm-glow-rgb",
  accentRgb: "--hub-adm-glow-accent-rgb",
  hoverBg: "--hub-adm-glow-hover-bg",
  hoverRing: "--hub-adm-glow-hover-ring",
  editBg: "--hub-adm-glow-edit-bg",
  editRing: "--hub-adm-glow-edit-ring",
  focusBorder: "--hub-adm-glow-focus-border",
  focusBg: "--hub-adm-glow-focus-bg",
  focusRing: "--hub-adm-glow-focus-ring",
  sectionGlow: "--hub-adm-section-glow",
} as const;

/** Mono accent tier — TOTP code, vault ID (12px semibold). */
export const HUB_ADM_TYPE_MONO_CLASS = "hub-adm-type-mono";

/** Nav tier — panel/rail heads + TOC labels (12px semibold via `HUB_ADM_TYPE_NAV_CLASS`). */
export const HUB_ADM_TYPE_NAV_CLASS = "hub-adm-type-nav";

/** CSS custom properties for ADM typography — set on `.hub-account-detail-modal` / `.hub-add-modal`. */
export const HUB_ADM_TYPE_CSS_VARS = {
  size: "--hub-adm-type-size",
  line: "--hub-adm-type-line",
  labelWeight: "--hub-adm-type-label-weight",
  valueWeight: "--hub-adm-type-value-weight",
  monoWeight: "--hub-adm-type-mono-weight",
  labelColor: "--hub-adm-type-label-color",
  valueColor: "--hub-adm-type-value-color",
  mutedColor: "--hub-adm-type-muted-color",
  navSize: "--hub-adm-type-nav-size",
  navWeight: "--hub-adm-type-nav-weight",
  navLine: "--hub-adm-type-nav-line",
  navColor: "--hub-adm-type-nav-color",
} as const;

export const HUB_ADM_FORM_ROW_CODE_LINE_CLASS = "hub-adm-form-row--code-line";

/** Preserve 3-col grid height when slot 2+3 empty (1 field in row). */
export const HUB_ADM_GRID_SLOT_SPACER_CLASS = "hub-adm-grid-slot-spacer";

/** Preserve 3-col grid height when only slot 3 empty (2 fields in row). */
export const HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS = "hub-adm-grid-slot-spacer hub-adm-grid-slot-spacer--tail";

/** Main column scroll container inside HubToolDetailSplitLayout. */
export const HUB_ACCOUNT_DETAIL_MAIN_SCROLL_CLASS = "hub-account-detail-modal__main-scroll hub-scrollbar";

/** TOC spy + section jump target (main column only — not log rail). */
export const HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT = ".hub-account-detail-modal__main-scroll";
