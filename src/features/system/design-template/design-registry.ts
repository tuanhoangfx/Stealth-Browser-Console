/** Active design reviews in System → Design Template (empty when all features are locked). */
export const ACTIVE_DESIGN_COUNT = 0;

/** Locked 2026-07-06 — Run History Design V1 Chip lanes. */
export const RUN_HISTORY_DESIGN_LOCK = "V1" as const;

/**
 * Locked 2026-07-30 — System Console = live RunLogs only (v1.0.154 SSOT).
 * Rule: `.cursor/rules/p0003-runtime-console-ssot.mdc` · test: `runtime-console-ssot.test.ts`
 */
export const RUNTIME_CONSOLE_LOG_SSOT_LOCK = "v1.0.154-live-runlogs" as const;

/** Locked 2026-07-06 — Workflow canvas Design V5 Spaced bezier flow. */
export const WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK = "V5" as const;

/**
 * Locked 2026-07-21 — Design V4 Digits only.
 * Native Chromium icon + Bold colored last3; 0xxx white, 1–9 vivid (`v4-digits-only-spaced8`).
 */
export const TASKBAR_PROFILE_BADGE_DESIGN_LOCK = "V4" as const;
